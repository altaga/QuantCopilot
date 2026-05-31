'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0026,       // 0.26%
    maker: 0.0016,       // 0.16%
    withdrawalBTC: 0.00015
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://ws.kraken.com/v2');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Kraken', 0, 0, 0, 0);
        console.warn('⚠️ [KRAKEN] Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log('✅ [KRAKEN] Connected');
        ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'] } }));
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data);
            if (j.channel === 'ticker' && j.data && j.data[0]) {
                updateMemory('Kraken', 
                    parseFloat(j.data[0].bid), parseFloat(j.data[0].bid_qty), 
                    parseFloat(j.data[0].ask), parseFloat(j.data[0].ask_qty)
                );
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => {
        console.error('❌ [KRAKEN] Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };