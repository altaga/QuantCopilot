
const WebSocket = require('ws');

// pegamos contra el socket del exchange
const ws = new WebSocket('wss://api.gemini.com/v2/marketdata');

ws.on('open', () => {
    console.log(' Connected to Gemini (BTCUSD)');
    ws.send(JSON.stringify({
        type: 'subscribe',
        subscriptions: [{ name: 'l2', symbols: ['BTCUSD'] }]
    }));
});

// procesamos el tick entrante del socket
ws.on('message', (data) => {
        // 🛡️ HFT Backpressure Shield
        if (data && data.length > 50000) {
            console.warn(' backpressure:  Payload exceeded 50KB. Dropped.');
            return;
        }

    // parseamos el payload (asumimos que viene limpio pero cuidadito)
    const parsed = JSON.parse(data);
    if (parsed.type === 'l2_updates' && parsed.changes) {
        // Gemini sends book updates, show the first change
        const change = parsed.changes[0]; 
        const side = change[0] === 'buy' ? 'Bid' : 'Ask';
        const price = change[1];
        console.log(`gemini:  L2 Update -> ${side}: ${price}`);
    }
});