const WebSocket = require('ws');

const ws = new WebSocket('wss://ws.bitstamp.net');

ws.on('open', () => {
    console.log('✅ Conectado a Bitstamp (BTCUSD)');
    ws.send(JSON.stringify({
        event: 'bts:subscribe',
        data: { channel: 'order_book_btcusd' } // Par en minúsculas
    }));
});

ws.on('message', (data) => {
    const parsed = JSON.parse(data);
    if (parsed.event === 'data' && parsed.data) {
        // Bitstamp manda el Order Book, leemos la punta (Nivel 1)
        const bestBid = parsed.data.bids[0][0];
        const bestAsk = parsed.data.asks[0][0];
        console.log(`[BITSTAMP] Bid: ${bestBid} | Ask: ${bestAsk}`);
    } else if (parsed.event === 'bts:subscription_succeeded') {
        console.log(`✅ Suscripción a Bitstamp confirmada.`);
    }
});