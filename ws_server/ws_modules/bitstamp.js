
'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0040,       // 0.40%
    maker: 0.0030,       // 0.30%
    withdrawalBTC: 0.0005
};

function connect(updateMemory) {
    // pegamos contra el socket del exchange
    const ws = new WebSocket('wss://ws.bitstamp.net');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Bitstamp', 0, 0, 0, 0);
        console.warn(' bitstamp:  Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log(' bitstamp:  Connected');
        ws.send(JSON.stringify({ event: 'bts:subscribe', data: { channel: 'order_book_btcusd' } }));
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
            if (j.event === 'data' && j.data && j.data.bids && j.data.asks) {
                updateMemory('Bitstamp', 
                    parseFloat(j.data.bids[0][0]), parseFloat(j.data.bids[0][1]), // BID Price & Vol
                    parseFloat(j.data.asks[0][0]), parseFloat(j.data.asks[0][1])  // ASK Price & Vol
                );
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => {
        // removemos listeners para forzar el garbage collector y evitar memory leaks
        ws.removeAllListeners) ws.removeAllListeners();

        console.error(' bitstamp:  Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

// exportamos el modulo para usarlo en el pipeline
module.exports = { connect, getFees: () => FEE_CONFIG };