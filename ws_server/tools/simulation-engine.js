"use strict";

// ─── SIMULATION ENGINE ────────────────────────────────────────────────────────
// Manages virtual wallets per exchange and executes simulated arbitrage trades.
// State is persisted in Redis so P&L history survives server restarts.

const { recordTradeResult, getSessionState } = require("./risk-engine");

const REDIS_KEY_WALLETS = "sim:wallets";
const REDIS_KEY_TRADES = "sim:trades";
const MAX_TRADE_LOG = 200;

const fixMath = (num) => Math.round(num * 10000) / 10000;

// Starting USD balance per exchange for fresh simulation
// 1000 * 10 exchanges (excl. RektSwap) = exactly 10000 USD total starting capital
const INITIAL_USD_PER_EXCHANGE = 1000;

const EXCHANGES = [
  "Binance",
  "Kraken",
  "Coinbase",
  "OKX",
  "Bitfinex",
  "Bybit",
  "Gateio",
  "Gemini",
  "Bitstamp",
  "Kucoin",
  "RektSwap",
];

// ─── IN-MEMORY MIRRORS ────────────────────────────────────────────────────────
// We cache wallets in RAM for zero-latency reads on every arbitrage check.
// Redis is synced after each write for persistence.
let walletsCache = null;
let tradesCache = [];
let redisRef = null;

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
async function init(redisClient) {
  redisRef = redisClient;

  // Force fresh simulation state on every server boot
  walletsCache = buildFreshWallets();
  await persistWallets();

  tradesCache = [];
  await redisClient.del(REDIS_KEY_TRADES);

  console.log(
    "[SIM] Clean startup: virtual wallets reset and trade history cleared to 0.",
  );
}

function buildFreshWallets() {
  const wallets = {};
  EXCHANGES.forEach((ex) => {
    wallets[ex] = { USD: fixMath(INITIAL_USD_PER_EXCHANGE), BTC: 0 };
  });
  return wallets;
}

async function persistWallets() {
  if (redisRef) {
    await redisRef.set(REDIS_KEY_WALLETS, JSON.stringify(walletsCache));
  }
}

// ─── EXECUTE ──────────────────────────────────────────────────────────────────
// Simulates a buy on exchangeA and sell on exchangeB.
// Handles partial fills when wallet balance is insufficient.
async function execute(opportunity, rules = {}) {
  if (!walletsCache)
    return { status: "ERROR", reason: "Wallets not initialized" };

  const buyEx = opportunity.buyExchange;
  const sellEx = opportunity.sellExchange;
  const buyPr = opportunity.buyPrice;
  const sellPr = opportunity.sellPrice;
  const vol = opportunity.volume;
  const profit = opportunity.profitUSD;
  const id = opportunity.id;

  const buyWallet = walletsCache[buyEx];
  const sellWallet = walletsCache[sellEx];

  if (!buyWallet || !sellWallet) {
    return {
      status: "REJECTED",
      reason: `Unknown exchange: ${buyEx} or ${sellEx}`,
    };
  }

  // Exposure cap
  const maxExposure = rules.maxExposureUSD || Infinity;
  const maxBtcFromExposure = maxExposure / buyPr;

  // Liquidity constraints
  const maxBtcFromBuyUSD = buyWallet.USD / buyPr;
  const maxBtcFromSellBTC = sellWallet.BTC;

  // Seed BTC on sell side if needed
  if (sellWallet.BTC === 0) {
    sellWallet.BTC = fixMath((INITIAL_USD_PER_EXCHANGE * 0.1) / sellPr);
  }

  const executableVol = Math.min(
    vol,
    maxBtcFromExposure,
    maxBtcFromBuyUSD,
    sellWallet.BTC,
  );

  if (executableVol <= 0) {
    return {
      status: "REJECTED",
      reason: "Insufficient liquidity in virtual wallets",
    };
  }

  // HFT mode: always execute at full volume immediately
  // No partial fills - use requested volume or nothing
  const isRektLoss =
    (buyEx === "RektSwap" || sellEx === "RektSwap") && Math.random() < 0.2;

  // Force FULL FILL for HFT - execute at exact market price
  let status = "FILLED";
  if (isRektLoss) status = "REKT";

  // Fees
  const feeRateBuy = 0.001,
    feeRateSell = 0.001;
  const buyCostUSD = fixMath(executableVol * buyPr * (1 + feeRateBuy));
  let sellGainUSD = fixMath(executableVol * sellPr * (1 - feeRateSell));

  if (isRektLoss) {
    const haircut = 0.991 + Math.random() * 0.005; // 0.991 to 0.996
    sellGainUSD = fixMath(buyCostUSD * haircut);
  }

  const feesUSD = fixMath(
    executableVol * buyPr * feeRateBuy + executableVol * sellPr * feeRateSell
  );
  // HFT: minimal slippage (0.001% = near-zero for high-frequency)
  const slippageUSD = fixMath(buyPr * executableVol * 0.00001);
  const netProfitUSD = fixMath(sellGainUSD - buyCostUSD - slippageUSD);

  // Update wallets
  buyWallet.USD = fixMath(buyWallet.USD - buyCostUSD);
  buyWallet.BTC = fixMath(buyWallet.BTC + executableVol);
  sellWallet.BTC = fixMath(sellWallet.BTC - executableVol);
  sellWallet.USD = fixMath(sellWallet.USD + sellGainUSD);

  await persistWallets();

  // Build trade record
  const trade = {
    id,
    buyExchange: buyEx,
    sellExchange: sellEx,
    buyPrice: parseFloat(buyPr.toFixed(2)),
    sellPrice: parseFloat(sellPr.toFixed(2)),
    volumeBTC: parseFloat(executableVol.toFixed(6)),
    grossProfitUSD: parseFloat((sellGainUSD - buyCostUSD).toFixed(4)),
    feesUSD: parseFloat(feesUSD.toFixed(4)),
    slippageUSD: parseFloat(slippageUSD.toFixed(4)),
    netProfitUSD: parseFloat(netProfitUSD.toFixed(4)),
    status,
    timestamp: Date.now(),
  };

  // Persist to Redis
  tradesCache.unshift(trade);
  if (tradesCache.length > MAX_TRADE_LOG) tradesCache.pop();
  if (redisRef) {
    await redisRef.lpush(REDIS_KEY_TRADES, JSON.stringify(trade));
    await redisRef.ltrim(REDIS_KEY_TRADES, 0, MAX_TRADE_LOG - 1);
  }

  // Record result
  recordTradeResult(netProfitUSD);

  if (isRektLoss) {
    console.log(
      `⚠️ [SIM] [REKT LOSS INJECTED] RektSwap txn failed! Net: $${netProfitUSD.toFixed(2)}`,
    );
  } else {
    console.log(
      `[SIM] ${status} | ${buyEx} → ${sellEx} | Vol: ${executableVol.toFixed(5)} BTC | Net: $${netProfitUSD.toFixed(2)}`,
    );
  }
  return trade;
}

