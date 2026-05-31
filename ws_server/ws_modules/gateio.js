
'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0020,       // 0.20%
    maker: 0.0020,       // 0.20%
    withdrawalBTC: 0.0005
};

function connect(updateMemory) {
    // pegamos contra el socket del exchange
    const ws = new WebSocket('wss://api.gateio.ws/ws/v4/');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Gateio', 0, 0, 0, 0);
        console.warn(' [GATE.IO] Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log(' [GATE.IO] Connected');
        ws.send(JSON.stringify({
            time: Math.floor(Date.now() / 1000), channel: 'spot.book_ticker', event: 'subscribe', payload: ['BTC_USDT']
        }));
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
            // Gate.io uses uppercase 'B' for Bid Size and 'A' for Ask Size
            if (j.result && j.result.b && j.result.B) {
                updateMemory('Gateio', parseFloat(j.result.b), parseFloat(j.result.B), parseFloat(j.result.a), parseFloat(j.result.A));
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => {
        // removemos listeners para forzar el garbage collector y evitar memory leaks
        ws.removeAllListeners) ws.removeAllListeners();

        console.error(' [GATE.IO] Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

// exportamos el modulo para usarlo en el pipeline
module.exports = { connect, getFees: () => FEE_CONFIG };