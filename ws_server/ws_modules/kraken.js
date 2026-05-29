'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0026,       // 0.26%
    maker: 0.0016,       // 0.16%
    withdrawalBTC: 0.00015
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://ws.kraken.com/v2');

    ws.on('open', () => {
        console.log('✅ [KRAKEN] Conectado');
        ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'] } }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        if (j.channel === 'ticker' && j.data && j.data[0]) {
            updateMemory('Kraken', 
                parseFloat(j.data[0].bid), parseFloat(j.data[0].bid_qty), 
                parseFloat(j.data[0].ask), parseFloat(j.data[0].ask_qty)
            );
        }
    });

    ws.on('error', (err) => console.error('❌ [KRAKEN] Error:', err.message));
    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };