'use strict';

// ─── RISK ENGINE ──────────────────────────────────────────────────────────────
// Deterministic, synchronous, stateful guard layer.
// All arbitrage opportunities pass through here before simulation/execution.

const DEFAULT_RULES = {
    minSpreadPercent:      0.20,  // Min net profit as % of buy price — filters marginal opportunities
    maxExposureUSD:        1000,  // Max USD size per trade
    maxDailyLossUSD:       -200,  // Circuit breaker: block all if daily P&L drops below
    maxConsecutiveLosses:  5,     // Stop after N consecutive losing trades
    avoidHighVolatility:   false, // Block if cross-exchange price std-dev > 1.5%
    exchangeBlacklist:     [],    // If non-empty, block listed exchanges
    killSwitch:            false, // Emergency: block everything
    enableRektSwap:        true  // Toggle the mock RektSwap exchange on/off
};

// ─── SESSION STATE ────────────────────────────────────────────────────────────
// Mutated externally by simulation-engine after each trade result
// ─── SESSION STATE ────────────────────────────────────────────────────────────
// Mutated externally by simulation-engine after each trade result
const sessionState = {
    dailyPnL:             0,
    consecutiveLosses:    0,
    totalTradesExecuted:  0,
    lastDailyReset:       new Date().toDateString(),
    blockedTradesCount:   0,
    totalRiskSavedUSD:    0,
};

// ─── DAILY RESET CHECK ────────────────────────────────────────────────────────
function resetDailyIfNeeded() {
    const today = new Date().toDateString();
    if (sessionState.lastDailyReset !== today) {
        sessionState.dailyPnL           = 0;
        sessionState.blockedTradesCount = 0;
        sessionState.totalRiskSavedUSD  = 0;
        sessionState.lastDailyReset     = today;
        console.log('[RISK] Daily P&L reset for new trading day.');
    }
}

// ─── VOLATILITY CHECK ─────────────────────────────────────────────────────────
// Returns true if cross-exchange price standard deviation exceeds threshold
function isHighVolatility(marketData) {
    const prices = Object.values(marketData)
        .filter(d => d.bid > 0 && d.ask > 0)
        .map(d => (d.bid + d.ask) / 2);

    if (prices.length < 3) return false;

    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
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
        verdict = { approved: false, reason: 'KILL_SWITCH', detail: 'Emergency kill switch is active.' };
    }
    // 2. Daily loss circuit breaker
    else if (rules.maxDailyLossUSD !== null && sessionState.dailyPnL <= rules.maxDailyLossUSD) {
        verdict = {
            approved: false,
            reason:   'DAILY_LOSS_LIMIT',
            detail:   `Daily P&L $${sessionState.dailyPnL.toFixed(2)} hit limit $${rules.maxDailyLossUSD}`
        };
    }
    // 3. Consecutive loss circuit breaker
    else if (rules.maxConsecutiveLosses !== null && sessionState.consecutiveLosses >= rules.maxConsecutiveLosses) {
        verdict = {
            approved: false,
            reason:   'CONSECUTIVE_LOSS_LIMIT',
            detail:   `${sessionState.consecutiveLosses} consecutive losses hit limit ${rules.maxConsecutiveLosses}`
        };
    }
    // 4. Exchange blacklist check
    else if (rules.exchangeBlacklist && rules.exchangeBlacklist.length > 0) {
        const bl = rules.exchangeBlacklist.map(e => e.toLowerCase());
        if (bl.includes(opportunity.compraEn.toLowerCase()) || bl.includes(opportunity.vendeEn.toLowerCase())) {
            verdict = {
                approved: false,
                reason:   'EXCHANGE_BLACKLISTED',
                detail:   `${opportunity.compraEn} or ${opportunity.vendeEn} is blacklisted`
            };
        }
    }
    // 5. Volatility lockout
    else if (rules.avoidHighVolatility && Object.keys(marketData).length > 0 && isHighVolatility(marketData)) {
        verdict = { approved: false, reason: 'HIGH_VOLATILITY', detail: 'Cross-exchange price std-dev > 1.5%' };
    }
    // 6. Minimum spread profitability check
    else if (rules.minSpreadPercent !== null) {
        const spreadPercent = (opportunity.profitTotalUSD / (opportunity.precioCompra * opportunity.volumen)) * 100;
        if (spreadPercent < rules.minSpreadPercent) {
            verdict = {
                approved: false,
                reason:   'SPREAD_TOO_LOW',
                detail:   `Net spread ${spreadPercent.toFixed(3)}% < minimum ${rules.minSpreadPercent}%`
            };
        }
    }

    if (verdict) {
        sessionState.blockedTradesCount += 1;
        sessionState.totalRiskSavedUSD  += opportunity.profitTotalUSD || 0;
        return verdict;
    }

    return { approved: true, reason: null, detail: null };
}

// ─── STATE MUTATORS (called by simulation-engine) ─────────────────────────────
function recordTradeResult(netProfitUSD) {
    sessionState.dailyPnL            += netProfitUSD;
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

module.exports = { evaluate, resetDailyIfNeeded, recordTradeResult, getSessionState, DEFAULT_RULES };
