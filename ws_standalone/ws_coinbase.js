
const WebSocket = require('ws');

// HFT Pre-allocated log strings
const LOG_PREFIX = '[COINBASE] Bid: ';
const LOG_MID = ' | Ask: ';
const SUB_PAYLOAD = JSON.stringify({
    type: 'subscribe',
    product_ids: ['BTC-USD'],
    channel: 'ticker' 
});

function connect() {
    // pegamos contra el socket del exchange
    const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');

    ws.on('open', () => {
        console.log(' Connected to Coinbase (BTC-USD)');
        ws.send(SUB_PAYLOAD);
    });

    // procesamos el tick entrante del socket
    ws.on('message', (data) => {
        // HFT Backpressure Shield
        if (data.length > 50000) {
            console.warn('coinbase:  Payload exceeded 50KB. Dropped.');
            return;
        }

        // bloque de seguridad por si truena la logica
        try {
            // parseamos el payload (asumimos que viene limpio pero cuidadito)
            const json = JSON.parse(data);

            // O(1) direct property access
            if (json.events && json.events[0] && json.events[0].tickers) {
                const ticker = json.events[0].tickers[0];
                // Zero-allocation string concat
                console.log(LOG_PREFIX + ticker.best_bid + LOG_MID + ticker.best_ask);
            }
        } catch (e) {
            // Ignore connection/subscription messages
        }
    });

    ws.on('error', (err) => console.error(' Network error:', err.message));
    
    ws.on('close', () => {
        console.log(' Connection closed.');
        // removemos listeners para forzar el garbage collector y evitar memory leaks
        ws.removeAllListeners();
    });
}

connect();