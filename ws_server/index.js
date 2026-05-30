'use strict';

const WebSocket      = require("ws");
const mqtt           = require("mqtt-packet");
const jwt            = require("jsonwebtoken");
const Redis          = require("ioredis");
const path           = require("path");
const orchestrator   = require("./orchestrator");
const { parsePromptToRules } = require("./tools/strategy-parser");
const { processPrompt } = require("./tools/ai-agent");

require('dotenv').config({ path: path.join(__dirname, '.env') });

// --- 1. CONFIG & SERVICES ---
const PORT            = process.env.PORT || 8080;
const SECRET          = process.env.WSS_SECRET;
const LEGACY_USERNAME = process.env.LEGACY_USERNAME;
const LEGACY_PASSWORD = process.env.LEGACY_PASSWORD;

// Redis maneja el escalado horizontal entre tus procesos de AWS
const redisPub = new Redis();
const redisSub = new Redis();

const wss = new WebSocket.Server({
    port: PORT,
    host: "0.0.0.0",
    handleProtocols: (protocols) => protocols.has('mqtt') ? 'mqtt' : false
});

const clients       = new Map(); // clientId -> ws
const subscriptions = new Map(); // clientId -> Set(topics)

const logTime = () => `[${new Date().toISOString().replace("T", " ").split(".")[0]}]`;

// --- CONFIGURACIÓN HFT BACKPRESSURE Y CACHÉ HISTÓRICO ---
const MAX_BUFFER_SIZE = 50 * 1024; 
const MAX_HISTORY     = 50;        // 📊 Límite de valores históricos por exchange/tópico
const historyCache    = new Map(); // 📊 Diccionario en RAM: topic -> array de 50 valores

// --- 2. GLOBAL GRID SYNC ---
// Escucha la red de Redis Pub/Sub y distribuye de inmediato a los WebSockets locales.
redisSub.psubscribe("*");
redisSub.on("pmessage", (pattern, channel, message) => {
    let data;
    try {
        data = JSON.parse(message);
    } catch (e) {
        data = { payload: message }; 
    }

    const payloadToSend = data.payload || message;

    // 📝 GUARDAR EN EL HISTÓRICO EN MEMORIA (RAM)
    if (!historyCache.has(channel)) {
        historyCache.set(channel, []);
    }
    const topicHistory = historyCache.get(channel);
    
    // Convertir a objeto JSON si es posible para un formato limpio
    let parsedPayload;
    try { parsedPayload = JSON.parse(payloadToSend); } 
    catch { parsedPayload = payloadToSend; }

    topicHistory.push(parsedPayload);
    
    // Mantener solo los últimos MAX_HISTORY elementos (desplazamiento circular)
    if (topicHistory.length > MAX_HISTORY) {
        topicHistory.shift(); 
    }

    // DISTRIBUIR A CLIENTES WS
    clients.forEach((ws) => {
        const clientSubs = subscriptions.get(ws.clientId);
        
        if (clientSubs && clientSubs.has(channel)) {
            
            // 🛡️ EL ESCUDO DE CONTRA-PRESIÓN (BACKPRESSURE SHIELD) 🛡️
            if (ws.bufferedAmount > MAX_BUFFER_SIZE) {
                return; 
            }

            ws.send(mqtt.generate({
                cmd:     'publish',
                topic:   channel,
                payload: typeof payloadToSend === 'string' ? payloadToSend : JSON.stringify(payloadToSend),
                qos:     0,
                retain:  false
            }));
        }
    });
});

// --- 📊 FUNCIÓN ESPECIAL: ENVIAR HISTÓRICO ---
// Envía los 50 valores almacenados de un solo golpe para pintar gráficos
function sendHistoryToClient(ws, topic) {
    if (historyCache.has(topic)) {
        const historyArray = historyCache.get(topic);
        if (historyArray.length > 0) {
            ws.send(mqtt.generate({
                cmd:     'publish',
                topic:   `${topic}/history`, // Sub-canal especial para el FrontEnd
                payload: JSON.stringify(historyArray),
                qos:     0,
                retain:  false
            }));
            console.log(`${logTime()} 📊 [HISTORY] Enviados ${historyArray.length} valores de ${topic} a ${ws.clientId}`);
        }
    }
}

