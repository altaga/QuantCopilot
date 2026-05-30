const WebSocket = require('ws');

const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');

ws.on('open', () => {
    console.log('✅ Connected to OKX (BTC/USDT)');
    // Subscribe to best bid/offer
    ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'bbo-tbt', instId: 'BTC-USDT' }]
    }));
});

ws.on('message', (data) => {
    const json = JSON.parse(data.toString());
    if (json.data && json.data[0]) {
        // OKX returns arrays [price, quantity, ...]. We want index [0] of each.
        const bid = json.data[0].bids[0] ? json.data[0].bids[0][0] : null;
        const ask = json.data[0].asks[0] ? json.data[0].asks[0][0] : null;
        
        if(bid && ask) {
            console.log(`[OKX] Bid: ${bid} | Ask: ${ask}`);
        }
    }
});

ws.on('error', (err) => console.error('OKX Error:', err));