const WebSocket = require('ws');

const ws = new WebSocket('wss://ws.kraken.com/v2');

ws.on('open', () => {
    console.log('✅ Conectado a Kraken (BTC/USD)');
    // Enviamos el mensaje de suscripción
    ws.send(JSON.stringify({
        method: 'subscribe',
        params: {
            channel: 'ticker',
            symbol: ['BTC/USD']
        }
    }));
});

ws.on('message', (data) => {
    const json = JSON.parse(data);
    if (json.channel === 'ticker' && json.type === 'update') {
        const ticker = json.data[0];
        console.log(`[KRAKEN] Bid: ${ticker.bid} | Ask: ${ticker.ask}`);
    }
});

ws.on('error', (err) => console.error('Error Kraken:', err));