// --- 💸 FUNCIÓN ESPECIAL: ENVIAR COMISIONES + SNAPSHOT INICIAL ---
function sendFeesToClient(ws, topic) {
    if (topic === 'market/btc/ticker') {
        if (orchestrator && typeof orchestrator.getExchangeFees === 'function') {
            const fees = orchestrator.getExchangeFees();
            ws.send(mqtt.generate({
                cmd:     'publish',
                topic:   `${topic}/fees`,
                payload: JSON.stringify(fees),
                qos:     0,
                retain:  false
            }));
            console.log(`${logTime()} 💸 [FEES] Diccionario de comisiones enviado a ${ws.clientId}`);
        }

        // Push active rules snapshot to new client
        if (orchestrator && typeof orchestrator.getActiveRules === 'function') {
            ws.send(mqtt.generate({
                cmd:     'publish',
                topic:   'ACTIVE_RULES',
                payload: JSON.stringify(orchestrator.getActiveRules()),
                qos:     0,
                retain:  false
            }));
        }

        // Push P&L + trade log snapshot to new client
        if (orchestrator && typeof orchestrator.getPnLSummary === 'function') {
            ws.send(mqtt.generate({
                cmd:     'publish',
                topic:   'SNAPSHOT',
                payload: JSON.stringify({
                    wallets: orchestrator.getWallets(),
                    trades:  orchestrator.getTradeLog(),
                    pnl:     orchestrator.getPnLSummary()
                }),
                qos:     0,
                retain:  false
            }));
            console.log(`${logTime()} 📊 [SNAPSHOT] P&L + wallets enviados a ${ws.clientId}`);
        }
    }
}

