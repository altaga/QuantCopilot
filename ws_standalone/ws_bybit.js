
const WebSocket = require('ws');

// pegamos contra el socket del exchange
const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');

ws.on('open', () => {
    console.log(' Connected to Bybit V5 (BTCUSDT)');
    
    // 1. Strict subscription to Level 1 of OrderBook (Best Bid / Best Ask)
    ws.send(JSON.stringify({
        op: 'subscribe',
        args: ['orderbook.1.BTCUSDT']
    }));

    // 2. Mandatory Bybit Heartbeat (Ping) every 20 seconds
    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 'ping' }));
        }
    }, 20000);
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

    // Ignore Ping responses ("pong")
    if (parsed.op === 'ping' || parsed.ret_msg === 'pong') return;

    // Successful subscription confirmation
    if (parsed.success === true) {
        console.log(` Subscription confirmed: ${parsed.ret_msg}`);
        return;
    }

    // 3. Data processing (Snapshot or Delta)
    if (parsed.topic === 'orderbook.1.BTCUSDT' && parsed.data) {
        const book = parsed.data;
        
        // Bybit sends arrays: [['price', 'quantity']]
        const bestBid = (book.b && book.b.length > 0) ? book.b[0][0] : null;
        const bestAsk = (book.a && book.a.length > 0) ? book.a[0][0] : null;
        
        // Sometimes sends updates (deltas) for only one side, so we validate
        if (bestBid || bestAsk) {
            let logMsg = `[BYBIT] `;
            if (bestBid) logMsg += `Bid: ${bestBid} `;
            if (bestAsk) logMsg += `| Ask: ${bestAsk}`;
            console.log(logMsg);
        }
    } else if (parsed.ret_msg) {
        // In case it throws a rate limit or malformed error
        console.error(' Bybit message:', parsed.ret_msg);
    }
});

ws.on('error', (err) => console.error(' Bybit network error:', err));

ws.on('close', (code, reason) => {
    console.log(` Bybit disconnected. Code: ${code}`);
});