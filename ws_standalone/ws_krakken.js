
const WebSocket = require('ws');

// pegamos contra el socket del exchange
const ws = new WebSocket('wss://ws.kraken.com/v2');

ws.on('open', () => {
    console.log(' Connected to Kraken (BTC/USD)');
    // Send the subscription message
    ws.send(JSON.stringify({
        method: 'subscribe',
        params: {
            channel: 'ticker',
            symbol: ['BTC/USD']
        }
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
    const json = JSON.parse(data);
    if (json.channel === 'ticker' && json.type === 'update') {
        const ticker = json.data[0];
        console.log(`kraken:  Bid: ${ticker.bid} | Ask: ${ticker.ask}`);
    }
});

ws.on('error', (err) => console.error('Kraken Error:', err));