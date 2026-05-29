'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0010,       // 0.10%
    maker: 0.0010,       // 0.10%
    withdrawalBTC: 0.0003
};

const ENDPOINTS = [
    { url: 'wss://stream.binance.us:9443/ws/btcusd@bookTicker',   label: 'Binance.US' },
    { url: 'wss://data-api.binance.vision/ws/btcusdt@bookTicker', label: 'Binance Vision (Data API)' },
    { url: 'wss://stream.binance.com:9443/ws/btcusdt@bookTicker', label: 'Binance.com' },
];

function connect(updateMemory, endpointIndex = 0) {
    if (endpointIndex >= ENDPOINTS.length) {
        console.error('❌ [BINANCE] Todos los endpoints bloqueados.');
        return null;
    }

    const { url, label } = ENDPOINTS[endpointIndex];
    const ws = new WebSocket(url);
    let redirecting = false;

    ws.on('open', () => console.log(`✅ [BINANCE] Conectado vía ${label}`));

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.b && j.a && j.B && j.A) {
            // (exchange, bidPrice, bidVol, askPrice, askVol)
            updateMemory('Binance', parseFloat(j.b), parseFloat(j.B), parseFloat(j.a), parseFloat(j.A));
        }
    });

    ws.on('unexpected-response', (_req, res) => {
        redirecting = true;
        ws.terminate();
        setTimeout(() => connect(updateMemory, endpointIndex + 1), 1000);
    });

    ws.on('error', (err) => { if (!redirecting) console.error('❌ [BINANCE] Error:', err.message); });
    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };