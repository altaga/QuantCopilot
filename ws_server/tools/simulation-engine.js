
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
// 50000 * 10 exchanges = 500,000 USD total starting capital
const INITIAL_USD_PER_EXCHANGE = 50000;

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
const tradesCache = new Array(MAX_TRADE_LOG).fill(null);
let tradeIndex = 0;
let tradeCount = 0;
let redisRef = null;

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
async function init(redisClient) {
  redisRef = redisClient;

  // Force fresh simulation state on every server boot
  walletsCache = buildFreshWallets();
  await persistWallets();

  tradesCache.fill(null);
  tradeIndex = 0;
  tradeCount = 0;
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
async function execute(opportunity, rules = {}, globalExchangeFees = {}) {
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
    sellWallet.BTC = fixMath((INITIAL_USD_PER_EXCHANGE * 0.5) / sellPr);
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

  // Force FULL FILL for HFT - execute at exact market price
  let status = "FILLED";

  // Fees
  const feeRateBuy = globalExchangeFees[buyEx]?.taker || 0.002;
  const feeRateSell = globalExchangeFees[sellEx]?.taker || 0.002;
  const buyCostUSD = fixMath(executableVol * buyPr * (1 + feeRateBuy));
  let sellGainUSD = fixMath(executableVol * sellPr * (1 - feeRateSell));


  const feesUSD = fixMath(
    executableVol * buyPr * feeRateBuy + executableVol * sellPr * feeRateSell
  );
  // Dynamic slippage mirroring the orchestrator floor
  const slippageUSD = fixMath(Math.max(2.5, buyPr * executableVol * 0.0001));
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
    riskScore: opportunity.riskScore || null,
    status,
    timestamp: Date.now(),
  };

  // Persist to Redis
  // O(1) Circular Buffer insertion
  tradesCache[tradeIndex] = trade;
  tradeIndex = (tradeIndex + 1) % MAX_TRADE_LOG;
  if (tradeCount < MAX_TRADE_LOG) tradeCount++;
  if (redisRef) {
    await redisRef.lpush(REDIS_KEY_TRADES, JSON.stringify(trade));
    await redisRef.ltrim(REDIS_KEY_TRADES, 0, MAX_TRADE_LOG - 1);
  }

  // Record result
  recordTradeResult(netProfitUSD);

  console.log(
    `[SIM] ${status} | ${buyEx} → ${sellEx} | Vol: ${executableVol.toFixed(5)} BTC | Net: $${netProfitUSD.toFixed(2)}`,
  );
  return trade;
}

// ─── GETTERS ──────────────────────────────────────────────────────────────────
function getWallets() {
  return walletsCache || {};
}

function getTradeLog() {
  const res = [];
  for (let i = 0; i < Math.min(tradeCount, 100); i++) {
      const idx = (tradeIndex - 1 - i + MAX_TRADE_LOG) % MAX_TRADE_LOG;
      res.push(tradesCache[idx]);
  }
  return res;
}

function getPnLSummary() {
  const session = getSessionState();
  
  // Zero-Allocation O(N) Iteration
  let totalNet = 0;
  let totalFees = 0;
  let wins = 0;
  let losses = 0;
  
  for (let i = 0; i < tradeCount; i++) {
    const t = tradesCache[i];
    if (!t) continue;
    totalNet += (t.netProfitUSD || 0);
    totalFees += (t.feesUSD || 0);
    if ((t.netProfitUSD || 0) > 0) wins++;
    else losses++;
  }

  const winRate = tradeCount > 0 ? (wins / tradeCount) * 100 : 0;

  let totalWalletUSD = 0;
  if (walletsCache) {
    for (const ex in walletsCache) {
      if (ex !== "RektSwap") {
        totalWalletUSD += walletsCache[ex].USD;
      }
    }
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
  tradesCache.fill(null);
  tradeIndex = 0;
  tradeCount = 0;
  if (redisRef) {
    await redisRef.set(REDIS_KEY_WALLETS, JSON.stringify(walletsCache));
    await redisRef.del(REDIS_KEY_TRADES);
  }
  console.log("sim:  Wallets and trade log reset.");
}

// exportamos el modulo para usarlo en el pipeline
module.exports = {
  init,
  execute,
  getWallets,
  getTradeLog,
  getPnLSummary,
  resetWallets,
};
