'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0040,       // 0.40%
    maker: 0.0020,       // 0.20%
    withdrawalBTC: 0.0002 // 10 free monthly, then dynamic
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://api.gemini.com/v2/marketdata');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Gemini', 0, 0, 0, 0);
        console.warn('⚠️ [GEMINI] Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log('✅ [GEMINI] Connected');
        ws.send(JSON.stringify({ type: 'subscribe', subscriptions: [{ name: 'l2', symbols: ['BTCUSD'] }] }));
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data);
            if (j.type === 'l2_updates' && j.changes && j.changes[0]) {
                // The format is [side, price, quantity]
                const [side, price, qty] = j.changes[0];
                const parsedPrice = parseFloat(price);
                const parsedQty = parseFloat(qty);
                
                const bidPrice = side === 'buy'  ? parsedPrice : null;
                const bidVol   = side === 'buy'  ? parsedQty   : null;
                
                const askPrice = side === 'sell' ? parsedPrice : null;
                const askVol   = side === 'sell' ? parsedQty   : null;
                
                updateMemory('Gemini', bidPrice, bidVol, askPrice, askVol);
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => {
        console.error('❌ [GEMINI] Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };