'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0040,       // 0.40%
    maker: 0.0030,       // 0.30%
    withdrawalBTC: 0.0005
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://ws.bitstamp.net');

    ws.on('open', () => {
        console.log('✅ [BITSTAMP] Conectado');
        ws.send(JSON.stringify({ event: 'bts:subscribe', data: { channel: 'order_book_btcusd' } }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.event === 'data' && j.data && j.data.bids && j.data.asks) {
            updateMemory('Bitstamp', 
                parseFloat(j.data.bids[0][0]), parseFloat(j.data.bids[0][1]), // BID Price & Vol
                parseFloat(j.data.asks[0][0]), parseFloat(j.data.asks[0][1])  // ASK Price & Vol
            );
        }
    });

    ws.on('error', (err) => console.error('❌ [BITSTAMP] Error:', err.message));
    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };