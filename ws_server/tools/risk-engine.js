
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
  // Use ?? to allow explicit 0. Floor at 0.001 to prevent Division by Zero.
  const minSpread = Math.max(rules.minSpreadPercent ?? 0.2, 0.001);
  const actualSpreadPct = (profit / (buyPr * vol)) * 100;
  if (actualSpreadPct < (rules.minSpreadPercent ?? 0.2)) {
    score -= 25 * Math.max(0, (1 - actualSpreadPct / minSpread));
  }

  // 3. Position size risk (up to -20)
  const posUSD = buyPr * vol;
  const maxExp = Math.max(rules.maxExposureUSD ?? 1000, 1);
  if (posUSD / maxExp > 0.7) score -= 20;
  else if (posUSD / maxExp > 0.5) score -= 10;

  // 4. Drawdown state penalty (up to -15)
  if (sessionState.dailyPnL < -50) score -= 15;
  else if (sessionState.dailyPnL < 0) score -= 8;
  else if (sessionState.consecutiveLosses >= 3) score -= 10;

  // 5. Market volatility (up to -10)
  let sum = 0;
  let count = 0;
  for (const key in marketData) {
    const d = marketData[key];
    if (d.bid > 0 && d.ask > 0) {
      sum += (d.bid + d.ask) / 2;
      count++;
    }
  }
  if (count >= 3) {
    const mean = sum / count;
    let varianceSum = 0;
    for (const key in marketData) {
      const d = marketData[key];
      if (d.bid > 0 && d.ask > 0) {
        varianceSum += Math.pow(((d.bid + d.ask) / 2) - mean, 2);
      }
    }
    const stdDev = Math.sqrt(varianceSum / count) / mean;
    if (stdDev > 0.02) score -= 10;
    else if (stdDev > 0.01) score -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

const sessionState = {
  dailyPnL: 0,
  consecutiveLosses: 0,
  totalTradesExecuted: 0,
  lastDailyReset: new Date().toDateString(),
  blockedTradesCount: 0,
  totalRiskSavedUSD: 0,
  breakUntil: 0,
};

function resetDailyIfNeeded() {
  const today = new Date().toDateString();
  if (sessionState.lastDailyReset !== today) {
    sessionState.dailyPnL = 0;
    sessionState.blockedTradesCount = 0;
    sessionState.totalRiskSavedUSD = 0;
    sessionState.lastDailyReset = today;
    sessionState.breakUntil = 0;
    console.log("risk:  Daily P&L reset for new trading day.");
  }
}

// ─── VOLATILITY CHECK ─────────────────────────────────────────────────────────
// Returns true if cross-exchange price standard deviation exceeds threshold
function isHighVolatility(marketData) {
  let sum = 0;
  let count = 0;
  for (const key in marketData) {
    const d = marketData[key];
    if (d.bid > 0 && d.ask > 0) {
      sum += (d.bid + d.ask) / 2;
      count++;
    }
  }

  if (count < 3) return false;

  const mean = sum / count;
  let varianceSum = 0;
  for (const key in marketData) {
    const d = marketData[key];
    if (d.bid > 0 && d.ask > 0) {
      varianceSum += Math.pow(((d.bid + d.ask) / 2) - mean, 2);
    }
  }
  
  const stdDev = Math.sqrt(varianceSum / count);
  const relativeStdDev = stdDev / mean; // as fraction of mean price

  return relativeStdDev > 0.015; // block if > 1.5% std dev
}

// HFT Pre-allocated verdict reference
const _verdictRef = { approved: true, reason: null, detail: null };

// ─── EVALUATE ────────────────────────────────────────────────────────────────
// Main entry point. Returns { approved: bool, reason: string|null, detail: string|null }
function evaluate(opportunity, rules = DEFAULT_RULES, marketData = {}) {
  resetDailyIfNeeded();

  _verdictRef.approved = true;
  _verdictRef.reason = null;
  _verdictRef.detail = null;

  // 1. Kill switch — hard stop
  if (rules.killSwitch) {
    _verdictRef.approved = false;
    _verdictRef.reason = "KILL_SWITCH";
    _verdictRef.detail = "Emergency kill switch is active.";
  }
  // 2. Daily loss circuit breaker
  else if (
    rules.maxDailyLossUSD !== null &&
    sessionState.dailyPnL <= rules.maxDailyLossUSD
  ) {
    _verdictRef.approved = false;
    _verdictRef.reason = "DAILY_LOSS_LIMIT";
    _verdictRef.detail = `Daily P&L $${sessionState.dailyPnL.toFixed(2)} hit limit $${rules.maxDailyLossUSD}`;
  }
  // 3. Consecutive loss circuit breaker
  else if (
    rules.maxConsecutiveLosses !== null &&
    sessionState.consecutiveLosses >= rules.maxConsecutiveLosses
  ) {
    if (sessionState.breakUntil === 0) {
      sessionState.breakUntil = Date.now() + 1 * 60 * 1000; // 1 minute cool-down
      _verdictRef.approved = false;
      _verdictRef.reason = "CONSECUTIVE_LOSS_LIMIT";
      _verdictRef.detail = `${sessionState.consecutiveLosses} consecutive losses hit limit. Starting 1m cool-down.`;
    } else if (Date.now() < sessionState.breakUntil) {
      const remainingSecs = Math.ceil((sessionState.breakUntil - Date.now()) / 1000);
      _verdictRef.approved = false;
      _verdictRef.reason = "COOL_DOWN_ACTIVE";
      _verdictRef.detail = `System in cool-down. Resuming in ${remainingSecs}s.`;
    } else {
      sessionState.consecutiveLosses = 0;
      sessionState.breakUntil = 0;
      console.log("risk:  Cool-down finished. Resuming trading.");
    }
  }
  // 4. Exchange blacklist check
  else if (rules.exchangeBlacklist && rules.exchangeBlacklist.length > 0) {
    // Array creation here is acceptable only if blacklist exists and is triggered, but could be optimized
    // For now we keep it since blacklist isn't dynamically huge.
    const bl = rules.exchangeBlacklist;
    let blacklisted = false;
    for (let i = 0; i < bl.length; i++) {
       const b = bl[i].toLowerCase();
       if (b === opportunity.buyExchange.toLowerCase() || b === opportunity.sellExchange.toLowerCase()) {
           blacklisted = true; break;
       }
    }
    if (blacklisted) {
      _verdictRef.approved = false;
      _verdictRef.reason = "EXCHANGE_BLACKLISTED";
      _verdictRef.detail = `${opportunity.buyExchange} or ${opportunity.sellExchange} is blacklisted`;
    }
  }
  // 5. Volatility lockout
  else if (
    rules.avoidHighVolatility &&
    isHighVolatility(marketData)
  ) {
    _verdictRef.approved = false;
    _verdictRef.reason = "HIGH_VOLATILITY";
    _verdictRef.detail = "Cross-exchange price std-dev > 1.5%";
  }
  // 6. Minimum spread profitability check
  else if (rules.minSpreadPercent !== null && rules.minSpreadPercent !== undefined) {
    const spreadPercent =
      (opportunity.profitUSD /
        (opportunity.buyPrice * opportunity.volume)) *
      100;
    if (spreadPercent < rules.minSpreadPercent) {
      _verdictRef.approved = false;
      _verdictRef.reason = "SPREAD_TOO_LOW";
      _verdictRef.detail = `Net spread ${spreadPercent.toFixed(3)}% < minimum ${rules.minSpreadPercent}%`;
    }
  }

  if (!_verdictRef.approved) {
    sessionState.blockedTradesCount += 1;
    sessionState.totalRiskSavedUSD += opportunity.profitTotalUSD || 0;
  }

  return _verdictRef;
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

// exportamos el modulo para usarlo en el pipeline
module.exports = {
  evaluate,
  resetDailyIfNeeded,
  recordTradeResult,
  getSessionState,
  DEFAULT_RULES,
  calculateRiskScore,
};
