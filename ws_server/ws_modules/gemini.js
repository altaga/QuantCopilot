'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0040,       // 0.40%
    maker: 0.0020,       // 0.20%
    withdrawalBTC: 0.0002 // 10 gratis mensuales, luego dinámica
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://api.gemini.com/v2/marketdata');

    ws.on('open', () => {
        console.log('✅ [GEMINI] Conectado');
        ws.send(JSON.stringify({ type: 'subscribe', subscriptions: [{ name: 'l2', symbols: ['BTCUSD'] }] }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.type === 'l2_updates' && j.changes && j.changes[0]) {
            // El formato es [side, price, quantity]
            const [side, price, qty] = j.changes[0];
            const parsedPrice = parseFloat(price);
            const parsedQty = parseFloat(qty);
            
            const bidPrice = side === 'buy'  ? parsedPrice : null;
            const bidVol   = side === 'buy'  ? parsedQty   : null;
            
            const askPrice = side === 'sell' ? parsedPrice : null;
            const askVol   = side === 'sell' ? parsedQty   : null;
            
            updateMemory('Gemini', bidPrice, bidVol, askPrice, askVol);
        }
    });

    ws.on('error', (err) => console.error('❌ [GEMINI] Error:', err.message));
    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };