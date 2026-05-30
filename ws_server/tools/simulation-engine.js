'use strict';

// ─── SIMULATION ENGINE ────────────────────────────────────────────────────────
// Manages virtual wallets per exchange and executes simulated arbitrage trades.
// State is persisted in Redis so P&L history survives server restarts.

const { recordTradeResult, getSessionState } = require('./risk-engine');

const REDIS_KEY_WALLETS = 'sim:wallets';
const REDIS_KEY_TRADES  = 'sim:trades';
const MAX_TRADE_LOG     = 200;

// Starting USD balance per exchange for fresh simulation
const INITIAL_USD_PER_EXCHANGE = 5000;

const EXCHANGES = [
    'Binance', 'Kraken', 'Coinbase', 'OKX', 'Bitfinex',
    'Bybit', 'Gateio', 'Gemini', 'Bitstamp', 'Kucoin'
];

// ─── IN-MEMORY MIRRORS ────────────────────────────────────────────────────────
// We cache wallets in RAM for zero-latency reads on every arbitrage check.
// Redis is synced after each write for persistence.
let walletsCache = null;
let tradesCache  = [];
let redisRef     = null;

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
async function init(redisClient) {
    redisRef = redisClient;

    // Load existing wallets from Redis or create fresh ones
    const stored = await redisClient.get(REDIS_KEY_WALLETS);
    if (stored) {
        try {
            walletsCache = JSON.parse(stored);
            console.log('[SIM] Wallets loaded from Redis.');
        } catch {
            walletsCache = buildFreshWallets();
        }
    } else {
        walletsCache = buildFreshWallets();
        await persistWallets();
        console.log('[SIM] Fresh virtual wallets created.');
    }

    // Load trade log
    const storedTrades = await redisClient.lrange(REDIS_KEY_TRADES, 0, MAX_TRADE_LOG - 1);
    tradesCache = storedTrades.map(t => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
    console.log(`[SIM] ${tradesCache.length} historical trades loaded.`);
}

function buildFreshWallets() {
    const wallets = {};
    EXCHANGES.forEach(ex => {
        wallets[ex] = { USD: INITIAL_USD_PER_EXCHANGE, BTC: 0 };
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
    if (!walletsCache) return { status: 'ERROR', reason: 'Wallets not initialized' };

    const { compraEn, vendeEn, precioCompra, precioVenta, volumen, profitTotalUSD, id } = opportunity;

    const buyWallet  = walletsCache[compraEn];
    const sellWallet = walletsCache[vendeEn];

    if (!buyWallet || !sellWallet) {
        return { status: 'REJECTED', reason: `Unknown exchange: ${compraEn} or ${vendeEn}` };
    }

    // ── Exposure cap: never risk more than maxExposureUSD ──
    const maxExposure = rules.maxExposureUSD || Infinity;
    const maxBtcFromExposure = maxExposure / precioCompra;

    // ── Liquidity constraints: how much can we actually trade? ──
    const maxBtcFromBuyUSD  = buyWallet.USD / precioCompra;   // USD wallet limits buy size
    const maxBtcFromSellBTC = sellWallet.BTC;                  // BTC wallet on sell side

    // We need BTC on the sell side from a previous trade cycle. On fresh start,
    // we seed the sell wallet with a small buffer so the simulation can work.
    // In production this would be a real transfer of BTC to the sell exchange.
    if (sellWallet.BTC === 0) {
        // Seed with 10% of initial capital worth of BTC for simulation realism
        sellWallet.BTC = (INITIAL_USD_PER_EXCHANGE * 0.1) / precioVenta;
    }

    const executableVol = Math.min(volumen, maxBtcFromExposure, maxBtcFromBuyUSD, sellWallet.BTC);

    if (executableVol <= 0) {
        return { status: 'REJECTED', reason: 'Insufficient liquidity in virtual wallets' };
    }

    const status = executableVol < volumen ? 'PARTIAL' : 'FILLED';

    // ── Fees ──
    const feeRateBuy  = 0.001; // default taker fee fallback
    const feeRateSell = 0.001;
    const buyCostUSD  = executableVol * precioCompra * (1 + feeRateBuy);
    const sellGainUSD = executableVol * precioVenta  * (1 - feeRateSell);
    const feesUSD     = (executableVol * precioCompra * feeRateBuy) + (executableVol * precioVenta * feeRateSell);
    const slippageUSD = Math.max(2.50, precioCompra * executableVol * 0.0001);
    const netProfitUSD = sellGainUSD - buyCostUSD - slippageUSD;

    // ── Update virtual wallets ──
    buyWallet.USD  -= buyCostUSD;
    buyWallet.BTC  += executableVol;
    sellWallet.BTC -= executableVol;
    sellWallet.USD += sellGainUSD;

    await persistWallets();

    // ── Build trade record ──
    const trade = {
        id,
        buyExchange:    compraEn,
        sellExchange:   vendeEn,
        buyPrice:       parseFloat(precioCompra.toFixed(2)),
        sellPrice:      parseFloat(precioVenta.toFixed(2)),
        volumeBTC:      parseFloat(executableVol.toFixed(6)),
        grossProfitUSD: parseFloat((sellGainUSD - buyCostUSD).toFixed(4)),
        feesUSD:        parseFloat(feesUSD.toFixed(4)),
        slippageUSD:    parseFloat(slippageUSD.toFixed(4)),
        netProfitUSD:   parseFloat(netProfitUSD.toFixed(4)),
        status,
        timestamp:      Date.now()
    };

    // ── Persist trade to Redis ──
    tradesCache.unshift(trade);
    if (tradesCache.length > MAX_TRADE_LOG) tradesCache.pop();
    if (redisRef) {
        await redisRef.lpush(REDIS_KEY_TRADES, JSON.stringify(trade));
        await redisRef.ltrim(REDIS_KEY_TRADES, 0, MAX_TRADE_LOG - 1);
    }

    // ── Update session state in risk engine ──
    recordTradeResult(netProfitUSD);

    console.log(`[SIM] ${status} | ${compraEn} → ${vendeEn} | Vol: ${executableVol.toFixed(5)} BTC | Net: $${netProfitUSD.toFixed(2)}`);
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
    const totalNet    = tradesCache.reduce((sum, t) => sum + (t.netProfitUSD || 0), 0);
    const totalFees   = tradesCache.reduce((sum, t) => sum + (t.feesUSD || 0), 0);
    const wins        = tradesCache.filter(t => t.netProfitUSD > 0).length;
    const losses      = tradesCache.filter(t => t.netProfitUSD <= 0).length;
    const winRate     = tradesCache.length > 0 ? (wins / tradesCache.length) * 100 : 0;

    return {
        totalNetUSD:          parseFloat(totalNet.toFixed(2)),
        totalFeesUSD:         parseFloat(totalFees.toFixed(2)),
        totalTrades:          tradesCache.length,
        wins,
        losses,
        winRatePercent:       parseFloat(winRate.toFixed(1)),
        dailyPnL:             parseFloat(session.dailyPnL.toFixed(2)),
        consecutiveLosses:    session.consecutiveLosses,
    };
}

async function resetWallets() {
    walletsCache = buildFreshWallets();
    tradesCache  = [];
    if (redisRef) {
        await redisRef.set(REDIS_KEY_WALLETS, JSON.stringify(walletsCache));
        await redisRef.del(REDIS_KEY_TRADES);
    }
    console.log('[SIM] Wallets and trade log reset.');
}

module.exports = { init, execute, getWallets, getTradeLog, getPnLSummary, resetWallets };
