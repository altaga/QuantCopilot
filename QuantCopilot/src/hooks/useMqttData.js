
import { useState, useEffect, useRef } from 'react';
import { createMqttClient } from '../utilsApp/mqttClient';
import { remoteLog } from '../utilsApp/remoteLog';

const EXCHANGES = [
  "Binance", "Kraken", "Coinbase", "OKX", "Bitfinex", 
  "Bybit", "Gateio", "Gemini", "Bitstamp", "Kucoin", "RektSwap"
];

export function useMqttData(brokerUrl, topic, token, tokenError, chartCallback) {
  // definimos estado local para la ui
  const [isConnected, setIsConnected] = useState(false);
  // definimos estado local para la ui
  const [activeMqttClient, setActiveMqttClient] = useState(null);

  // definimos estado local para la ui
  const [alerts, setAlerts] = useState([]);
  // definimos estado local para la ui
  const [trades, setTrades] = useState([]);
  // definimos estado local para la ui
  const [pnl, setPnl] = useState(null);
  // definimos estado local para la ui
  const [auditLog, setAuditLog] = useState([]);
  // definimos estado local para la ui
  const [activeRules, setActiveRules] = useState(null);
  // definimos estado local para la ui
  const [agentResponse, setAgentResponse] = useState(null);
  // definimos estado local para la ui
  const [agentLoading, setAgentLoading] = useState(false);
  
  // definimos estado local para la ui
  const [marketData, setMarketData] = useState({});
  // definimos estado local para la ui
  const [marketHistory, setMarketHistory] = useState({});
  // definimos estado local para la ui
  const [lastUpdate, setLastUpdate] = useState(null);
  // definimos estado local para la ui
  const [truePrice, setTruePrice] = useState(null);

  const marketHistoryRef = useRef({});
  const historyLoadedRef = useRef(false);

  // disparamos el effect al montar o cambiar dependencias
  useEffect(() => {
    if (!token) {
      if (tokenError) remoteLog(`Token unavailable, WS skipped: ${tokenError}`, "WARN", "WS");
      return;
    }

    let reconnectTimer = null;
    let activeClient = null;
    let lastDomUpdate = 0; // 🛡️ HFT Throttle

    const connect = () => {
      remoteLog(`WS: connecting... tokenLen=${token.length}`, "INFO", "WS");
      activeClient = createMqttClient(brokerUrl, { username: "ccm_id", password: token });

      activeClient.on("connect", () => {
        remoteLog("WS connected", "INFO", "WS");
        setIsConnected(true);
        setActiveMqttClient(activeClient);
        
        activeClient.subscribe(topic);
        activeClient.subscribe("ARBITRAGE_ALERTS");
        activeClient.subscribe("TRADE_EXECUTED");
        activeClient.subscribe("PNL_UPDATE");
        activeClient.subscribe("RISK_AUDIT");
        activeClient.subscribe("ACTIVE_RULES");
        activeClient.subscribe("AGENT_RESPONSE");
      });

      activeClient.on("message", (msgTopic, message) => {
        // bloque de seguridad por si truena la logica
        try {
          const raw = message.toString();
          if (!raw || raw === "[object Object]") return;
          // parseamos el payload (asumimos que viene limpio pero cuidadito)
          const data = JSON.parse(raw);
          if (!data || typeof data !== "object") return;

          // ── Live alerts & events ───────────────────────────────────────────
          if (msgTopic === "ARBITRAGE_ALERTS") {
            setAlerts(prev => prev.some(i => i.id === data.id) ? prev : [data, ...prev].slice(0, 50));
            return;
          }
          if (msgTopic === "TRADE_EXECUTED") {
            setTrades(prev => prev.some(i => i.id === data.id) ? prev : [data, ...prev].slice(0, 100));
            const tradeProfit = parseFloat(data.netProfitUSD || data.profitUSD || data.profitTotalUSD || 0);
            if (tradeProfit !== 0) {
              setPnl(prev => prev ? { ...prev, totalBalanceUSD: (prev.totalBalanceUSD || 0) + tradeProfit } : { totalBalanceUSD: tradeProfit });
            }
            return;
          }
          if (msgTopic === "PNL_UPDATE") { setPnl(data); return; }
          if (msgTopic === "RISK_AUDIT") {
            setAuditLog(prev => prev.some(i => i.id === data.id) ? prev : [data, ...prev].slice(0, 50));
            return;
          }
          if (msgTopic === "ACTIVE_RULES") { setActiveRules(data); return; }
          if (msgTopic === "AGENT_RESPONSE") { setAgentResponse(data); setAgentLoading(false); return; }

          // ── History message: fill chart with last 50 values ─────────────────
          if (msgTopic && msgTopic.endsWith("/history")) {
            if (historyLoadedRef.current) return;
            if (!data) return;
            const histData = Array.isArray(data) ? data : [data];
            if (!histData.length) return;

            const chartPoints = [];
            const latestSnapshots = {};
            const newHistory = {};

            histData.forEach((snap) => {
              if (!snap || typeof snap.ts !== "number" || !isFinite(snap.ts)) return;
              const snapData = snap.data || snap;
              EXCHANGES.forEach((ex) => {
                const exData = snapData && snapData[ex];
                if (!exData) return;
                const bid = parseFloat(exData.bid);
                const ask = parseFloat(exData.ask);
                if (!bid || !ask || isNaN(bid) || isNaN(ask)) return;
                const tick = { bid, ask, spread: ask - bid, ts: snap.ts };
                const history = newHistory[ex] || [];
                newHistory[ex] = [...history, tick].slice(-300).filter(t => t && t.bid && t.ask && t.ts && isFinite(t.ts));
                latestSnapshots[ex] = exData;
              });
              if (chartCallback) {
                 chartCallback("history", snap.ts, latestSnapshots);
              }
            });

            marketHistoryRef.current = newHistory;
            setMarketHistory(newHistory);
            setMarketData(latestSnapshots);
            setLastUpdate(new Date());
            historyLoadedRef.current = true;
            return;
          }

          // ── Live message: append new tick ─────────────────────────────────
          if (typeof data.ts !== "number" || !isFinite(data.ts)) return;
          if (!data) return;
          const priceData = data.data || data;
          if (!priceData || typeof priceData !== "object") return;

          // Build rolling history
          const newHistory = { ...marketHistoryRef.current };
          EXCHANGES.forEach((ex) => {
            const exData = priceData[ex];
            if (!exData) return;
            const bid = parseFloat(exData.bid);
            const ask = parseFloat(exData.ask);
            if (!bid || !ask) return;
            const tick = { bid, ask, spread: ask - bid, ts: data.ts };
            if (!tick.ts || isNaN(tick.bid) || isNaN(tick.ask)) return;
            const history = newHistory[ex] || [];
            newHistory[ex] = [...history, tick].slice(-300).filter(t => t && t.bid && t.ask && t.ts);
          });
          marketHistoryRef.current = newHistory;

          // Invoke imperative Canvas callback
          if (chartCallback) {
             chartCallback("live", data.ts, priceData);
          }

          // throttle del UI: evitamos congelar react limitando renders a 3 fps
          const now = Date.now();
          if (now - lastDomUpdate > 333) {
            setMarketData(priceData);
            setMarketHistory(newHistory);
            setLastUpdate(new Date());
            if (typeof data.truePrice === "number") setTruePrice(data.truePrice);
            lastDomUpdate = now;
          }

        } catch (e) {
          remoteLog(`WS parse error: ${e.message}`, "ERROR", "WS");
        }
      });

      activeClient.on("error", (err) => {
        remoteLog(`WS error: ${err.message || err}`, "ERROR", "WS");
        setIsConnected(false);
      });

      activeClient.on("close", () => {
        remoteLog("WS disconnected — reconnecting in 5s", "WARN", "WS");
        setIsConnected(false);
        reconnectTimer = setTimeout(connect, 5000);
      });
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (activeClient) activeClient.end();
    };
  }, [brokerUrl, topic, token, tokenError, chartCallback]);

  return {
    isConnected,
    activeMqttClient,
    alerts, setAlerts,
    trades, setTrades,
    pnl, setPnl,
    auditLog, setAuditLog,
    activeRules, setActiveRules,
    agentResponse, setAgentResponse,
    agentLoading, setAgentLoading,
    marketData, setMarketData,
    marketHistory, setMarketHistory,
    lastUpdate,
    truePrice,
  };
}
