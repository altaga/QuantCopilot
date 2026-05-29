'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0000,       // 0.00% (Descuentos P2P/Tier)
    maker: 0.0000,       // 0.00%
    withdrawalBTC: 0.00006
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://api-pub.bitfinex.com/ws/2');

    ws.on('open', () => {
        console.log('✅ [BITFINEX] Conectado');
        ws.send(JSON.stringify({ event: 'subscribe', channel: 'ticker', symbol: 'tBTCUSD' }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data);
        // Payload de Bitfinex: [ CHANNEL_ID, [BID, BID_SIZE, ASK, ASK_SIZE, ...] ]
        if (Array.isArray(j) && Array.isArray(j[1])) {
            updateMemory('Bitfinex', parseFloat(j[1][0]), parseFloat(j[1][1]), parseFloat(j[1][2]), parseFloat(j[1][3]));
        }
    });

    ws.on('error', (err) => console.error('❌ [BITFINEX] Error:', err.message));
    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };