'use strict';

// ─── RISK ENGINE ──────────────────────────────────────────────────────────────
// Deterministic, synchronous, stateful guard layer.
// All arbitrage opportunities pass through here before simulation/execution.

const DEFAULT_RULES = {
    minSpreadPercent:      0.20,  // Min net profit as % of buy price
    maxExposureUSD:        1000,  // Max USD size per trade
    maxDailyLossUSD:       -200,  // Circuit breaker: block all if daily P&L drops below
    maxConsecutiveLosses:  5,     // Stop after N consecutive losing trades
    avoidHighVolatility:   false, // Block if cross-exchange price std-dev > 1.5%
    exchangeWhitelist:     [],    // If non-empty, only allow listed exchanges
    killSwitch:            false  // Emergency: block everything
};

// ─── SESSION STATE ────────────────────────────────────────────────────────────
// Mutated externally by simulation-engine after each trade result
const sessionState = {
    dailyPnL:             0,
    consecutiveLosses:    0,
    totalTradesExecuted:  0,
    lastDailyReset:       new Date().toDateString()
};

// ─── DAILY RESET CHECK ────────────────────────────────────────────────────────
function resetDailyIfNeeded() {
    const today = new Date().toDateString();
    if (sessionState.lastDailyReset !== today) {
        sessionState.dailyPnL       = 0;
        sessionState.lastDailyReset = today;
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

    // 1. Kill switch — hard stop
    if (rules.killSwitch) {
        return { approved: false, reason: 'KILL_SWITCH', detail: 'Emergency kill switch is active.' };
    }

    // 2. Daily loss circuit breaker
    if (rules.maxDailyLossUSD !== null && sessionState.dailyPnL <= rules.maxDailyLossUSD) {
        return {
            approved: false,
            reason:   'DAILY_LOSS_LIMIT',
            detail:   `Daily P&L $${sessionState.dailyPnL.toFixed(2)} hit limit $${rules.maxDailyLossUSD}`
        };
    }

    // 3. Consecutive loss circuit breaker
    if (rules.maxConsecutiveLosses !== null && sessionState.consecutiveLosses >= rules.maxConsecutiveLosses) {
        return {
            approved: false,
            reason:   'CONSECUTIVE_LOSS_LIMIT',
            detail:   `${sessionState.consecutiveLosses} consecutive losses hit limit ${rules.maxConsecutiveLosses}`
        };
    }

    // 4. Exchange whitelist check
    if (rules.exchangeWhitelist && rules.exchangeWhitelist.length > 0) {
        const wl = rules.exchangeWhitelist.map(e => e.toLowerCase());
        if (!wl.includes(opportunity.compraEn.toLowerCase()) || !wl.includes(opportunity.vendeEn.toLowerCase())) {
            return {
                approved: false,
                reason:   'EXCHANGE_NOT_WHITELISTED',
                detail:   `${opportunity.compraEn} or ${opportunity.vendeEn} not in whitelist`
            };
        }
    }

    // 5. Volatility lockout
    if (rules.avoidHighVolatility && Object.keys(marketData).length > 0 && isHighVolatility(marketData)) {
        return { approved: false, reason: 'HIGH_VOLATILITY', detail: 'Cross-exchange price std-dev > 1.5%' };
    }

    // 6. Minimum spread profitability check
    if (rules.minSpreadPercent !== null) {
        const spreadPercent = (opportunity.profitTotalUSD / (opportunity.precioCompra * opportunity.volumen)) * 100;
        if (spreadPercent < rules.minSpreadPercent) {
            return {
                approved: false,
                reason:   'SPREAD_TOO_LOW',
                detail:   `Net spread ${spreadPercent.toFixed(3)}% < minimum ${rules.minSpreadPercent}%`
            };
        }
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
