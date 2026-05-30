"use strict";

// ─── RISK ENGINE ──────────────────────────────────────────────────────────────
// Deterministic, synchronous, stateful guard layer.
// All arbitrage opportunities pass through here before simulation/execution.

const DEFAULT_RULES = {
  minSpreadPercent: 0.2,
  maxExposureUSD: 1000,
  maxDailyLossUSD: -200,
  maxConsecutiveLosses: 5,
  avoidHighVolatility: false,
  exchangeBlacklist: [],
  killSwitch: false,
  enableRektSwap: true,
};

// Trust scores (higher = more reliable)
const EXCHANGE_TRUST = {
  Binance: 95,
  Kraken: 90,
  Coinbase: 88,
  OKX: 82,
  Bitfinex: 75,
  Bybit: 80,
  Gateio: 78,
  Gemini: 72,
  Bitstamp: 85,
  Kucoin: 76,
  RektSwap: 20,
};

// Calculate real risk score (0-100) based on multiple risk factors
function calculateRiskScore(opp, rules, marketData) {
  let score = 100;

  const buyEx = opp.buyExchange;
  const sellEx = opp.sellExchange;
  const buyPr = opp.buyPrice;
  const vol = opp.volume;
  const profit = opp.profitUSD;

  const buyTrust = EXCHANGE_TRUST[buyEx] || 50;
  const sellTrust = EXCHANGE_TRUST[sellEx] || 50;

  // 1. Exchange trust (up to -30)
  score -= (100 - (buyTrust + sellTrust) / 2) * 0.3;

  // 2. Spread quality (up to -25): penalize marginal spreads
  const minSpread = rules.minSpreadPercent || 0.2;
  const actualSpreadPct = (profit / (buyPr * vol)) * 100;
  if (actualSpreadPct < minSpread)
    score -= 25 * (1 - actualSpreadPct / minSpread);

  // 3. Position size risk (up to -20)
  const posUSD = buyPr * vol;
  const maxExp = rules.maxExposureUSD || 1000;
  if (posUSD / maxExp > 0.7) score -= 20;
  else if (posUSD / maxExp > 0.5) score -= 10;

  // 4. Drawdown state penalty (up to -15)
  if (sessionState.dailyPnL < -50) score -= 15;
  else if (sessionState.dailyPnL < 0) score -= 8;
  else if (sessionState.consecutiveLosses >= 3) score -= 10;

  // 5. Market volatility (up to -10)
  const prices = Object.values(marketData)
    .filter((d) => d.bid > 0 && d.ask > 0)
    .map((d) => (d.bid + d.ask) / 2);
  if (prices.length >= 3) {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev =
      Math.sqrt(
        prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / prices.length,
      ) / mean;
    if (stdDev > 0.02) score -= 10;
    else if (stdDev > 0.01) score -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Session state - mutated by simulation-engine after each trade result
const sessionState = {
  dailyPnL: 0,
  consecutiveLosses: 0,
  totalTradesExecuted: 0,
  lastDailyReset: new Date().toDateString(),
  blockedTradesCount: 0,
  totalRiskSavedUSD: 0,
};

// ─── DAILY RESET CHECK ────────────────────────────────────────────────────────
function resetDailyIfNeeded() {
  const today = new Date().toDateString();
  if (sessionState.lastDailyReset !== today) {
    sessionState.dailyPnL = 0;
    sessionState.blockedTradesCount = 0;
    sessionState.totalRiskSavedUSD = 0;
    sessionState.lastDailyReset = today;
    console.log("[RISK] Daily P&L reset for new trading day.");
  }
}

// ─── VOLATILITY CHECK ─────────────────────────────────────────────────────────
// Returns true if cross-exchange price standard deviation exceeds threshold
function isHighVolatility(marketData) {
  const prices = Object.values(marketData)
    .filter((d) => d.bid > 0 && d.ask > 0)
    .map((d) => (d.bid + d.ask) / 2);

  if (prices.length < 3) return false;

  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance =
    prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const relativeStdDev = stdDev / mean; // as fraction of mean price

  return relativeStdDev > 0.015; // block if > 1.5% std dev
}

// ─── EVALUATE ────────────────────────────────────────────────────────────────
// Main entry point. Returns { approved: bool, reason: string|null, detail: string|null }
function evaluate(opportunity, rules = DEFAULT_RULES, marketData = {}) {
  resetDailyIfNeeded();

  let verdict = null;

  // 1. Kill switch — hard stop
  if (rules.killSwitch) {
    verdict = {
      approved: false,
      reason: "KILL_SWITCH",
      detail: "Emergency kill switch is active.",
    };
  }
  // 2. Daily loss circuit breaker
  else if (
    rules.maxDailyLossUSD !== null &&
    sessionState.dailyPnL <= rules.maxDailyLossUSD
  ) {
    verdict = {
      approved: false,
      reason: "DAILY_LOSS_LIMIT",
      detail: `Daily P&L $${sessionState.dailyPnL.toFixed(2)} hit limit $${rules.maxDailyLossUSD}`,
    };
  }
  // 3. Consecutive loss circuit breaker
  else if (
    rules.maxConsecutiveLosses !== null &&
    sessionState.consecutiveLosses >= rules.maxConsecutiveLosses
  ) {
    verdict = {
      approved: false,
      reason: "CONSECUTIVE_LOSS_LIMIT",
      detail: `${sessionState.consecutiveLosses} consecutive losses hit limit ${rules.maxConsecutiveLosses}`,
    };
  }
  // 4. Exchange blacklist check
  else if (rules.exchangeBlacklist && rules.exchangeBlacklist.length > 0) {
    const bl = rules.exchangeBlacklist.map((e) => e.toLowerCase());
    if (
      bl.includes(opportunity.buyExchange.toLowerCase()) ||
      bl.includes(opportunity.sellExchange.toLowerCase())
    ) {
      verdict = {
        approved: false,
        reason: "EXCHANGE_BLACKLISTED",
        detail: `${opportunity.buyExchange} or ${opportunity.sellExchange} is blacklisted`,
      };
    }
  }
  // 5. Volatility lockout
  else if (
    rules.avoidHighVolatility &&
    Object.keys(marketData).length > 0 &&
    isHighVolatility(marketData)
  ) {
    verdict = {
      approved: false,
      reason: "HIGH_VOLATILITY",
      detail: "Cross-exchange price std-dev > 1.5%",
    };
  }
  // 6. Minimum spread profitability check
  else if (rules.minSpreadPercent !== null) {
    const spreadPercent =
      (opportunity.profitUSD /
        (opportunity.buyPrice * opportunity.volume)) *
      100;
    if (spreadPercent < rules.minSpreadPercent) {
      verdict = {
        approved: false,
        reason: "SPREAD_TOO_LOW",
        detail: `Net spread ${spreadPercent.toFixed(3)}% < minimum ${rules.minSpreadPercent}%`,
      };
    }
  }

  if (verdict) {
    sessionState.blockedTradesCount += 1;
    sessionState.totalRiskSavedUSD += opportunity.profitTotalUSD || 0;
    return verdict;
  }

  return { approved: true, reason: null, detail: null };
}

// ─── STATE MUTATORS (called by simulation-engine) ─────────────────────────────
function recordTradeResult(netProfitUSD) {
  sessionState.dailyPnL += netProfitUSD;
  sessionState.totalTradesExecuted += 1;
  if (netProfitUSD < 0) {
    sessionState.consecutiveLosses += 1;
  } else {
    sessionState.consecutiveLosses = 0; // reset on a winning trade
  }
}

function getSessionState() {
  return { ...sessionState };
}

module.exports = {
  evaluate,
  resetDailyIfNeeded,
  recordTradeResult,
  getSessionState,
  DEFAULT_RULES,
  calculateRiskScore,
};
