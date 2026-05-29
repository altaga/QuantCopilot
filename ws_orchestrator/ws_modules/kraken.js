'use strict';
const WebSocket = require('ws');

function connect(updateMemory) {
    const ws = new WebSocket('wss://ws.kraken.com/v2');

    ws.on('open', () => {
        console.log('✅ [KRAKEN] Conectado');
        ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'] } }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.channel === 'ticker' && j.data && j.data[0]) {
            updateMemory('Kraken', parseFloat(j.data[0].bid), parseFloat(j.data[0].ask));
        }
    });

    ws.on('error', (err) => console.error('❌ [KRAKEN] Error:', err.message));
    return ws;
}
module.exports = { connect };