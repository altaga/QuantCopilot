
'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0000,       // 0.00% (P2P/Tier Discounts)
    maker: 0.0000,       // 0.00%
    withdrawalBTC: 0.00006
};

function connect(updateMemory) {
    // pegamos contra el socket del exchange
    const ws = new WebSocket('wss://api-pub.bitfinex.com/ws/2');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Bitfinex', 0, 0, 0, 0);
        console.warn(' bitfinex:  Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log(' bitfinex:  Connected');
        ws.send(JSON.stringify({ event: 'subscribe', channel: 'ticker', symbol: 'tBTCUSD' }));
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
            if (Array.isArray(j) && Array.isArray(j[1])) {
                updateMemory('Bitfinex', parseFloat(j[1][0]), parseFloat(j[1][1]), parseFloat(j[1][2]), parseFloat(j[1][3]));
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => {
        // removemos listeners para forzar el garbage collector y evitar memory leaks
        ws.removeAllListeners) ws.removeAllListeners();

        console.error(' bitfinex:  Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

// exportamos el modulo para usarlo en el pipeline
module.exports = { connect, getFees: () => FEE_CONFIG };