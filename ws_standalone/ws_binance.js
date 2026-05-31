
const WebSocket = require('ws');

// HFT Pre-allocated log strings
const LOG_PREFIX = '[BINANCE] Bid: ';
const LOG_MID = ' | Ask: ';

function connect() {
    // pegamos contra el socket del exchange
    const ws = new WebSocket('wss://stream.binance.us:9443/ws/btcusd@bookTicker');

    ws.on('open', () => {
        console.log(' Connected to Binance (BTC/USD)');
    });

    // procesamos el tick entrante del socket
    ws.on('message', (data) => {
        // HFT Backpressure Shield
        if (data.length > 50000) {
            console.warn('binance:  Payload exceeded 50KB. Dropped.');
            return; 
        }

        // bloque de seguridad por si truena la logica
        try {
            // parseamos el payload (asumimos que viene limpio pero cuidadito)
            const json = JSON.parse(data);
            // Zero-allocation string concatenation
            console.log(LOG_PREFIX + json.b + LOG_MID + json.a);
        } catch (e) {
            // Ignore malformed JSON to prevent Event Loop crashing
        }
    });

    ws.on('error', (err) => console.error('Binance Error:', err.message));
    
    ws.on('close', () => {
        console.log(' Binance Connection closed.');
        // removemos listeners para forzar el garbage collector y evitar memory leaks
        ws.removeAllListeners();
    });
}

connect();