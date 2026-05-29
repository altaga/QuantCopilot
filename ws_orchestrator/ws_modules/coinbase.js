'use strict';
const WebSocket = require('ws');

function connect(updateMemory) {
    const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');

    ws.on('open', () => {
        console.log('✅ [COINBASE] Conectado');
        ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channel: 'ticker' }));
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data);
            if (j.events && j.events[0] && j.events[0].tickers) {
                const ticker = j.events[0].tickers[0];
                updateMemory('Coinbase', parseFloat(ticker.best_bid), parseFloat(ticker.best_ask));
            }
        } catch (_) {} 
    });

    ws.on('error', (err) => console.error('❌ [COINBASE] Error:', err.message));
    return ws;
}
module.exports = { connect };