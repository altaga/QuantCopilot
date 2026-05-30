'use strict';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DISPLAY_HZ = 2; // Hz (2 refreshes per second in the console)
const DISPLAY_INTERVAL_MS = Math.round(1000 / DISPLAY_HZ);

const EXCHANGES = [
    'binance', 'kraken', 'coinbase', 'okx', 'bitfinex',
    'bybit', 'gateio', 'gemini', 'bitstamp', 'kucoin', 'rektswap'
];

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

function updateMemory(exchange, bid, ask) {
    if (bid !== null) {
        const num = parseFloat(bid);
        if (num > 0) marketData[exchange].bid = num;
    }
    if (ask !== null) {
        const num = parseFloat(ask);
        if (num > 0) marketData[exchange].ask = num;
    }
}

async function start() {
    console.log('🚀 [CCM] Inicializando Orquestador de Pruebas (Display Local)...');
    
    // Importación dinámica desde la carpeta ws_modules/
    const modules = EXCHANGES.map(name => ({ name, mod: require(`./ws_modules/${name}`) }));

    async function connectModule(name, mod) {
        // FASE 1: Pre-flight (ej. KuCoin REST Token)
        if (typeof mod.load === 'function') {
            try {
                await mod.load(); 
            } catch (err) {
                console.error(`❌ [${name.toUpperCase()}] Error en Pre-flight:`, err.message);
                setTimeout(() => connectModule(name, mod), 5000); 
                return;
            }
        }

        // FASE 2: Conexión WebSocket
        let ws;
        try {
            ws = mod.connect(updateMemory);
        } catch (err) {
            console.error(`❌ [${name.toUpperCase()}] Error crítico al conectar:`, err.message);
            return;
        }

        if (!ws) return;

        // FASE 3: Auto-reconexión robusta
        ws.on('close', () => {
            console.warn(`⚠️ [${name.toUpperCase()}] Desconectado. Reconectando en 5s...`);
            setTimeout(() => connectModule(name, mod), 5000);
        });
    }

    // Disparar todas las conexiones
    await Promise.all(modules.map(({ name, mod }) => connectModule(name, mod)));

    console.log(`✅ [CCM] Conexiones establecidas. Iniciando display a ${DISPLAY_HZ} Hz...\n`);

    // ── DISPLAY LOOP ────────────────────────────────────────────────────────
    setInterval(() => {
        console.clear();
        console.log(`══════════════════════════════════════════════════════`);
        console.log(`  ORQUESTADOR HFT (PRUEBA)  ·  ${new Date().toLocaleTimeString()}  ·  BTC/USD`);
        console.log(`══════════════════════════════════════════════════════`);
        console.table(marketData);
    }, DISPLAY_INTERVAL_MS);
}

start();