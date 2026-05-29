'use strict';
const WebSocket = require('ws');

function connect(updateMemory) {
    const ws = new WebSocket('wss://api.gemini.com/v2/marketdata');

    ws.on('open', () => {
        console.log('✅ [GEMINI] Conectado');
        ws.send(JSON.stringify({ type: 'subscribe', subscriptions: [{ name: 'l2', symbols: ['BTCUSD'] }] }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.type === 'l2_updates' && j.changes && j.changes[0]) {
            const [side, price] = j.changes[0];
            const parsedPrice = parseFloat(price);
            const bid = side === 'buy'  ? parsedPrice : null;
            const ask = side === 'sell' ? parsedPrice : null;
            updateMemory('Gemini', bid, ask);
        }
    });

    ws.on('error', (err) => console.error('❌ [GEMINI] Error:', err.message));
    return ws;
}
module.exports = { connect };