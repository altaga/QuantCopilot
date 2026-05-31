const WebSocket = require('ws');

const ws = new WebSocket('wss://stream.binance.us:9443/ws/btcusd@bookTicker');

ws.on('open', () => {
    console.log('✅ Connected to Binance (BTC/USD)');
});

ws.on('message', (data) => {
    const json = JSON.parse(data);
    // 'b' = best bid, 'a' = best ask
    console.log(`[BINANCE] Bid: ${json.b} | Ask: ${json.a}`);
});

ws.on('error', (err) => console.error('Binance Error:', err));