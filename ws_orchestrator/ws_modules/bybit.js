'use strict';
const WebSocket = require('ws');

function connect(updateMemory) {
    const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');

    ws.on('open', () => {
        console.log('✅ [BYBIT] Conectado');
        ws.send(JSON.stringify({ op: 'subscribe', args: ['orderbook.1.BTCUSDT'] }));
        ws.pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
        }, 20000);
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.ret_msg === 'pong' || j.op === 'ping') return;
        if (j.data) {
            const bid = (j.data.b && j.data.b[0]) ? parseFloat(j.data.b[0][0]) : null;
            const ask = (j.data.a && j.data.a[0]) ? parseFloat(j.data.a[0][0]) : null;
            updateMemory('Bybit', bid, ask);
        }
    });

    ws.on('close', () => clearInterval(ws.pingInterval));
    ws.on('error', (err) => console.error('❌ [BYBIT] Error:', err.message));
    return ws;
}
module.exports = { connect };