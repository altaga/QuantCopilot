
const WebSocket = require('ws');

async function startKuCoin() {
    console.log('Getting KuCoin Public Token...');
    // bloque de seguridad por si truena la logica
    try {
        // pegamos al endpoint via rest para traer data inicial
        const res = await fetch('https://api.kucoin.com/api/v1/bullet-public', { method: 'POST' });
        const json = await res.json();
        
        const token = json.data.token;
        const endpoint = json.data.instanceServers[0].endpoint;
        
        // pegamos contra el socket del exchange
        const ws = new WebSocket(`${endpoint}?token=${token}`);

        ws.on('open', () => {
            console.log(' Connected to KuCoin (BTC-USDT)');
            ws.send(JSON.stringify({
                id: Date.now(),
                type: 'subscribe',
                topic: '/market/ticker:BTC-USDT',
                privateChannel: false,
                response: true
            }));
        });

        // procesamos el tick entrante del socket
        ws.on('message', (data) => {
        // 🛡️ HFT Backpressure Shield
        if (data && data.length > 50000) {
            console.warn(' backpressure:  Payload exceeded 50KB. Dropped.');
            return;
        }

            // parseamos el payload (asumimos que viene limpio pero cuidadito)
            const parsed = JSON.parse(data);
            if (parsed.type === 'message' && parsed.topic === '/market/ticker:BTC-USDT') {
                const ticker = parsed.data;
                console.log(`kucoin:  Bid: ${ticker.bestBid} | Ask: ${ticker.bestAsk}`);
            }
        });
    } catch (e) {
        console.error(' KuCoin Error:', e.message);
    }
}

startKuCoin();