"use strict";

const { calculateTruePrice } = require("./tools/oracle-engine");
const {
  evaluate,
  resetDailyIfNeeded,
  DEFAULT_RULES,
  calculateRiskScore,
} = require("./tools/risk-engine");
const {
  init: initSim,
  execute,
  getWallets,
  getTradeLog,
  getPnLSummary,
} = require("./tools/simulation-engine");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const TOPIC = "market/btc/ticker";
const ALERTS_TOPIC = "ARBITRAGE_ALERTS";
const AUDIT_TOPIC = "RISK_AUDIT";
const TRADE_TOPIC = "TRADE_EXECUTED";
const PNL_TOPIC = "PNL_UPDATE";
const PUBLISH_HZ = 10;
const PUBLISH_INTERVAL_MS = Math.round(1000 / PUBLISH_HZ);

const EXCHANGES = [
  "binance",
  "kraken",
  "coinbase",
  "okx",
  "bitfinex",
  "bybit",
  "gateio",
  "gemini",
  "bitstamp",
  "kucoin",
  "rektswap",
];

// Baseline slippage floor (USD)
const EST_SLIPPAGE_USD = 2.5;

// ─── STATE & MEMORY ───────────────────────────────────────────────────────────
const marketData = {
  Binance: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  Kraken: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  Coinbase: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  OKX: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  Bitfinex: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  Bybit: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  Gateio: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  Gemini: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  Bitstamp: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  Kucoin: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
  RektSwap: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
};

let globalExchangeFees = {};
let redisClientRef = null;

let metricsHistory = {
  opportunities: Array(20).fill(0),
  profit: Array(20).fill(0),
  trades: Array(20).fill(0),
  riskSaved: Array(20).fill(0),
  drawdown: Array(20).fill(0),
};
let opportunitiesDetected = 0;

// ─── ACTIVE RULES (mutable by client via SET_STRATEGY) ───────────────────────
let activeRules = { ...DEFAULT_RULES };

function setActiveRules(partial) {
  activeRules = { ...activeRules, ...partial };
  console.log("[ORCH] Active rules updated:", JSON.stringify(activeRules));

  if (activeRules.enableRektSwap === false) {
    marketData.RektSwap = {
      bid: 0,
      bidVol: 0,
      ask: 0,
      askVol: 0,
      timestamp: 0,
    };
  }

  if (redisClientRef) {
    redisClientRef.publish("ACTIVE_RULES", JSON.stringify(activeRules));
  }
}

// ─── CORE FUNCTIONS ───────────────────────────────────────────────────────────

function updateMemory(exchange, bidPrice, bidVol, askPrice, askVol) {
  if (exchange === "RektSwap" && activeRules.enableRektSwap === false) {
    marketData.RektSwap = {
      bid: 0,
      bidVol: 0,
      ask: 0,
      askVol: 0,
      timestamp: 0,
    };
    return; // Completely ignore RektSwap when disabled by the UI
  }

  let updated = false;

  if (bidPrice !== null && bidPrice > 0) {
    marketData[exchange].bid = bidPrice;
    if (bidVol !== null) marketData[exchange].bidVol = bidVol;
    updated = true;
  }

  if (askPrice !== null && askPrice > 0) {
    marketData[exchange].ask = askPrice;
    if (askVol !== null) marketData[exchange].askVol = askVol;
    updated = true;
  }

  if (updated) {
    marketData[exchange].timestamp = Date.now();
    detectCrossExchangeArbitrage();
  }
}

