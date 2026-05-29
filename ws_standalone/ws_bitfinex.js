const WebSocket = require('ws');

const ws = new WebSocket('wss://api-pub.bitfinex.com/ws/2');

ws.on('open', () => {
    console.log('✅ Conectado a Bitfinex (tBTCUSD)');
    ws.send(JSON.stringify({
        event: 'subscribe',
        channel: 'ticker',
        symbol: 'tBTCUSD'
    }));
});

ws.on('message', (data) => {
    const parsed = JSON.parse(data);
    // Bitfinex manda [CHANNEL_ID, [BID, BID_SIZE, ASK, ASK_SIZE, ...]]
    if (Array.isArray(parsed) && Array.isArray(parsed[1])) {
        const bid = parsed[1][0];
        const ask = parsed[1][2];
        console.log(`[BITFINEX] Bid: ${bid} | Ask: ${ask}`);
    } else if (parsed.event === 'subscribed') {
        console.log(`✅ Suscripción confirmada. Channel ID: ${parsed.chanId}`);
    }
});