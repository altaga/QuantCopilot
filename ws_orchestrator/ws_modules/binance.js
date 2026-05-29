'use strict';
const WebSocket = require('ws');

const ENDPOINTS = [
    'wss://stream.binance.com:9443/ws/btcusdt@bookTicker',
    'wss://stream.binance.us:9443/ws/btcusd@bookTicker',
    'wss://data-api.binance.vision/ws/btcusdt@bookTicker'
];
let currentIndex = 0;

function connect(updateMemory) {
    const url = ENDPOINTS[currentIndex];
    const ws = new WebSocket(url);

    ws.on('open', () => {
        console.log(`✅ [BINANCE] Conectado a ${url.includes('binance.us') ? 'Binance.US' : url.includes('vision') ? 'Binance Vision' : 'Binance.com'}`);
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data);
            if (j.b && j.a) {
                updateMemory('Binance', parseFloat(j.b), parseFloat(j.a));
            }
        } catch (_err) {
            // Ignore parsing errors
        }
    });

    ws.on('unexpected-response', () => {
        currentIndex = (currentIndex + 1) % ENDPOINTS.length;
        ws.terminate();
    });

    ws.on('error', (err) => {
        console.error(`❌ [BINANCE] Error:`, err.message);
        currentIndex = (currentIndex + 1) % ENDPOINTS.length;
    });

    return ws;
}

module.exports = { connect };