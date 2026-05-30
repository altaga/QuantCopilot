'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0020,       // 0.20%
    maker: 0.0020,       // 0.20%
    withdrawalBTC: 0.0005
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://api.gateio.ws/ws/v4/');

    ws.on('open', () => {
        console.log('✅ [GATE.IO] Connected');
        ws.send(JSON.stringify({
            time: Math.floor(Date.now() / 1000), channel: 'spot.book_ticker', event: 'subscribe', payload: ['BTC_USDT']
        }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        // Gate.io uses uppercase 'B' for Bid Size and 'A' for Ask Size
        if (j.result && j.result.b && j.result.B) {
            updateMemory('Gateio', parseFloat(j.result.b), parseFloat(j.result.B), parseFloat(j.result.a), parseFloat(j.result.A));
        }
    });

    ws.on('error', (err) => console.error('❌ [GATE.IO] Error:', err.message));
    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };