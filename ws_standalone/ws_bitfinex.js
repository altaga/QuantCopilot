
const WebSocket = require('ws');

// pegamos contra el socket del exchange
const ws = new WebSocket('wss://api-pub.bitfinex.com/ws/2');

ws.on('open', () => {
    console.log(' Connected to Bitfinex (tBTCUSD)');
    ws.send(JSON.stringify({
        event: 'subscribe',
        channel: 'ticker',
        symbol: 'tBTCUSD'
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
    // Bitfinex sends [CHANNEL_ID, [BID, BID_SIZE, ASK, ASK_SIZE, ...]]
    if (Array.isArray(parsed) && Array.isArray(parsed[1])) {
        const bid = parsed[1][0];
        const ask = parsed[1][2];
        console.log(`bitfinex:  Bid: ${bid} | Ask: ${ask}`);
    } else if (parsed.event === 'subscribed') {
        console.log(` Subscription confirmed. Channel ID: ${parsed.chanId}`);
    }
});