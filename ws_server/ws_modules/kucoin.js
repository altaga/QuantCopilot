'use strict';

const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0010,       // 0.10%
    maker: 0.0010,       // 0.10%
    withdrawalBTC: 0.0005
};

// Memoria caché interna
let _token        = null;
let _endpoint     = null;
let _pingInterval = 20000;

// FASE 1: Pre-flight (REST)
async function load() {
    console.log('⏳ [KUCOIN] Obteniendo token público vía REST...');
    // Dependiendo de tu versión de Node, usa node-fetch si fetch no es nativo
    const res  = await fetch('https://api.kucoin.com/api/v1/bullet-public', { method: 'POST' });
    
    if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
    
    const json = await res.json();
    if (json.code !== '200000' || !json.data) {
        throw new Error(`Error en respuesta: ${JSON.stringify(json)}`);
    }
    
    _token        = json.data.token;
    _endpoint     = json.data.instanceServers[0].endpoint;
    _pingInterval = json.data.instanceServers[0].pingInterval || 20000;
    
    console.log('✅ [KUCOIN] Token y Endpoint obtenidos con éxito.');
}

// FASE 2: Conexión HFT (WebSocket)
function connect(updateMemory) {
    if (!_token || !_endpoint) {
        throw new Error('[KUCOIN] load() must be called before connect()');
    }

    const ws = new WebSocket(`${_endpoint}?token=${_token}`);
    let pingTimer = null;

    ws.on('open', () => {
        console.log('✅ [KUCOIN] Conectado (Stream Activo)');
        
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
        const j = JSON.parse(data);
        if (j.type === 'message' && j.data) {
            updateMemory('Kucoin', 
                parseFloat(j.data.bestBid), parseFloat(j.data.bestBidSize), 
                parseFloat(j.data.bestAsk), parseFloat(j.data.bestAskSize)
            );
        }
    });

    ws.on('error', (err) => console.error('❌ [KUCOIN] Error:', err.message));
    ws.on('close', () => clearInterval(pingTimer));
    return ws;
}

module.exports = { load, connect, getFees: () => FEE_CONFIG };