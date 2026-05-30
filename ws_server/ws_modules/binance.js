'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0010,       // 0.10%
    maker: 0.0010,       // 0.10%
    withdrawalBTC: 0.0003
};

const ENDPOINTS = [
    { url: 'wss://stream.binance.us:9443/ws/btcusd@bookTicker',   label: 'Binance.US' }
];

function connect(updateMemory, endpointIndex = 0) {
    if (endpointIndex >= ENDPOINTS.length) {
        console.error('❌ [BINANCE] All endpoints blocked.');
        return null;
    }

    const { url, label } = ENDPOINTS[endpointIndex];
    const ws = new WebSocket(url);
    let opened = false;
    let fallbackTriggered = false;

    const triggerFallback = () => {
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        ws.terminate();
        console.warn(`⚠️ [BINANCE] Connection failed with ${label}. Trying fallback...`);
        setTimeout(() => connect(updateMemory, endpointIndex + 1), 1000);
    };

    ws.on('open', () => {
        opened = true;
        console.log(`✅ [BINANCE] Connected via ${label}`);
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.b && j.a && j.B && j.A) {
            updateMemory('Binance', parseFloat(j.b), parseFloat(j.B), parseFloat(j.a), parseFloat(j.A));
        }
    });

    ws.on('unexpected-response', () => {
        triggerFallback();
    });

    ws.on('error', (err) => {
        if (!opened) {
            console.error(`❌ [BINANCE] Connection error in ${label}:`, err.message);
            triggerFallback();
        } else {
            console.error(`❌ [BINANCE] Error in ${label}:`, err.message);
        }
    });

    ws.on('close', () => {
        if (!opened) {
            triggerFallback();
        }
    });

    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };