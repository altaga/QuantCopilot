'use strict';
const WebSocket = require('ws');

function connect(updateMemory) {
    const ws = new WebSocket('wss://ws.bitstamp.net');

    ws.on('open', () => {
        console.log('✅ [BITSTAMP] Conectado');
        ws.send(JSON.stringify({ event: 'bts:subscribe', data: { channel: 'order_book_btcusd' } }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.event === 'data' && j.data && j.data.bids) {
            updateMemory('Bitstamp', parseFloat(j.data.bids[0][0]), parseFloat(j.data.asks[0][0]));
        }
    });

    ws.on('error', (err) => console.error('❌ [BITSTAMP] Error:', err.message));
    return ws;
}
module.exports = { connect };