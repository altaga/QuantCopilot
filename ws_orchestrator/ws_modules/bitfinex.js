'use strict';
const WebSocket = require('ws');

function connect(updateMemory) {
    const ws = new WebSocket('wss://api-pub.bitfinex.com/ws/2');

    ws.on('open', () => {
        console.log('✅ [BITFINEX] Conectado');
        ws.send(JSON.stringify({ event: 'subscribe', channel: 'ticker', symbol: 'tBTCUSD' }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (Array.isArray(j) && Array.isArray(j[1])) {
            updateMemory('Bitfinex', parseFloat(j[1][0]), parseFloat(j[1][2]));
        }
    });

    ws.on('error', (err) => console.error('❌ [BITFINEX] Error:', err.message));
    return ws;
}
module.exports = { connect };