
'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0026,       // 0.26%
    maker: 0.0016,       // 0.16%
    withdrawalBTC: 0.00015
};

function connect(updateMemory) {
    // pegamos contra el socket del exchange
    const ws = new WebSocket('wss://ws.kraken.com/v2');
    let isReconnecting = false;

    const handleDisconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;
        updateMemory('Kraken', 0, 0, 0, 0);
        console.warn(' kraken:  Desconectado. Reconectando en 5s...');
        setTimeout(() => connect(updateMemory), 5000);
    };

    ws.on('open', () => {
        console.log(' kraken:  Connected');
        ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'] } }));
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
            if (j.channel === 'ticker' && j.data && j.data[0]) {
                updateMemory('Kraken', 
                    parseFloat(j.data[0].bid), parseFloat(j.data[0].bid_qty), 
                    parseFloat(j.data[0].ask), parseFloat(j.data[0].ask_qty)
                );
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => {
        // removemos listeners para forzar el garbage collector y evitar memory leaks
        ws.removeAllListeners) ws.removeAllListeners();

        console.error(' kraken:  Error:', err.message);
        ws.terminate();
    });

    ws.on('close', handleDisconnect);

    return ws;
}

// exportamos el modulo para usarlo en el pipeline
module.exports = { connect, getFees: () => FEE_CONFIG };