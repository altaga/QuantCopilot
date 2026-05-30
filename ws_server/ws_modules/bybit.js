'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0010,       // 0.10%
    maker: 0.0010,       // 0.10%
    withdrawalBTC: 0.0005
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');

    ws.on('open', () => {
        console.log('✅ [BYBIT] Connected');
        ws.send(JSON.stringify({ op: 'subscribe', args: ['orderbook.1.BTCUSDT'] }));
        ws.pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
        }, 20000);
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.ret_msg === 'pong' || j.op === 'ping') return;
        if (j.data) {
            const bidPrice = (j.data.b && j.data.b[0]) ? parseFloat(j.data.b[0][0]) : null;
            const bidVol   = (j.data.b && j.data.b[0]) ? parseFloat(j.data.b[0][1]) : null;
            
            const askPrice = (j.data.a && j.data.a[0]) ? parseFloat(j.data.a[0][0]) : null;
            const askVol   = (j.data.a && j.data.a[0]) ? parseFloat(j.data.a[0][1]) : null;
            
            updateMemory('Bybit', bidPrice, bidVol, askPrice, askVol);
        }
    });

    ws.on('close', () => clearInterval(ws.pingInterval));
    ws.on('error', (err) => console.error('❌ [BYBIT] Error:', err.message));
    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };