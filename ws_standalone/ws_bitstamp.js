
const WebSocket = require('ws');

// pegamos contra el socket del exchange
const ws = new WebSocket('wss://ws.bitstamp.net');

ws.on('open', () => {
    console.log(' Connected to Bitstamp (BTCUSD)');
    ws.send(JSON.stringify({
        event: 'bts:subscribe',
        data: { channel: 'order_book_btcusd' } // Lowercase pair
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
    if (parsed.event === 'data' && parsed.data) {
        // Bitstamp sends the Order Book, we read the top (Level 1)
        const bestBid = parsed.data.bids[0][0];
        const bestAsk = parsed.data.asks[0][0];
        console.log(`bitstamp:  Bid: ${bestBid} | Ask: ${bestAsk}`);
    } else if (parsed.event === 'bts:subscription_succeeded') {
        console.log(` Bitstamp subscription confirmed.`);
    }
});