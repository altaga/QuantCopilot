'use strict';

const { evaluate, DEFAULT_RULES } = require("../ws_server/tools/risk-engine");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DISPLAY_HZ = 2; // Hz (2 refreshes per second in the console)
const DISPLAY_INTERVAL_MS = Math.round(1000 / DISPLAY_HZ);

const EXCHANGES = [
    'binance', 'kraken', 'coinbase', 'okx', 'bitfinex',
    'bybit', 'gateio', 'gemini', 'bitstamp', 'kucoin', 'rektswap'
];

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

let globalExchangeFees = {};
let stats = {
    opportunitiesDetected: 0,
    opportunitiesApproved: 0,
    opportunitiesBlocked: 0,
    totalProfitUSD: 0
};
let recentOpportunities = [];

function addOpportunityLog(opp, verdict) {
    recentOpportunities.unshift({
        Time: new Date().toLocaleTimeString(),
        Route: `${opp.buyExchange} -> ${opp.sellExchange}`,
        Vol: opp.volume.toFixed(2),
        Profit: `$${opp.profitUSD.toFixed(2)}`,
        Status: verdict.approved ? '✅ APPROVED' : '⛔ BLOCKED',
        Reason: verdict.reason || 'OK'
    });
    if (recentOpportunities.length > 5) {
        recentOpportunities.pop();
    }
}

function updateMemory(exchange, bid, ask) {
    let updated = false;
    if (bid !== null) {
        const num = parseFloat(bid);
        if (num > 0) { marketData[exchange].bid = num; updated = true; }
    }
    if (ask !== null) {
        const num = parseFloat(ask);
        if (num > 0) { marketData[exchange].ask = num; updated = true; }
    }

    if (updated) {
        detectCrossExchangeArbitrage();
    }
}

function detectCrossExchangeArbitrage() {
    const exchanges = Object.keys(marketData);

    for (let i = 0; i < exchanges.length; i++) {
        for (let j = 0; j < exchanges.length; j++) {
            if (i === j) continue;

            const exchangeA = exchanges[i]; // Buy here
            const exchangeB = exchanges[j]; // Sell here

            const askA = marketData[exchangeA].ask;
            const volA = 1.5; // Mocking volume for local test
            const bidB = marketData[exchangeB].bid;
            const volB = 1.5;

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
                    
                    const opportunity = {
                        buyExchange: exchangeA,
                        sellExchange: exchangeB,
                        buyPrice: askA,
                        sellPrice: bidB,
                        volume: executableVolume,
                        profitUSD: parseFloat(netProfitTotalUSD.toFixed(4))
                    };

                    const verdict = evaluate(opportunity, DEFAULT_RULES, marketData);
                    
                    addOpportunityLog(opportunity, verdict);

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
    console.log('🚀 [CCM] Initializing Test Orchestrator (Math Logic & Risk Engine)...');
    
    const modules = EXCHANGES.map(name => ({ name, mod: require(`./ws_modules/${name}`) }));

    async function connectModule(name, mod) {
        if (typeof mod.getFees === 'function') {
            const exchangeKey = name.charAt(0).toUpperCase() + name.slice(1);
            globalExchangeFees[exchangeKey] = mod.getFees();
        }

        if (typeof mod.load === 'function') {
            try {
                await mod.load(); 
            } catch (err) {
                console.error(`❌ [${name.toUpperCase()}] Pre-flight Error:`, err.message);
                setTimeout(() => connectModule(name, mod), 5000); 
                return;
            }
        }

        let ws;
        try {
            ws = mod.connect(updateMemory);
        } catch (err) {
            console.error(`❌ [${name.toUpperCase()}] Critical connection error:`, err.message);
            return;
        }

        if (!ws) return;

        ws.on('close', () => {
            console.warn(`⚠️ [${name.toUpperCase()}] Disconnected. Reconnecting in 5s...`);
            setTimeout(() => connectModule(name, mod), 5000);
        });
    }

    await Promise.all(modules.map(({ name, mod }) => connectModule(name, mod)));

    console.log(`✅ [CCM] Connections established. Starting display at ${DISPLAY_HZ} Hz...\n`);

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
        if (recentOpportunities.length > 0) {
            console.table(recentOpportunities);
        } else {
            console.log("   Waiting for opportunities...");
        }

        console.log(`\n📊 STATS: Detected: ${stats.opportunitiesDetected} | Approved: ${stats.opportunitiesApproved} | Blocked: ${stats.opportunitiesBlocked} | Total Theoretical PnL: $${stats.totalProfitUSD.toFixed(2)}`);
    }, DISPLAY_INTERVAL_MS);
}

start();