
const WebSocket = require('ws');

// pegamos contra el socket del exchange
const ws = new WebSocket('wss://api.gateio.ws/ws/v4/');

ws.on('open', () => {
    console.log(' Connected to Gate.io (BTC_USDT)');
    ws.send(JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: 'spot.book_ticker',
        event: 'subscribe',
        payload: ['BTC_USDT']
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
    if (parsed.event === 'update' && parsed.result) {
        const bid = parsed.result.b; // b = best bid
        const ask = parsed.result.a; // a = best ask
        console.log(`[GATE.IO] Bid: ${bid} | Ask: ${ask}`);
    }
});