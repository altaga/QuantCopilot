
'use strict';

const { evaluate, DEFAULT_RULES } = require("../ws_server/tools/risk-engine");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DISPLAY_HZ = 2; // Hz (2 refreshes per second in the console)
const DISPLAY_INTERVAL_MS = Math.round(1000 / DISPLAY_HZ);

const ENABLE_REKTSWAP = true; // Toggle to false to disable RektSwap mock exchange

const EXCHANGES = [
    'binance', 'kraken', 'coinbase', 'okx', 'bitfinex',
    'bybit', 'gateio', 'gemini', 'bitstamp', 'kucoin'
];

if (ENABLE_REKTSWAP) {
    EXCHANGES.push('rektswap');
}

const EST_SLIPPAGE_USD = 2.5;

// ─── MARKET DATA STATE (L2 In-Memory) ─────────────────────────────────────────
const marketData = {
    Binance:  { bid: 0, ask: 0 },
    Kraken:   { bid: 0, ask: 0 },
    Coinbase: { bid: 0, ask: 0 },
    OKX:      { bid: 0, ask: 0 },
    Bitfinex: { bid: 0, ask: 0 },
    Bybit:    { bid: 0, ask: 0 },
    Gateio:   { bid: 0, ask: 0 },
    Gemini:   { bid: 0, ask: 0 },
    Bitstamp: { bid: 0, ask: 0 },
    Kucoin:   { bid: 0, ask: 0 },
    RektSwap: { bid: 0, ask: 0 }
};

// Cache keys to prevent O(N) Object.keys() allocations on every tick
const EXCHANGE_KEYS = Object.keys(marketData);

let globalExchangeFees = {};
let stats = {
    opportunitiesDetected: 0,
    opportunitiesApproved: 0,
    opportunitiesBlocked: 0,
    totalProfitUSD: 0
};
// HFT Zero-Allocation Circular Buffer for Logs
const MAX_LOGS = 5;
const recentOpportunities = new Array(MAX_LOGS).fill(null).map(() => ({
    Time: '', Route: '', Vol: '', Profit: '', Status: '', Reason: ''
}));
let logIndex = 0;

function addOpportunityLog(opp, verdict) {
    // Mutate existing object reference to prevent GC allocations
    const logRef = recentOpportunities[logIndex];
    logRef.Time = new Date().toLocaleTimeString();
    logRef.Route = opp.buyExchange + ' -> ' + opp.sellExchange;
    logRef.Vol = opp.volume.toFixed(2);
    logRef.Profit = '$' + opp.profitUSD.toFixed(2);
    logRef.Status = verdict.approved ? '✅ APPROVED' : '⛔ BLOCKED';
    logRef.Reason = verdict.reason || 'OK';
    
    // Circular pointer increment
    logIndex = (logIndex + 1) % MAX_LOGS;
}

function updateMemory(exchange, bidPrice, bidVol, askPrice, askVol) {
    let updated = false;
    if (bidPrice !== null) {
        const num = parseFloat(bidPrice);
        if (num > 0) { marketData[exchange].bid = num; updated = true; }
    }
    if (askPrice !== null) {
        const num = parseFloat(askPrice);
        if (num > 0) { marketData[exchange].ask = num; updated = true; }
    }

    if (updated) {
        detectCrossExchangeArbitrage();
    }
}

// HFT Pre-allocated opportunity reference (Zero-allocation)
const _oppRef = { buyExchange: '', sellExchange: '', buyPrice: 0, sellPrice: 0, volume: 0, profitUSD: 0 };

function detectCrossExchangeArbitrage() {
    for (let i = 0; i < EXCHANGE_KEYS.length; i++) {
        for (let j = 0; j < EXCHANGE_KEYS.length; j++) {
            if (i === j) continue;

            const exchangeA = EXCHANGE_KEYS[i]; // Buy here
            const exchangeB = EXCHANGE_KEYS[j]; // Sell here

            const askA = marketData[exchangeA].ask;
            const volA = 0.05; // Realistic mock volume (approx $3,500 exposure)
            const bidB = marketData[exchangeB].bid;
            const volB = 0.05;

            if (!askA || !bidB || askA === 0 || bidB === 0) continue;

            if (askA < bidB) {
                const feeA = globalExchangeFees[exchangeA]?.taker || 0.002;
                const feeB = globalExchangeFees[exchangeB]?.taker || 0.002;

                const executableVolume = Math.min(volA, volB);

                const realBuyCost = askA * (1 + feeA);
                const realSellRevenue = bidB * (1 - feeB);
                const netProfitPerUnit = realSellRevenue - realBuyCost;

                const dynamicSlippageUSD = Math.max(EST_SLIPPAGE_USD, askA * executableVolume * 0.0001);
                const netProfitTotalUSD = (netProfitPerUnit * executableVolume) - dynamicSlippageUSD;

                if (netProfitTotalUSD > 0) {
                    stats.opportunitiesDetected++;
                    
                    // Mutate pre-allocated reference
                    _oppRef.buyExchange = exchangeA;
                    _oppRef.sellExchange = exchangeB;
                    _oppRef.buyPrice = askA;
                    _oppRef.sellPrice = bidB;
                    _oppRef.volume = executableVolume;
                    _oppRef.profitUSD = parseFloat(netProfitTotalUSD.toFixed(4));

                    const verdict = evaluate(_oppRef, DEFAULT_RULES, marketData);
                    
                    addOpportunityLog(_oppRef, verdict);

                    if (!verdict.approved) {
                        stats.opportunitiesBlocked++;
                    } else {
                        stats.opportunitiesApproved++;
                        stats.totalProfitUSD += netProfitTotalUSD;
                    }
                }
            }
        }
    }
}

async function start() {
    console.log(' ccm:  Initializing Test Orchestrator (Math Logic & Risk Engine)...');
    
    const modules = EXCHANGES.map(name => ({ name, mod: require(`./ws_modules/${name}`) }));

    // Phase 1: Async Bootstrapping
    const loadPromises = modules.map(async ({ name, mod }) => {
        if (typeof mod.getFees === 'function') {
            const exchangeKey = name.charAt(0).toUpperCase() + name.slice(1);
            globalExchangeFees[exchangeKey] = mod.getFees();
        }
        if (typeof mod.load === 'function') {
            // bloque de seguridad por si truena la logica
            try {
                await mod.load(); 
            } catch (err) {
                console.error(` [${name.toUpperCase()}] Pre-flight Error:`, err.message);
            }
        }
    });

    await Promise.all(loadPromises);

    // Phase 2: Synchronous Connections
    modules.forEach(({ name, mod }) => {
        let ws;
        // bloque de seguridad por si truena la logica
        try {
            ws = mod.connect(updateMemory);
        } catch (err) {
            console.error(` [${name.toUpperCase()}] Critical connection error:`, err.message);
            return;
        }
        if (!ws) return;
        ws.on('close', () => {
            console.warn(` [${name.toUpperCase()}] Disconnected. Orchestrator handled disconnect...`);
        });
    });

    console.log(` ccm:  Connections established. Starting display at ${DISPLAY_HZ} Hz...\n`);

    setInterval(() => {
        console.clear();
        console.log(`══════════════════════════════════════════════════════`);
        console.log(`  HFT ORCHESTRATOR TEST (LOCAL)  ·  ${new Date().toLocaleTimeString()}  `);
        console.log(`══════════════════════════════════════════════════════`);
        
        console.log(`\n[ 1. MARKET DATA IN-MEMORY (L2) ]`);
        console.table(marketData);

        console.log(`\n[ 2. RISK ENGINE ACTIVE PARAMETERS ]`);
        console.table(DEFAULT_RULES);

        console.log(`\n[ 3. LIVE EXECUTION LOGS ]`);
        if (recentOpportunities[0].Time !== '') {
            console.table(recentOpportunities);
        } else {
            console.log("   Waiting for opportunities...");
        }

        console.log(`\n STATS: Detected: ${stats.opportunitiesDetected} | Approved: ${stats.opportunitiesApproved} | Blocked: ${stats.opportunitiesBlocked} | Total Theoretical PnL: $${stats.totalProfitUSD.toFixed(2)}`);
    }, DISPLAY_INTERVAL_MS);
}

start();