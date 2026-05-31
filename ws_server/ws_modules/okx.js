'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0010,       // 0.10%
    maker: 0.0008,       // 0.08%
    withdrawalBTC: 0.0004
};

/**
 * OKX – BTC-USDT bbo-tbt
 */
function connect(updateMemory) {
    const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('OKX', 0, 0, 0, 0);
        console.warn('⚠️ [OKX] Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log('✅ [OKX] Connected');
        ws.send(JSON.stringify({
            op: 'subscribe',
            args: [{ channel: 'bbo-tbt', instId: 'BTC-USDT' }]
        }));
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data.toString());
            if (j.data && j.data[0]) {
                const bidPrice = j.data[0].bids[0] ? parseFloat(j.data[0].bids[0][0]) : null;
                const bidVol   = j.data[0].bids[0] ? parseFloat(j.data[0].bids[0][1]) : null;
                
                const askPrice = j.data[0].asks[0] ? parseFloat(j.data[0].asks[0][0]) : null;
                const askVol   = j.data[0].asks[0] ? parseFloat(j.data[0].asks[0][1]) : null;
                
                updateMemory('OKX', bidPrice, bidVol, askPrice, askVol);
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => {
        console.error('❌ [OKX] Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };