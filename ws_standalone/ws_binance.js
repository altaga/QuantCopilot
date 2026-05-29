const WebSocket = require('ws');

const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@bookTicker');

ws.on('open', () => {
    console.log('✅ Conectado a Binance (BTC/USDT)');
});

ws.on('message', (data) => {
    const json = JSON.parse(data);
    // 'b' = best bid, 'a' = best ask
    console.log(`[BINANCE] Bid: ${json.b} | Ask: ${json.a}`);
});

ws.on('error', (err) => console.error('Error Binance:', err));