const WebSocket = require('ws');

const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');

ws.on('open', () => {
    console.log('✅ Conectado a Bybit V5 (BTCUSDT)');
    
    // 1. Suscripción estricta al Nivel 1 del OrderBook (Best Bid / Best Ask)
    ws.send(JSON.stringify({
        op: 'subscribe',
        args: ['orderbook.1.BTCUSDT']
    }));

    // 2. Heartbeat (Ping) obligatorio de Bybit cada 20 segundos
    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 'ping' }));
        }
    }, 20000);
});

ws.on('message', (data) => {
    const parsed = JSON.parse(data);

    // Ignorar las respuestas del Ping ("pong")
    if (parsed.op === 'ping' || parsed.ret_msg === 'pong') return;

    // Confirmación de suscripción exitosa
    if (parsed.success === true) {
        console.log(`✅ Suscripción confirmada: ${parsed.ret_msg}`);
        return;
    }

    // 3. Procesamiento de los datos (Snapshot o Delta)
    if (parsed.topic === 'orderbook.1.BTCUSDT' && parsed.data) {
        const book = parsed.data;
        
        // Bybit manda arrays: [['precio', 'cantidad']]
        const bestBid = (book.b && book.b.length > 0) ? book.b[0][0] : null;
        const bestAsk = (book.a && book.a.length > 0) ? book.a[0][0] : null;
        
        // A veces manda actualizaciones (deltas) solo de un lado, por eso validamos
        if (bestBid || bestAsk) {
            let logMsg = `[BYBIT] `;
            if (bestBid) logMsg += `Bid: ${bestBid} `;
            if (bestAsk) logMsg += `| Ask: ${bestAsk}`;
            console.log(logMsg);
        }
    } else if (parsed.ret_msg) {
        // Por si arroja un error de rate limit o mal formato
        console.error('⚠️ Mensaje de Bybit:', parsed.ret_msg);
    }
});

ws.on('error', (err) => console.error('❌ Error de red Bybit:', err));

ws.on('close', (code, reason) => {
    console.log(`🔌 Bybit desconectado. Código: ${code}`);
});