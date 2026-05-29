'use strict';

const { calculateTruePrice } = require('./oracle/oracle-engine');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const TOPIC = 'market/btc/ticker';
const ALERTS_TOPIC = 'ARBITRAGE_ALERTS';
const PUBLISH_HZ = 10; // Hz (10 actualizaciones por segundo al frontend)
const PUBLISH_INTERVAL_MS = Math.round(1000 / PUBLISH_HZ);

const EXCHANGES = [
    'binance', 'kraken', 'coinbase', 'okx', 'bitfinex',
    'bybit', 'gateio', 'gemini', 'bitstamp', 'kucoin'
];

// Costos de slippage de referencia (en USD)
const EST_SLIPPAGE_USD = 2.50; 

// ─── STATE & MEMORY ───────────────────────────────────────────────────────────
const marketData = {
    Binance:  { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    Kraken:   { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    Coinbase: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    OKX:      { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    Bitfinex: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    Bybit:    { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    Gateio:   { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    Gemini:   { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    Bitstamp: { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 },
    Kucoin:   { bid: 0, bidVol: 0, ask: 0, askVol: 0, timestamp: 0 } 
};

// Diccionario global de fees
let globalExchangeFees = {};
// Referencia a redis para usar en el detector de arbitraje
let redisClientRef = null; 

// ─── FUNCIONES CORE ───────────────────────────────────────────────────────────

function updateMemory(exchange, bidPrice, bidVol, askPrice, askVol) {
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
        // ⚡ Ejecutar el motor de detección cruzada inmediatamente tras la actualización
        detectCrossExchangeArbitrage();
    }
}

function detectCrossExchangeArbitrage() {
    if (!redisClientRef) return; // No hacer nada si Redis no está listo

    const exchanges = Object.keys(marketData);

    // O(N^2) Comparar cada exchange contra todos los demás
    for (let i = 0; i < exchanges.length; i++) {
        for (let j = 0; j < exchanges.length; j++) {
            if (i === j) continue; 

            const exchangeA = exchanges[i]; // Comprar aquí (Barato)
            const exchangeB = exchanges[j]; // Vender aquí (Caro)

            const askA = marketData[exchangeA].ask;
            const volA = marketData[exchangeA].askVol;
            const bidB = marketData[exchangeB].bid;
            const volB = marketData[exchangeB].bidVol;

            // Asegurarnos de que tenemos datos válidos para evaluar
            if (!askA || !bidB || askA === 0 || bidB === 0) continue;

            // Filtro Rápido: ¿Hay divergencia de precio bruto?
            if (askA < bidB) {
                
                const feeA = globalExchangeFees[exchangeA]?.taker || 0.0020; 
                const feeB = globalExchangeFees[exchangeB]?.taker || 0.0020;

                // Cuello de botella de liquidez (Volumen Ejecutable)
                const volumenEjecutable = Math.min(volA, volB);

                if (volumenEjecutable === 0) continue; // No hay liquidez

                // --- Cálculo de Rentabilidad Neta ---
                const costoCompraReal = askA * (1 + feeA);
                const ingresoVentaReal = bidB * (1 - feeB);
                
                const profitNetoPorUnidad = ingresoVentaReal - costoCompraReal;
                
                // Calcular precio de referencia global (True Price) y fee de retiro dinámico en USD
                const truePrice = calculateTruePrice(marketData) || askA;
                const withdrawalBTC = globalExchangeFees[exchangeA]?.withdrawalBTC || 0.0003;
                const dynamicWithdrawalFeeUSD = withdrawalBTC * truePrice;
                
                // Slippage estimado dinámico (mínimo de seguridad o 0.01% del volumen total de la orden)
                const dynamicSlippageUSD = Math.max(EST_SLIPPAGE_USD, (askA * volumenEjecutable) * 0.0001);
                
                const gananciaNetaTotalUSD = (profitNetoPorUnidad * volumenEjecutable) - (dynamicWithdrawalFeeUSD + dynamicSlippageUSD);

                // Si es rentable, disparamos la alerta
                if (gananciaNetaTotalUSD > 0) {
                    const oportunidad = {
                        id: `ARB-${Date.now()}`,
                        compraEn: exchangeA,
                        vendeEn: exchangeB,
                        precioCompra: askA,
                        precioVenta: bidB,
                        volumen: volumenEjecutable,
                        profitTotalUSD: parseFloat(gananciaNetaTotalUSD.toFixed(4)),
                        timestamp: Date.now()
                    };

                    redisClientRef.publish(ALERTS_TOPIC, JSON.stringify(oportunidad));
                    
                    // Solo para debug local en consola (Opcional, se puede comentar en prod)
                    // console.log(`🟢 [HFT ALERT] ${exchangeA} -> ${exchangeB} | Profit Neto: $${gananciaNetaTotalUSD.toFixed(2)} USD`);
                }
            }
        }
    }
}

// ─── INITIALIZATION ───────────────────────────────────────────────────────────

async function start(redisPub) {
    console.log('🚀 [CCM] Inicializando Orquestador HFT...');
    redisClientRef = redisPub; // Guardamos la referencia para las alertas
    
    const modules = EXCHANGES.map(name => ({ name, mod: require(`./ws_modules/${name}`) }));

    async function connectModule(name, mod) {
        // Cargar Fees del módulo al diccionario global
        if (typeof mod.getFees === 'function') {
            // Capitalizar la primera letra para que coincida con las llaves de marketData
            const exchangeKey = name.charAt(0).toUpperCase() + name.slice(1);
            globalExchangeFees[exchangeKey] = mod.getFees();
        }

        // FASE 1: Pre-flight
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

    await Promise.all(modules.map(({ name, mod }) => connectModule(name, mod)));

    console.log(`✅ [CCM] Conexiones y Fees establecidos. Publicando ticks en "${TOPIC}" a ${PUBLISH_HZ} Hz.\n`);

    // ── HFT TICK PUBLISH LOOP ───────────────────────────────────────────────
    setInterval(() => {
        // Creamos un payload formateado para el Frontend (quitamos bidVol/askVol si solo necesita precios para el chart principal)
        const frontEndData = {};
        for (const [exchange, data] of Object.entries(marketData)) {
            frontEndData[exchange] = { bid: data.bid, ask: data.ask };
        }

        const truePrice = calculateTruePrice(marketData);

        const msg = {
            sender: 'ccm-orchestrator',
            ts: Date.now(),
            data: frontEndData,
            truePrice: truePrice ? parseFloat(truePrice.toFixed(2)) : null
        };
        
        redisPub.publish(TOPIC, JSON.stringify(msg));
    }, PUBLISH_INTERVAL_MS);
}

// Expuesta para que el index.js la envíe al frontend al conectarse
function getExchangeFees() {
    return globalExchangeFees;
}

module.exports = { start, updateMemory, getExchangeFees };