async function detectCrossExchangeArbitrage() {
  if (!redisClientRef) return;

  resetDailyIfNeeded();

  const exchanges = Object.keys(marketData);

  for (let i = 0; i < exchanges.length; i++) {
    for (let j = 0; j < exchanges.length; j++) {
      if (i === j) continue;

      const exchangeA = exchanges[i]; // Buy here (cheap)
      const exchangeB = exchanges[j]; // Sell here (expensive)

      const askA = marketData[exchangeA].ask;
      const volA = marketData[exchangeA].askVol;
      const bidB = marketData[exchangeB].bid;
      const volB = marketData[exchangeB].bidVol;

      if (!askA || !bidB || askA === 0 || bidB === 0) continue;

      // Quick filter: is there a raw price divergence?
      if (askA < bidB) {
        const feeA = globalExchangeFees[exchangeA]?.taker || 0.002;
        const feeB = globalExchangeFees[exchangeB]?.taker || 0.002;

        const executableVolume = Math.min(volA, volB);
        if (executableVolume === 0) continue;

        // Net profitability calculation
        const realBuyCost = askA * (1 + feeA);
        const realSellRevenue = bidB * (1 - feeB);
        const netProfitPerUnit = realSellRevenue - realBuyCost;

        // Dynamic slippage (size-aware floor)
        const dynamicSlippageUSD = Math.max(
          EST_SLIPPAGE_USD,
          askA * executableVolume * 0.0001,
        );

        const netProfitTotalUSD =
          netProfitPerUnit * executableVolume - dynamicSlippageUSD;

        if (netProfitTotalUSD > 0) {
          opportunitiesDetected++;
          const opportunity = {
            id: `ARB-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            buyExchange: exchangeA,
            sellExchange: exchangeB,
            buyPrice: askA,
            sellPrice: bidB,
            volume: executableVolume,
            profitUSD: parseFloat(netProfitTotalUSD.toFixed(4)),
            // Legacy aliases removed for full English conversion
            timestamp: Date.now(),
          };

          // ── Risk Engine Gate ──────────────────────────────────────
          const verdict = evaluate(opportunity, activeRules, marketData);

          if (!verdict.approved) {
            redisClientRef.publish(
              AUDIT_TOPIC,
              JSON.stringify({
                id: opportunity.id,
                blocked: true,
                reason: verdict.reason,
                detail: verdict.detail,
                buyExchange: exchangeA,
                sellExchange: exchangeB,
                profit: netProfitTotalUSD.toFixed(4),
                timestamp: Date.now(),
              }),
            );
            continue; // Do not simulate or publish alert
          }

          // ── Approved: simulate execution ──────────────────────────
          const tradeResult = await execute(opportunity, activeRules, globalExchangeFees);

          // ── Calculate real risk score for display ───────────────────
          opportunity.riskScore = calculateRiskScore(
            opportunity,
            activeRules,
            marketData,
          );

          // Publish alert with real riskScore
          redisClientRef.publish(
            ALERTS_TOPIC,
            JSON.stringify({
              ...opportunity,
              status: tradeResult.status,
            }),
          );

          redisClientRef.publish(TRADE_TOPIC, JSON.stringify(tradeResult));
          redisClientRef.publish(PNL_TOPIC, JSON.stringify(getPnLSummary()));
        }
      }
    }
  }
}

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
async function start(redisPub) {
  console.log("🚀 [CCM] Starting HFT Orchestrator...");
  redisClientRef = redisPub;

  // Initialize simulation engine with Redis persistence
  await initSim(redisPub);

  const modules = EXCHANGES.map((name) => ({
    name,
    mod: require(`./ws_modules/${name}`),
  }));

  // Phase 1: Async Bootstrapping
  const loadPromises = modules.map(async ({ name, mod }) => {
    if (typeof mod.getFees === "function") {
      const exchangeKey = name.charAt(0).toUpperCase() + name.slice(1);
      globalExchangeFees[exchangeKey] = mod.getFees();
    }
    if (typeof mod.load === "function") {
      try {
        await mod.load();
      } catch (err) {
        console.error(`❌ [${name.toUpperCase()}] Pre-flight Error:`, err.message);
      }
    }
  });

  await Promise.all(loadPromises);

  // Phase 2: Synchronous Connections
  modules.forEach(({ name, mod }) => {
    let ws;
    try {
      ws = mod.connect(updateMemory);
    } catch (err) {
      console.error(`❌ [${name.toUpperCase()}] Critical connection error:`, err.message);
      return;
    }
    if (!ws) return;
    ws.on("close", () => {
      console.warn(`⚠️ [${name.toUpperCase()}] Disconnected. Orchestrator handled disconnect...`);
    });
  });

  console.log(
    `✅ [CCM] Connections and Fees established. Publishing ticks on "${TOPIC}" at ${PUBLISH_HZ} Hz.\n`,
  );
  console.log(
    `🛡️  [RISK] Risk Engine active | Rules: ${JSON.stringify(activeRules)}`,
  );

  // ── HFT TICK PUBLISH LOOP ───────────────────────────────────────────────
  setInterval(() => {
    const frontEndData = {};
    for (const [exchange, data] of Object.entries(marketData)) {
      frontEndData[exchange] = { bid: data.bid, ask: data.ask };
    }

    const truePrice = calculateTruePrice(marketData);

    const msg = {
      sender: "ccm-orchestrator",
      ts: Date.now(),
      data: frontEndData,
      truePrice: truePrice ? parseFloat(truePrice.toFixed(2)) : null,
    };

    redisPub.publish(TOPIC, JSON.stringify(msg));
  }, PUBLISH_INTERVAL_MS);

  // ── PERIODIC PNL & RULES BROADCAST (every 2s) ────────────────────────
  // Ensures the dashboard always has fresh metrics, even when no trades execute
  setInterval(() => {
    const pnl = getPnLSummary();

    metricsHistory.profit = [...metricsHistory.profit, pnl.dailyPnL || 0].slice(
      -20,
    );
    metricsHistory.trades = [
      ...metricsHistory.trades,
      pnl.totalTrades || 0,
    ].slice(-20);
    metricsHistory.riskSaved = [
      ...metricsHistory.riskSaved,
      pnl.totalRiskSavedUSD || 0,
    ].slice(-20);
    // Note: The drawdown array here strictly tracks the vector of negative daily losses,
    // which aligns with the frontend's "Current Drawdown (24h)" label.
    metricsHistory.drawdown = [
      ...metricsHistory.drawdown,
      (pnl.dailyPnL || 0) < 0 ? pnl.dailyPnL : 0,
    ].slice(-20);
    metricsHistory.opportunities = [
      ...metricsHistory.opportunities,
      opportunitiesDetected,
    ].slice(-20);

    const payload = { ...pnl, history: metricsHistory };

    redisPub.publish(PNL_TOPIC, JSON.stringify(payload));
    redisPub.publish("ACTIVE_RULES", JSON.stringify(activeRules));
  }, 2000);
}

function getExchangeFees() {
  return globalExchangeFees;
}
function getActiveRules() {
  return { ...activeRules };
}
function getMarketData() {
  return marketData;
}
function getFullPnL() {
  return { ...getPnLSummary(), history: metricsHistory };
}

module.exports = {
  start,
  updateMemory,
  getExchangeFees,
  setActiveRules,
  getActiveRules,
  getWallets,
  getTradeLog,
  getPnLSummary,
  getFullPnL,
  getMarketData,
};
