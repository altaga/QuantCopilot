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

    ws.on('open', () => {
        console.log('✅ [OKX] Conectado');
        ws.send(JSON.stringify({
            op: 'subscribe',
            args: [{ channel: 'bbo-tbt', instId: 'BTC-USDT' }]
        }));
    });

    ws.on('message', (data) => {
        const j = JSON.parse(data.toString());
        if (j.data && j.data[0]) {
            const bidPrice = j.data[0].bids[0] ? parseFloat(j.data[0].bids[0][0]) : null;
            const bidVol   = j.data[0].bids[0] ? parseFloat(j.data[0].bids[0][1]) : null;
            
            const askPrice = j.data[0].asks[0] ? parseFloat(j.data[0].asks[0][0]) : null;
            const askVol   = j.data[0].asks[0] ? parseFloat(j.data[0].asks[0][1]) : null;
            
            updateMemory('OKX', bidPrice, bidVol, askPrice, askVol);
        }
    });

    ws.on('error', (err) => console.error('❌ [OKX] Error:', err.message));
    ws.on('close', (code) => console.warn(`🔌 [OKX] Desconectado. Código: ${code}`));

    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };