const WebSocket = require('ws');

// Creamos la conexión
const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');

ws.on('open', () => {
    console.log('✅ Conectado a Coinbase (BTC-USD)');
    
    // Suscripción al canal 'ticker'.
    // Este canal garantiza el envío de ambos: best_bid y best_ask.
    ws.send(JSON.stringify({
        type: 'subscribe',
        product_ids: ['BTC-USD'],
        channel: 'ticker' 
    }));
});

ws.on('message', (data) => {
    try {
        const json = JSON.parse(data);

        // Coinbase envía una lista de eventos
        if (json.events && json.events[0] && json.events[0].tickers) {
            const ticker = json.events[0].tickers[0];
            const bid = ticker.best_bid;
            const ask = ticker.best_ask;
            
            // Aquí ya tenemos ambos valores garantizados
            console.log(`[COINBASE] Bid: ${bid} | Ask: ${ask}`);
        }
    } catch (e) {
        // Ignoramos mensajes de conexión/suscripción
    }
});

ws.on('error', (err) => console.error('❌ Error de red:', err.message));
ws.on('close', () => console.log('🔌 Conexión cerrada.'));