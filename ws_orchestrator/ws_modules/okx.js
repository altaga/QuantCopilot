'use strict';
const WebSocket = require('ws');

/**
 * OKX – BTC-USDT bbo-tbt
 * @param {Function} updateMemory  (exchange, bid, ask) => void
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
            const bid = j.data[0].bids[0] ? j.data[0].bids[0][0] : null;
            const ask = j.data[0].asks[0] ? j.data[0].asks[0][0] : null;
            updateMemory('OKX', bid, ask);
        }
    });

    ws.on('error', (err) => console.error('❌ [OKX] Error:', err.message));
    ws.on('close', (code) => console.warn(`🔌 [OKX] Desconectado. Código: ${code}`));

    return ws;
}

module.exports = { connect };
