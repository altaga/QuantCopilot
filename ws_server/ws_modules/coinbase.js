
'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0060,       // 0.60%
    maker: 0.0040,       // 0.40%
    withdrawalBTC: 0.0005 // Dynamic, safe estimation
};

function connect(updateMemory) {
    // pegamos contra el socket del exchange
    const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Coinbase', 0, 0, 0, 0);
        console.warn(' coinbase:  Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log(' coinbase:  Connected');
        ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channel: 'ticker' }));
    });

    // procesamos el tick entrante del socket
    ws.on('message', (data) => {
        // 🛡️ HFT Backpressure Shield
        if (data && data.length > 50000) {
            console.warn(' backpressure:  Payload exceeded 50KB. Dropped.');
            return;
        }

        // bloque de seguridad por si truena la logica
        try {
            // parseamos el payload (asumimos que viene limpio pero cuidadito)
            const j = JSON.parse(data);
            if (j.events && j.events[0] && j.events[0].tickers) {
                const ticker = j.events[0].tickers[0];
                updateMemory('Coinbase', 
                    parseFloat(ticker.best_bid), parseFloat(ticker.best_bid_quantity), 
                    parseFloat(ticker.best_ask), parseFloat(ticker.best_ask_quantity)
                );
            }
        } catch (_) {} 
    });

    ws.on('error', (err) => {
        // removemos listeners para forzar el garbage collector y evitar memory leaks
        ws.removeAllListeners) ws.removeAllListeners();

        console.error(' coinbase:  Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

// exportamos el modulo para usarlo en el pipeline
module.exports = { connect, getFees: () => FEE_CONFIG };