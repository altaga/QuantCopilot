const WebSocket = require('ws');

const ws = new WebSocket('wss://api.gemini.com/v2/marketdata');

ws.on('open', () => {
    console.log('✅ Connected to Gemini (BTCUSD)');
    ws.send(JSON.stringify({
        type: 'subscribe',
        subscriptions: [{ name: 'l2', symbols: ['BTCUSD'] }]
    }));
});

ws.on('message', (data) => {
    const parsed = JSON.parse(data);
    if (parsed.type === 'l2_updates' && parsed.changes) {
        // Gemini sends book updates, show the first change
        const change = parsed.changes[0]; 
        const side = change[0] === 'buy' ? 'Bid' : 'Ask';
        const price = change[1];
        console.log(`[GEMINI] L2 Update -> ${side}: ${price}`);
    }
});