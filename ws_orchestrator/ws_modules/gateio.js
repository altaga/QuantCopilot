'use strict';
const WebSocket = require('ws');

function connect(updateMemory) {
    const ws = new WebSocket('wss://api.gateio.ws/ws/v4/');

    ws.on('open', () => {
        console.log('✅ [GATE.IO] Conectado');
        ws.send(JSON.stringify({
            time: Math.floor(Date.now() / 1000), channel: 'spot.book_ticker', event: 'subscribe', payload: ['BTC_USDT']
        }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.result) {
            updateMemory('Gateio', parseFloat(j.result.b), parseFloat(j.result.a));
        }
    });

    ws.on('error', (err) => console.error('❌ [GATE.IO] Error:', err.message));
    return ws;
}
module.exports = { connect };