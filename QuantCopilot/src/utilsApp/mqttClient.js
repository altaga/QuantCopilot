
import { remoteLog } from "./remoteLog";

// ─── MQTT Packet Builders (pure WebSocket, no library) ─────────────────────
// Adapted from scripts/custom_ws_test.js — exact byte-level approach that works in Node.js

function encode(str) {
  const bytes = Buffer.from(str, "utf-8");
  return [bytes.length >> 8, bytes.length & 0xff, ...Array.from(bytes)];
}

function encodeRemaining(len) {
  const out = [];
  do {
    let byte = len & 0x7f;
    len >>= 7;
    if (len > 0) byte |= 0x80;
    out.push(byte);
  } while (len > 0);
  return out;
}

function buildConnect(clientId, username, password) {
  const protocol = [0, 4, 77, 81, 84, 84]; // "MQTT" as raw bytes
  const version = 4; // MQTT 3.1.1
  const flags = 0xc2; // username + password + clean session
  const keepAlive = [0, 60]; // 60 seconds

  const varHeader = [...protocol, version, flags, ...keepAlive];
  const payload = [
    ...encode(clientId),
    ...encode(username || ""),
    ...encode(password || ""),
  ];
  const totalLen = varHeader.length + payload.length;

  return Buffer.from([
    0x10,
    ...encodeRemaining(totalLen),
    ...varHeader,
    ...payload,
  ]);
}

function buildSubscribe(topic, msgId = 1) {
  const topicBytes = encode(topic);
  const varHeader = [msgId >> 8, msgId & 0xff];
  const payload = [...topicBytes, 0]; // QoS 0
  const totalLen = varHeader.length + payload.length;

  return Buffer.from([
    0x82,
    ...encodeRemaining(totalLen),
    ...varHeader,
    ...payload,
  ]);
}

function buildPingReq() {
  return Buffer.from([0xc0, 0x00]);
}

function buildPublish(topic, payload) {
  const topicBytes = encode(topic); // Includes 2-byte length prefix
  const payloadBytes = Buffer.from(payload, "utf-8"); 
  const rawPayload = Array.from(payloadBytes); // Convert to plain Array for safe spreading in browser polyfills
  const totalLen = topicBytes.length + rawPayload.length;

  return Buffer.from([
    0x30, // MQTT Publish, QoS 0
    ...encodeRemaining(totalLen),
    ...topicBytes,
    ...rawPayload,
  ]);
}

// ─── MQTT Frame Parser ─────────────────────────────────────────────────────

function parseFrame(data) {
  const buf = Buffer.from(data);
  if (buf.length < 2) return null;

  const cmd = buf[0] & 0xf0;
  let multiplier = 1;
  let remaining = 0;
  let pos = 1;

  do {
    if (pos >= buf.length) return null;
    const byte = buf[pos++];
    remaining += (byte & 0x7f) * multiplier;
    multiplier *= 128;
  } while (buf[pos - 1] & 0x80);

  if (cmd === 0x20) {
    return { type: "connack", returnCode: buf[pos + 1] };
  }
  if (cmd === 0x30) {
    const topicLen = (buf[pos] << 8) | buf[pos + 1];
    pos += 2;
    const topic = buf.slice(pos, pos + topicLen).toString("utf-8");
    pos += topicLen;
    const payload = buf.slice(pos).toString("utf-8");
    return { type: "publish", topic, payload };
  }
  if (cmd === 0x90) {
    return { type: "suback", packetId: (buf[pos] << 8) | buf[pos + 1] };
  }
  return { type: "unknown", cmd };
}

// ─── MQTT Client ───────────────────────────────────────────────────────────

export function createMqttClient(url, options = {}) {
  const {
    username = "",
    password = "",
    clientId = `rn_${Math.random().toString(36).slice(2, 10)}`,
  } = options;

  remoteLog(`createMqttClient connecting to: ${url}`, "INFO", "WS");

  let ws = null;
  let connected = false;
  let pingTimer = null;
  const listeners = {};

  function send(packet) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(
      packet.buffer.slice(
        packet.byteOffset,
        packet.byteOffset + packet.byteLength,
      ),
    );
  }

  function emit(event, ...args) {
    (listeners[event] || []).forEach((fn) => {
      // bloque de seguridad por si truena la logica
      try {
        fn(...args);
      } catch (_) {}
    });
  }

  // pegamos contra el socket del exchange
  ws = new WebSocket(url, ["mqtt"]);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    remoteLog("ws.onopen — sending CONNECT", "INFO", "WS");
    send(buildConnect(clientId, username, password));

    pingTimer = setInterval(() => {
      if (ws && ws.readyState === 1) send(buildPingReq());
    }, 25000);
  };

  ws.onmessage = (ev) => {
    const frame = parseFrame(ev.data);
    if (!frame) return;

    if (frame.type === "connack") {
      if (frame.returnCode !== 0) {
        remoteLog(`CONNACK failed code=${frame.returnCode}`, "ERROR", "WS");
        ws.close();
        return;
      }
      remoteLog("WS client connected", "INFO", "WS");
      connected = true;
      emit("connect");
    }

    if (frame.type === "publish") {
      emit("message", frame.topic, frame.payload ?? "");
    }

    if (frame.type === "suback") {
      remoteLog(`SUBACK received for packetId=${frame.packetId}`, "INFO", "WS");
    }
  };

  ws.onerror = (err) => {
    remoteLog(`ws.onerror: ${err.type || "Event"}`, "ERROR", "WS");
    emit("error", err);
  };

  ws.onclose = () => {
    remoteLog("ws.onclose", "WARN", "WS");
    connected = false;
    clearInterval(pingTimer);
    emit("close");
  };

  return {
    on(event, fn) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    subscribe(topic) {
      remoteLog(`subscribe: ${topic}`, "INFO", "WS");
      if (connected) send(buildSubscribe(topic));
    },
    publish(topic, payload) {
      remoteLog(`publish: ${topic}`, "INFO", "WS");
      if (connected) send(buildPublish(topic, payload));
    },
    end() {
      remoteLog("end()", "INFO", "WS");
      clearInterval(pingTimer);
      if (ws) ws.close();
    },
  };
}