// --- 3. LÓGICA CENTRAL DEL BROKER ---
wss.on("connection", (ws, req) => {
    const parser = mqtt.parser();
    ws.isAuthorized = false;
    const ip = req.socket.remoteAddress;

    // 🚀 CRÍTICO HFT: Desactiva el algoritmo de Nagle. 
    req.socket.setNoDelay(true); 

    parser.on("packet", (packet) => {

        // A. AUTENTICACIÓN
        if (packet.cmd === "connect") {
            const user = packet.username;
            const pass = packet.password ? packet.password.toString() : null;

            let authenticated = false;

            if (user === LEGACY_USERNAME && pass === LEGACY_PASSWORD) {
                ws.clientId    = packet.clientId || `legacy_${Math.random().toString(16).slice(2, 6)}`;
                authenticated  = true;
                console.log(`${logTime()} 🔓 [AUTH - LEGACY] ${ws.clientId} | IP: ${ip}`);
            } else {
                try {
                    const decoded  = jwt.verify(pass, SECRET);
                    ws.clientId    = packet.clientId || `jwt_${Math.random().toString(16).slice(2, 6)}`;
                    ws.user        = decoded;
                    authenticated  = true;
                    console.log(`${logTime()} ✅ [AUTH - JWT] ${ws.clientId} | User: ${decoded.id || 'N/A'}`);
                } catch (e) {
                    console.log(`${logTime()} 🚫 [AUTH FAILED] IP: ${ip} | Error: ${e.message}`);
                }
            }

            if (authenticated) {
                ws.isAuthorized = true;
                clients.set(ws.clientId, ws);
                subscriptions.set(ws.clientId, new Set());
                ws.send(mqtt.generate({ cmd: "connack", returnCode: 0 }));
            } else {
                ws.send(mqtt.generate({ cmd: "connack", returnCode: 4 }));
                ws.terminate();
            }
            return;
        }

        if (!ws.isAuthorized) return ws.terminate();

        // B. APERTURA DE SUSCRIPCIÓN
        if (packet.cmd === "subscribe") {
            packet.subscriptions.forEach((sub) => {
                subscriptions.get(ws.clientId).add(sub.topic);
                console.log(`${logTime()} 👂 [SUB] ${ws.clientId} -> "${sub.topic}"`);
            });
            ws.send(mqtt.generate({
                cmd:       "suback",
                messageId: packet.messageId,
                granted:   packet.subscriptions.map(s => s.qos)
            }));

            // 🚀 DISPARAR EL HISTÓRICO Y LOS FEES AL FRONTEND
            packet.subscriptions.forEach((sub) => {
                sendHistoryToClient(ws, sub.topic);
                sendFeesToClient(ws, sub.topic); // Llamada inyectada
            });
        }

        // C. RECEPCIÓN DE PUBLICACIÓN (Client → servidor)
        if (packet.cmd === "publish") {
            const inTopic   = packet.topic;
            const rawPayload = packet.payload.toString();

            // ── Command: Update strategy via natural language prompt ──
            if (inTopic === 'SET_STRATEGY') {
                try {
                    const { prompt } = JSON.parse(rawPayload);
                    console.log(`${logTime()} 🧠 [AGENT] Processing prompt: "${prompt}" for ${ws.clientId}`);
                    
                    processPrompt(prompt).then((agentResponse) => {
                        redisPub.publish('AGENT_RESPONSE', JSON.stringify({
                            prompt,
                            response: agentResponse,
                            timestamp: Date.now()
                        }));
                        console.log(`${logTime()} 🤖 [AGENT] Responded successfully to ${ws.clientId}`);
                    }).catch((err) => {
                        console.error(`${logTime()} ❌ [AGENT] Execution error:`, err.message);
                        redisPub.publish('AGENT_RESPONSE', JSON.stringify({
                            prompt,
                            response: `❌ Agent processing error: ${err.message}`,
                            timestamp: Date.now()
                        }));
                    });
                } catch(e) {
                    console.error(`${logTime()} ❌ [STRATEGY] Parse error:`, e.message);
                }
                return;
            }

            // ── Command: Request fresh wallet/P&L snapshot ──
            if (inTopic === 'GET_SNAPSHOT') {
                ws.send(mqtt.generate({
                    cmd:     'publish',
                    topic:   'SNAPSHOT',
                    payload: JSON.stringify({
                        wallets: orchestrator.getWallets(),
                        trades:  orchestrator.getTradeLog(),
                        pnl:     orchestrator.getPnLSummary()
                    }),
                    qos:     0,
                    retain:  false
                }));
                return;
            }

            // Default: forward to Redis grid
            redisPub.publish(inTopic, JSON.stringify({
                sender:  ws.clientId,
                payload: rawPayload
            }));
        }

        // D. RESPUESTA DE PING (Heartbeat MQTT para mantener el canal abierto)
        if (packet.cmd === "pingreq") {
            ws.send(mqtt.generate({ cmd: "pingresp" }));
        }
    });

    ws.on("message", (data) => parser.parse(data));

    ws.on("close", () => {
        if (ws.clientId) {
            clients.delete(ws.clientId);
            subscriptions.delete(ws.clientId);
            console.log(`${logTime()} ❌ [DISCONNECT] ${ws.clientId}`);
        }
    });

    ws.on("error", () => ws.terminate());
});

console.log(`\n🚀 [OPEN ENTERPRISE GRID] Online en PUERTO ${PORT}`);
console.log(`🛡️  HFT Backpressure Shield Activo (Límite máximo: ${MAX_BUFFER_SIZE / 1024} KB)`);
console.log(`📊  Caché Histórica Activa: Últimos ${MAX_HISTORY} valores por canal`);
console.log(`🔓 Modo: Tópicos sin restricciones | Sincronización: Redis Habilitado\n`);

// --- 4. ARRANQUE DEL ORQUESTADOR DE PRECIOS ---
if (orchestrator && orchestrator.start) {
    orchestrator.start(redisPub).catch((err) =>
        console.error('❌ [ORCHESTRATOR] Error Crítico Fatal:', err.message)
    );
} else {
    console.warn("⚠️ [WARN] El módulo 'orchestrator.js' no expone la función .start().");
}