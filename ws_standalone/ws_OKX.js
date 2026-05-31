
const WebSocket = require('ws');

// pegamos contra el socket del exchange
const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');

ws.on('open', () => {
    console.log(' Connected to OKX (BTC/USDT)');
    // Subscribe to best bid/offer
    ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'bbo-tbt', instId: 'BTC-USDT' }]
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
    const json = JSON.parse(data.toString());
    if (json.data && json.data[0]) {
        // OKX returns arrays [price, quantity, ...]. We want index [0] of each.
        const bid = json.data[0].bids[0] ? json.data[0].bids[0][0] : null;
        const ask = json.data[0].asks[0] ? json.data[0].asks[0][0] : null;
        
        if(bid && ask) {
            console.log(`okx:  Bid: ${bid} | Ask: ${ask}`);
        }
    }
});

ws.on('error', (err) => console.error('OKX Error:', err));