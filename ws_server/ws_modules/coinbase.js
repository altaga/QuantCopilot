'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0060,       // 0.60%
    maker: 0.0040,       // 0.40%
    withdrawalBTC: 0.0005 // Dynamic, safe estimation
};

function connect(updateMemory) {
    const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Coinbase', 0, 0, 0, 0);
        console.warn('⚠️ [COINBASE] Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log('✅ [COINBASE] Connected');
        ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channel: 'ticker' }));
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data);
            if (j.events && j.events[0] && j.events[0].tickers) {
                const ticker = j.events[0].tickers[0];
                updateMemory('Coinbase', 
                    parseFloat(ticker.best_bid), parseFloat(ticker.best_bid_quantity), 
                    parseFloat(ticker.best_ask), parseFloat(ticker.best_ask_quantity)
                );
            }
        } catch (_) {} 
    });

    ws.on('error', (err) => {
        console.error('❌ [COINBASE] Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };