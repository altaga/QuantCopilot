const WebSocket = require('ws');

async function startKuCoin() {
    console.log('Getting KuCoin Public Token...');
    try {
        const res = await fetch('https://api.kucoin.com/api/v1/bullet-public', { method: 'POST' });
        const json = await res.json();
        
        const token = json.data.token;
        const endpoint = json.data.instanceServers[0].endpoint;
        
        const ws = new WebSocket(`${endpoint}?token=${token}`);

        ws.on('open', () => {
            console.log('✅ Connected to KuCoin (BTC-USDT)');
            ws.send(JSON.stringify({
                id: Date.now(),
                type: 'subscribe',
                topic: '/market/ticker:BTC-USDT',
                privateChannel: false,
                response: true
            }));
        });

        ws.on('message', (data) => {
            const parsed = JSON.parse(data);
            if (parsed.type === 'message' && parsed.topic === '/market/ticker:BTC-USDT') {
                const ticker = parsed.data;
                console.log(`[KUCOIN] Bid: ${ticker.bestBid} | Ask: ${ticker.bestAsk}`);
            }
        });
    } catch (e) {
        console.error('❌ KuCoin Error:', e.message);
    }
}

startKuCoin();