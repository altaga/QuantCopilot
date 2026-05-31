'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0000,       // 0.00% (P2P/Tier Discounts)
    maker: 0.0000,       // 0.00%
    withdrawalBTC: 0.00006
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://api-pub.bitfinex.com/ws/2');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Bitfinex', 0, 0, 0, 0);
        console.warn('⚠️ [BITFINEX] Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log('✅ [BITFINEX] Connected');
        ws.send(JSON.stringify({ event: 'subscribe', channel: 'ticker', symbol: 'tBTCUSD' }));
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data);
            if (Array.isArray(j) && Array.isArray(j[1])) {
                updateMemory('Bitfinex', parseFloat(j[1][0]), parseFloat(j[1][1]), parseFloat(j[1][2]), parseFloat(j[1][3]));
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => {
        console.error('❌ [BITFINEX] Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };