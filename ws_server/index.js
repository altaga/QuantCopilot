'use strict';

const WebSocket      = require("ws");
const mqtt           = require("mqtt-packet");
const jwt            = require("jsonwebtoken");
const Redis          = require("ioredis");
const path           = require("path");
const orchestrator   = require("./orchestrator");
const { processPrompt } = require("./tools/ai-agent");

require('dotenv').config({ path: path.join(__dirname, '.env') });

// --- 1. CONFIG & SERVICES ---
const PORT            = process.env.PORT || 8080;
const SECRET          = process.env.WSS_SECRET;
const LEGACY_USERNAME = process.env.LEGACY_USERNAME;
const LEGACY_PASSWORD = process.env.LEGACY_PASSWORD;

// Redis handles horizontal scaling across your AWS processes
const redisPub = new Redis();
const redisSub = new Redis();

// Use a real http.Server so we can attach REST control routes alongside WebSocket
const http = require('http');
const httpServer = http.createServer((req, res) => {
    // ── CORS pre-flight ──
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // GET /api/rules — snapshot of current active rules
    if (req.method === 'GET' && req.url === '/api/rules') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(orchestrator.getActiveRules()));
        return;
    }

    // POST /api/rules — merge partial rules (used by frontend toggle buttons)
    if (req.method === 'POST' && req.url === '/api/rules') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const partial = JSON.parse(body);
                orchestrator.setActiveRules(partial);
                console.log(`${logTime()} 🛡️ [HTTP] Rules updated via REST:`, JSON.stringify(partial));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, rules: orchestrator.getActiveRules() }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: e.message }));
            }
        });
        return;
    }

    // GET /api/fees — exchange fee matrix
    if (req.method === 'GET' && req.url === '/api/fees') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(orchestrator.getExchangeFees()));
        return;
    }

    // GET /api/snapshot — unified bootstrap payload (rules + fees + P&L + wallets + trades)
    // Called once on frontend mount instead of pushing over WebSocket
    if (req.method === 'GET' && req.url === '/api/snapshot') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            rules:   orchestrator.getActiveRules(),
            fees:    orchestrator.getExchangeFees(),
            wallets: orchestrator.getWallets(),
            trades:  orchestrator.getTradeLog(),
            pnl:     orchestrator.getFullPnL(),
        }));
        return;
    }

    // Anything else: 404
    res.writeHead(404); res.end();
});

const wss = new WebSocket.Server({
    server: httpServer,
    handleProtocols: (protocols) => protocols.has('mqtt') ? 'mqtt' : false
});

httpServer.listen(PORT, '0.0.0.0');

const clients       = new Map(); // clientId -> ws
const subscriptions = new Map(); // clientId -> Set(topics)

const logTime = () => `[${new Date().toISOString().replace("T", " ").split(".")[0]}]`;

// --- HFT BACKPRESSURE AND HISTORICAL CACHE CONFIGURATION ---
const MAX_BUFFER_SIZE = 50 * 1024; 
const MAX_HISTORY     = 50;        // 📊 Limit of historical values per exchange/topic
const historyCache    = new Map(); // 📊 RAM Dictionary: topic -> array of 50 values

// --- 2. GLOBAL GRID SYNC ---
// Listens to the Redis Pub/Sub network and distributes immediately to local WebSockets.
redisSub.psubscribe("*");
redisSub.on("pmessage", (pattern, channel, message) => {
    let data;
    try {
        data = JSON.parse(message);
    } catch (e) {
        data = { payload: message }; 
    }

    const payloadToSend = data.payload || message;

    // 📝 SAVE IN MEMORY HISTORY (RAM)
    if (!historyCache.has(channel)) {
        historyCache.set(channel, []);
    }
    const topicHistory = historyCache.get(channel);
    
    // Convert to JSON object if possible for clean format
    let parsedPayload;
    try { parsedPayload = JSON.parse(payloadToSend); } 
    catch { parsedPayload = payloadToSend; }

    topicHistory.push(parsedPayload);
    
    // Keep only the last MAX_HISTORY elements (circular buffer)
    if (topicHistory.length > MAX_HISTORY) {
        topicHistory.shift(); 
    }

    // DISTRIBUTE TO WS CLIENTS
    clients.forEach((ws) => {
        const clientSubs = subscriptions.get(ws.clientId);
        
        if (clientSubs && clientSubs.has(channel)) {
            
            // 🛡️ THE BACKPRESSURE SHIELD 🛡️
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

// --- 📊 SPECIAL FUNCTION: SEND HISTORY ---
// Sends the 50 stored values at once to draw charts
function sendHistoryToClient(ws, topic) {
    if (historyCache.has(topic)) {
        const historyArray = historyCache.get(topic);
        if (historyArray.length > 0) {
            ws.send(mqtt.generate({
                cmd:     'publish',
                topic:   `${topic}/history`, // Special sub-channel for the FrontEnd
                payload: JSON.stringify(historyArray),
                qos:     0,
                retain:  false
            }));
            console.log(`${logTime()} 📊 [HISTORY] Sent ${historyArray.length} values of ${topic} to ${ws.clientId}`);
        }
    }
}

// --- 💸 SPECIAL FUNCTION: SEND FEES + INITIAL SNAPSHOT ---
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
            console.log(`${logTime()} 💸 [FEES] Fees dictionary sent to ${ws.clientId}`);
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
            console.log(`${logTime()} 📊 [SNAPSHOT] P&L + wallets sent to ${ws.clientId}`);
        }
    }
}

// --- 3. CORE BROKER LOGIC ---
wss.on("connection", (ws, req) => {
    const parser = mqtt.parser();
    ws.isAuthorized = false;
    const ip = req.socket.remoteAddress;

    // 🚀 HFT CRITICAL: Disable Nagle's algorithm. 
    req.socket.setNoDelay(true); 

    parser.on("packet", (packet) => {

        // A. AUTHENTICATION
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

        // B. SUBSCRIPTION OPENING
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

            // 🚀 TRIGGER HISTORY AND FEES TO FRONTEND
            packet.subscriptions.forEach((sub) => {
                sendHistoryToClient(ws, sub.topic);
                sendFeesToClient(ws, sub.topic); // Injected call
            });
        }

        // C. PUBLICATION RECEPTION (Client → server)
        if (packet.cmd === "publish") {
            const inTopic   = packet.topic;
            const rawPayload = packet.payload.toString();

            // ── Command: Update active rules directly (expert mode) ──
            if (inTopic === 'UPDATE_RULES') {
                try {
                    const rules = JSON.parse(rawPayload);
                    console.log(`${logTime()} 🛡️ [DIRECT] Expert update active rules:`, JSON.stringify(rules));
                    orchestrator.setActiveRules(rules);
                } catch(e) {
                    console.error(`${logTime()} ❌ [DIRECT RULES] Parse/apply error:`, e.message);
                }
                return;
            }

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

        // D. PING RESPONSE (MQTT Heartbeat to keep channel open)
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

console.log(`\n🚀 [OPEN ENTERPRISE GRID] Online on PORT ${PORT}`);
console.log(`🛡️  HFT Backpressure Shield Active (Max limit: ${MAX_BUFFER_SIZE / 1024} KB)`);
console.log(`📊  Historical Cache Active: Last ${MAX_HISTORY} values per channel`);
console.log(`🔓 Mode: Unrestricted topics | Sync: Redis Enabled\n`);

// --- 4. START PRICE ORCHESTRATOR ---
if (orchestrator && orchestrator.start) {
    orchestrator.start(redisPub).catch((err) =>
        console.error('❌ [ORCHESTRATOR] Fatal Critical Error:', err.message)
    );
} else {
    console.warn("⚠️ [WARN] Module 'orchestrator.js' does not expose the .start() function.");
}