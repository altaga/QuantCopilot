'use strict';

const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0010,       // 0.10%
    maker: 0.0010,       // 0.10%
    withdrawalBTC: 0.0005
};

// Internal cache memory
let _token        = null;
let _endpoint     = null;
let _pingInterval = 20000;

// PHASE 1: Pre-flight (REST)
async function load() {
    console.log('⏳ [KUCOIN] Getting public token via REST...');
    // Depending on your Node version, use node-fetch if fetch is not native
    const res  = await fetch('https://api.kucoin.com/api/v1/bullet-public', { method: 'POST' });
    
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    
    const json = await res.json();
    if (json.code !== '200000' || !json.data) {
        throw new Error(`Response Error: ${JSON.stringify(json)}`);
    }
    
    _token        = json.data.token;
    _endpoint     = json.data.instanceServers[0].endpoint;
    _pingInterval = json.data.instanceServers[0].pingInterval || 20000;
    
    console.log('✅ [KUCOIN] Token and Endpoint successfully obtained.');
}

// PHASE 2: HFT Connection (WebSocket)
function connect(updateMemory) {
    if (!_token || !_endpoint) {
        throw new Error('[KUCOIN] load() must be called before connect()');
    }

    const ws = new WebSocket(`${_endpoint}?token=${_token}`);
    let pingTimer = null;

    ws.on('open', () => {
        console.log('✅ [KUCOIN] Connected (Active Stream)');
        
        ws.send(JSON.stringify({
            id: Date.now(),
            type: 'subscribe',
            topic: '/market/ticker:BTC-USDT',
            privateChannel: false,
            response: true
        }));

        pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ id: Date.now(), type: 'ping' }));
            }
        }, _pingInterval);
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data);
            if (j.type === 'message' && j.data) {
                updateMemory('Kucoin', 
                    parseFloat(j.data.bestBid), parseFloat(j.data.bestBidSize), 
                    parseFloat(j.data.bestAsk), parseFloat(j.data.bestAskSize)
                );
            }
        } catch (_) { return; }
    });

    ws.on('error', (err) => console.error('❌ [KUCOIN] Error:', err.message));
    ws.on('close', () => clearInterval(pingTimer));
    return ws;
}

module.exports = { load, connect, getFees: () => FEE_CONFIG };