// ─── GETTERS ──────────────────────────────────────────────────────────────────
function getWallets() {
  return walletsCache || {};
}

function getTradeLog() {
  return tradesCache.slice(0, 100);
}

function getPnLSummary() {
  const session = getSessionState();
  const totalNet = tradesCache.reduce(
    (sum, t) => sum + (t.netProfitUSD || 0),
    0,
  );
  const totalFees = tradesCache.reduce((sum, t) => sum + (t.feesUSD || 0), 0);
  const wins = tradesCache.filter((t) => t.netProfitUSD > 0).length;
  const losses = tradesCache.filter((t) => t.netProfitUSD <= 0).length;
  const winRate =
    tradesCache.length > 0 ? (wins / tradesCache.length) * 100 : 0;

  let totalWalletUSD = 0;
  if (walletsCache) {
    Object.keys(walletsCache).forEach((ex) => {
      if (ex !== "RektSwap") {
        totalWalletUSD += walletsCache[ex].USD;
      }
    });
  }

  return {
    totalNetUSD: parseFloat(totalNet.toFixed(2)),
    totalFeesUSD: parseFloat(totalFees.toFixed(2)),
    totalTrades: tradesCache.length,
    wins,
    losses,
    winRatePercent: parseFloat(winRate.toFixed(1)),
    dailyPnL: parseFloat(session.dailyPnL.toFixed(2)),
    consecutiveLosses: session.consecutiveLosses,
    totalBalanceUSD: parseFloat(totalWalletUSD.toFixed(2)),
    blockedTradesCount: session.blockedTradesCount || 0,
    totalRiskSavedUSD: parseFloat((session.totalRiskSavedUSD || 0).toFixed(2)),
  };
}

async function resetWallets() {
  walletsCache = buildFreshWallets();
  tradesCache = [];
  if (redisRef) {
    await redisRef.set(REDIS_KEY_WALLETS, JSON.stringify(walletsCache));
    await redisRef.del(REDIS_KEY_TRADES);
  }
  console.log("[SIM] Wallets and trade log reset.");
}

module.exports = {
  init,
  execute,
  getWallets,
  getTradeLog,
  getPnLSummary,
  resetWallets,
};
