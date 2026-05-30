const WebSocket = require('ws');

// Create the connection
const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');

ws.on('open', () => {
    console.log('✅ Connected to Coinbase (BTC-USD)');
    
    // Subscription to 'ticker' channel.
    // This channel guarantees sending both: best_bid and best_ask.
    ws.send(JSON.stringify({
        type: 'subscribe',
        product_ids: ['BTC-USD'],
        channel: 'ticker' 
    }));
});

ws.on('message', (data) => {
    try {
        const json = JSON.parse(data);

        // Coinbase sends a list of events
        if (json.events && json.events[0] && json.events[0].tickers) {
            const ticker = json.events[0].tickers[0];
            const bid = ticker.best_bid;
            const ask = ticker.best_ask;
            
            // Here we already have both values guaranteed
            console.log(`[COINBASE] Bid: ${bid} | Ask: ${ask}`);
        }
    } catch (e) {
        // Ignore connection/subscription messages
    }
});

ws.on('error', (err) => console.error('❌ Network error:', err.message));
ws.on('close', () => console.log('🔌 Connection closed.'));