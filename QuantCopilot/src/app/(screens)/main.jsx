import React, { useEffect, useState, useRef, useContext } from "react";
import { createChart, LineSeries } from "lightweight-charts";
import {
  Text,
  View,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Platform,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { createMqttClient } from "../../utilsApp/mqttClient";
import { getMqttToken } from "../../utilsApp/tokenGenerator";
import { remoteLog } from "../../utilsApp/remoteLog";
import {
  createGlobalStyles,
  backgroundColor,
  accentColor,
  borderColor,
  cardColor,
  textSecondary,
} from "../../core/styles";
import ContextModule from "../../providers/contextModule";

const BROKER_URL =
  process.env.EXPO_PUBLIC_MQTT_URL || "wss://websocket.blankit.dpdns.org";
const TOPIC = "market/btc/ticker";

remoteLog("Module loaded", "INFO", "BOOT");

const EXCHANGES = [
  "Binance",
  "Kraken",
  "Coinbase",
  "OKX",
  "Bitfinex",
  "Bybit",
  "Gateio",
  "Gemini",
  "Bitstamp",
  "Kucoin",
];

const ArbitrageFeed = React.memo(({ alerts }) => {
  const GlobalStyles = createGlobalStyles();
  
  return (
    <View style={styles.feedCard}>
      <View style={styles.sectionTitleRow}>
        <Text style={GlobalStyles.sectionHeader}>Arbitrage Alert Feed</Text>
        <Text style={[styles.monoLabel, { color: "#38bdf8" }]}>HFT</Text>
      </View>
      
      {alerts.length === 0 ? (
        <View style={styles.emptyFeed}>
          <Text style={styles.emptyFeedText}>NO ARBITRAGE OPPORTUNITIES DETECTED</Text>
          <Text style={styles.emptyFeedSubtext}>Monitoring live orderbooks at 2 Hz...</Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled={true}>
          {alerts.map((alert, idx) => {
            const timeStr = alert.timestamp 
              ? new Date(alert.timestamp * 1000).toLocaleTimeString()
              : new Date().toLocaleTimeString();
            return (
              <View key={alert.id || idx} style={styles.alertItem}>
                <View style={styles.alertHeader}>
                  <Text style={styles.alertId}>{alert.id || "ARB-GENERIC"}</Text>
                  <Text style={styles.alertTime}>{timeStr}</Text>
                </View>
                
                <View style={styles.alertRouteRow}>
                  <View style={styles.routeBadgeBuy}>
                    <Text style={styles.routeBadgeText}>BUY: {alert.compraEn}</Text>
                  </View>
                  <Text style={styles.routeArrow}>➔</Text>
                  <View style={styles.routeBadgeSell}>
                    <Text style={styles.routeBadgeText}>SELL: {alert.vendeEn}</Text>
                  </View>
                </View>
                
                <View style={styles.alertDataRow}>
                  <View>
                    <Text style={styles.alertDataLabel}>Prices (B / S)</Text>
                    <Text style={styles.alertDataVal}>
                      ${alert.precioCompra?.toLocaleString(undefined, { minimumFractionDigits: 1 })} / ${alert.precioVenta?.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.alertDataLabel}>Vol / Profit</Text>
                    <Text style={styles.alertDataVal}>
                      {alert.volumen} BTC | <Text style={styles.alertProfitText}>+${parseFloat((alert.profitTotalUSD ?? 0).toFixed(2))}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
});

export default function MainScreen() {
  const context = useContext(ContextModule);
  const GlobalStyles = createGlobalStyles();

  useEffect(() => {
    remoteLog("Component mounted", "INFO", "BOOT");
  }, []);

  const [isConnected, setIsConnected] = useState(false);
  const [marketData, setMarketData] = useState({}); // latest values for stats bar
  const [marketHistory, setMarketHistory] = useState({}); // 50-tick history per exchange
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedExchange, setSelectedExchange] = useState(
    context?.value?.selectedExchange || "Binance",
  );
  const [token, setToken] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [exchangeFees, setExchangeFees] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [truePrice, setTruePrice] = useState(null);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const chartDataRef = useRef([]);
  const lineSeriesRef = useRef(null);
  const selectedExchangeRef = useRef(selectedExchange);
  const historyLoadedRef = useRef(false);
  const marketHistoryRef = useRef({});

  const handleSelectExchange = (exchange) => {
    setSelectedExchange(exchange);
    selectedExchangeRef.current = exchange;
    if (context && context.setValue) {
      context.setValue({ selectedExchange: exchange });
    }
    // Rebuild chart from existing history for the new exchange
    const history = marketHistoryRef.current[exchange] || [];
    if (lineSeriesRef.current && history.length > 0) {
      const points = history.map((tick) => ({
        time: tick.ts,
        value: (tick.bid + tick.ask) / 2,
      }));
      // Filter out duplicate timestamps keeping the latest one for lightweight-charts
      const uniquePoints = [];
      const seenTimes = new Set();
      for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        if (!seenTimes.has(p.time)) {
          seenTimes.add(p.time);
          uniquePoints.unshift(p);
        }
      }
      chartDataRef.current = uniquePoints;
      lineSeriesRef.current.setData(uniquePoints);
      chartRef.current?.timeScale().fitContent();
    }
  };

  // ─── Generate JWT locally (same library/params as ws_server/generator.js) ─────
  useEffect(() => {
    getMqttToken().then((token) => {
      if (token) {
        remoteLog(`Token ready len=${token.length}`, "INFO", "TOKEN");
        setToken(token);
        setTokenError(null);
      } else {
        remoteLog("Token unavailable", "ERROR", "TOKEN");
        setTokenError("WSS_SECRET not set");
      }
    });
  }, []);

  // ─── Chart (hardcoded test) ────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const formatTime = (time) => {
      const date = new Date(time);
      if (isNaN(date.getTime())) return "";
      const pad = (num) => num.toString().padStart(2, "0");
      const ms = date.getMilliseconds().toString().padStart(3, "0");
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${ms}`;
    };

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { color: "#0F0F11" },
        textColor: "#FFFFFF",
      },
      grid: {
        vertLines: { color: "#1F1F23" },
        horzLines: { color: "#1F1F23" },
      },
      localization: {
        timeFormatter: formatTime,
      },
      timeScale: {
        visible: true,
        tickMarkFormatter: formatTime,
      },
      priceScale: { visible: true },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#34d399",
      lineWidth: 2,
    });

    lineSeriesRef.current = lineSeries;
    chartRef.current = chart;

    return () => chart.remove();
  }, []);

  // ─── Establish MQTT connection ─────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      if (tokenError)
        remoteLog(`Token unavailable, WS skipped: ${tokenError}`, "WARN", "WS");
      return;
    }

    let reconnectTimer = null;
    let activeClient = null;

    const connect = () => {
      remoteLog(`WS: connecting... tokenLen=${token.length}`, "INFO", "WS");
      remoteLog(`WS: token JWT header=${token.split(".")[0]}`, "INFO", "WS");
      activeClient = createMqttClient(BROKER_URL, {
        username: "ccm_id",
        password: token,
      });

      activeClient.on("connect", () => {
        remoteLog("WS connected", "INFO", "WS");
        setIsConnected(true);
        activeClient.subscribe(TOPIC);
        activeClient.subscribe("ARBITRAGE_ALERTS");
      });

      activeClient.on("message", (topic, message) => {
        try {
          let raw = message.toString();
          if (!raw || raw === "[object Object]") return;
          const data = JSON.parse(raw);
          if (!data || typeof data !== "object") return;

          // ── Fees message: store in state ──────────────────────────────────
          if (topic === "market/btc/ticker/fees") {
            setExchangeFees(data);
            return;
          }

          // ── Arbitrage Alerts message: prepend and slice to max 50 ───────────
          if (topic === "ARBITRAGE_ALERTS") {
            setAlerts((prev) => [data, ...prev].slice(0, 50));
            return;
          }

          // ── History message: fill chart with last 50 values ─────────────────
          if (topic && topic.endsWith("/history")) {
            remoteLog(`Received historical data payload on topic: ${topic}`, "INFO", "HISTORY");
            if (historyLoadedRef.current) return;
            historyLoadedRef.current = true;

            if (!data) return;
            // Each item in history should have numeric ts
            const histData = Array.isArray(data) ? data : [data];
            if (!histData.length) return;

            const chartPoints = [];
            const latestSnapshots = {};
            const newHistory = {};

            histData.forEach((snap) => {
              if (!snap || typeof snap.ts !== "number" || !isFinite(snap.ts))
                return;
              const snapData = snap.data || snap;
              EXCHANGES.forEach((ex) => {
                const exData = snapData && snapData[ex];
                if (!exData) return;
                const bid = parseFloat(exData.bid);
                const ask = parseFloat(exData.ask);
                if (!bid || !ask || isNaN(bid) || isNaN(ask)) return;
                const tick = {
                  bid,
                  ask,
                  spread: ask - bid,
                  ts: snap.ts,
                };
                const history = newHistory[ex] || [];
                newHistory[ex] = [...history, tick]
                  .slice(-300)
                  .filter((t) => t && t.bid && t.ask && t.ts && isFinite(t.ts));
                latestSnapshots[ex] = exData;
              });
              if (snap.ts) {
                const exData = latestSnapshots[selectedExchangeRef.current];
                if (exData && exData.bid && exData.ask) {
                  const mid =
                    (parseFloat(exData.bid) + parseFloat(exData.ask)) / 2;
                  chartPoints.push({
                    time: snap.ts,
                    value: mid,
                  });
                }
              }
            });

            marketHistoryRef.current = newHistory;
            setMarketHistory(newHistory);
            setMarketData(latestSnapshots);
            setLastUpdate(new Date());

            const validPoints = chartPoints.filter(
              (p) =>
                p &&
                p.time != null &&
                p.value != null &&
                !isNaN(p.time) &&
                !isNaN(p.value),
            );
            // Filter out duplicate timestamps keeping the latest one for lightweight-charts
            const uniquePoints = [];
            const seenTimes = new Set();
            for (let i = validPoints.length - 1; i >= 0; i--) {
              const p = validPoints[i];
              if (!seenTimes.has(p.time)) {
                seenTimes.add(p.time);
                uniquePoints.unshift(p);
              }
            }
            if (lineSeriesRef.current && uniquePoints.length > 0) {
              chartDataRef.current = uniquePoints;
              lineSeriesRef.current.setData(uniquePoints);
              chartRef.current?.timeScale().fitContent();
              remoteLog(`Applied ${uniquePoints.length} unique history chart points for ${selectedExchangeRef.current}`, "INFO", "HISTORY");
            } else {
              remoteLog(`No chart points to render from history data`, "WARN", "HISTORY");
            }
            return;
          }

          // ── Live message: append new tick ─────────────────────────────────
          if (typeof data.ts !== "number" || !isFinite(data.ts)) return;
          if (!data) return;
          const priceData = data.data || data;
          if (!priceData || typeof priceData !== "object") return;
          setMarketData(priceData);
          setLastUpdate(new Date());
          if (typeof data.truePrice === "number") {
            setTruePrice(data.truePrice);
          }

          // Build rolling 50-tick history per exchange
          const newHistory = { ...marketHistoryRef.current };
          EXCHANGES.forEach((ex) => {
            const exData = priceData[ex];
            if (!exData) return;
            const bid = parseFloat(exData.bid);
            const ask = parseFloat(exData.ask);
            if (!bid || !ask) return;
            const tick = {
              bid,
              ask,
              spread: ask - bid,
              ts: data.ts,
            };
            if (!tick.ts || isNaN(tick.bid) || isNaN(tick.ask)) return;
            const history = newHistory[ex] || [];
            newHistory[ex] = [...history, tick]
              .slice(-300)
              .filter((t) => t && t.bid && t.ask && t.ts);
          });
          marketHistoryRef.current = newHistory;
          setMarketHistory(newHistory);

          // Feed chart with selected exchange mid price
          const exData = priceData[selectedExchangeRef.current];
          if (exData && exData.bid && exData.ask) {
            const mid = (parseFloat(exData.bid) + parseFloat(exData.ask)) / 2;
            if (!mid || isNaN(mid)) return;
            const time = data.ts;
            if (!lineSeriesRef.current) return;
            if (
              !historyLoadedRef.current ||
              chartDataRef.current.length === 0
            ) {
              chartDataRef.current = [{ time, value: mid }];
              lineSeriesRef.current.setData(chartDataRef.current);
              chartRef.current?.timeScale().fitContent();
              historyLoadedRef.current = true;
            } else {
              lineSeriesRef.current.update({ time, value: mid });
            }
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
  }, [token, tokenError]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const selectedData = marketData[selectedExchange] || {};
  const selectedBid = selectedData.bid ? parseFloat(selectedData.bid) : 0;
  const selectedAsk = selectedData.ask ? parseFloat(selectedData.ask) : 0;
  const selectedMid =
    selectedBid > 0 && selectedAsk > 0 ? (selectedBid + selectedAsk) / 2 : 0;
  const selectedSpread = selectedAsk - selectedBid;

  const isLargeScreen =
    Platform.OS === "web" && Dimensions.get("window").width > 768;

  return (
    <SafeAreaView style={GlobalStyles.container}>
      <StatusBar barStyle="light-content" />

      <View style={GlobalStyles.header}>
        <View>
          <Text style={styles.brandText}>QUANTCOPILOT</Text>
          <Text style={styles.subBrandText}>REAL-TIME ORDERBOOK FEED</Text>
        </View>
        <View style={styles.statusWrapper}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConnected ? "#34d399" : "#f87171" },
            ]}
          />
          <Text style={styles.statusText}>
            {isConnected ? "LIVE FEED ACTIVE" : "DISCONNECTED"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ─── Stats Bar ─── */}
        <View style={styles.statsBar}>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Asset</Text>
            <Text style={styles.statMainVal}>BTC/USD</Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Mid</Text>
            <Text style={[styles.statMainVal, { color: accentColor }]}>
              {selectedMid > 0 ? `$${selectedMid.toLocaleString()}` : "---"}
            </Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>True Price (VWAP)</Text>
            <Text style={[styles.statMainVal, { color: "#38bdf8" }]}>
              {truePrice > 0 ? `$${truePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "---"}
            </Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Bid</Text>
            <Text style={styles.statMainVal}>
              {selectedBid > 0 ? `$${selectedBid.toLocaleString()}` : "---"}
            </Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Ask</Text>
            <Text style={styles.statMainVal}>
              {selectedAsk > 0 ? `$${selectedAsk.toLocaleString()}` : "---"}
            </Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Spread</Text>
            <Text style={styles.statMainVal}>
              {selectedSpread > 0 ? `$${parseFloat(selectedSpread.toFixed(4))}` : "---"}
            </Text>
          </View>
        </View>

        {/* ─── Layout Grid ─── */}
        <View
          style={[styles.layoutGrid, isLargeScreen && styles.layoutGridRow]}
        >
          {/* Chart placeholder */}
          <View
            style={[
              styles.leftColumn,
              isLargeScreen && { flex: 2, marginRight: 24 },
            ]}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={GlobalStyles.sectionHeader}>
                {selectedExchange} Mid Price
              </Text>
              <Text style={styles.monoLabel}>LIVE</Text>
            </View>
            <View style={styles.chartCard}>
              <View
                ref={chartContainerRef}
                style={{ width: "100%", height: 300 }}
                onLayout={(e) => {
                  if (chartRef.current) {
                    chartRef.current.resize(e.nativeEvent.layout.width, 300);
                  }
                }}
              />
            </View>
            <ArbitrageFeed alerts={alerts} />
          </View>

          {/* Exchange Table */}
          <View style={[styles.rightColumn, isLargeScreen && { flex: 1 }]}>
            <View style={styles.sectionTitleRow}>
              <Text style={GlobalStyles.sectionHeader}>Exchange Monitor</Text>
              <Text style={styles.monoLabel}>
                {lastUpdate ? lastUpdate.toLocaleTimeString() : "WAITING"}
              </Text>
            </View>

            {/* Exchange selector */}
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>
                  Exchange
                </Text>
                <Text style={styles.tableHeaderCell}>Bid</Text>
                <Text style={styles.tableHeaderCell}>Ask</Text>
                <Text style={styles.tableHeaderCell}>Spread</Text>
              </View>

              {EXCHANGES.map((exchange) => {
                const exData = marketData[exchange] || {};
                const bidVal = exData.bid ? parseFloat(exData.bid) : 0;
                const askVal = exData.ask ? parseFloat(exData.ask) : 0;
                const spreadVal = askVal - bidVal;
                const isSelected = selectedExchange === exchange;

                return (
                  <Pressable
                    key={exchange}
                    onPress={() => handleSelectExchange(exchange)}
                    style={[styles.tableRow, isSelected && styles.selectedRow]}
                  >
                    <View
                      style={{
                        flex: 1.5,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      {isSelected && <View style={styles.rowSelectorDot} />}
                      <Text
                        style={[
                          styles.exchangeName,
                          isSelected && { color: accentColor },
                        ]}
                      >
                        {exchange}
                      </Text>
                    </View>
                    <Text style={styles.priceValText}>
                      {bidVal > 0 ? bidVal.toFixed(1) : "---"}
                    </Text>
                    <Text style={[styles.priceValText, { color: "#f87171" }]}>
                      {askVal > 0 ? askVal.toFixed(1) : "---"}
                    </Text>
                    <Text style={[styles.priceValText, { color: accentColor }]}>
                      {spreadVal > 0 ? parseFloat(spreadVal.toFixed(4)) : "---"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Selected Exchange Fee Panel */}
            {exchangeFees && exchangeFees[selectedExchange] && (
              <View style={styles.feePanel}>
                <Text style={styles.feeTitle}>{selectedExchange} Fee Matrix</Text>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Taker Fee:</Text>
                  <Text style={styles.feeValue}>{(exchangeFees[selectedExchange].taker * 100).toFixed(2)}%</Text>
                  <Text style={[styles.feeLabel, { marginLeft: 16 }]}>Withdrawal:</Text>
                  <Text style={styles.feeValue}>{exchangeFees[selectedExchange].withdrawalBTC} BTC</Text>
                </View>
              </View>
            )}

            {/* 50-tick history */}
            <View style={[styles.tableCard, { marginTop: 16 }]}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Time</Text>
                <Text style={styles.tableHeaderCell}>Bid</Text>
                <Text style={styles.tableHeaderCell}>Ask</Text>
                <Text style={styles.tableHeaderCell}>Spread</Text>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                {(marketHistory[selectedExchange ?? "Binance"] || [])
                  .filter(
                    (t) => t && t.bid != null && t.ask != null && t.ts != null,
                  )
                  .slice(-50)
                  .reverse()
                  .map((tick, i) => {
                    if (!tick || !tick.ts) return null;
                    const ts = new Date(tick.ts).toLocaleTimeString() || "--";
                    return (
                      <View key={`${tick.ts}-${i}`} style={styles.tableRow}>
                        <Text style={[styles.priceValText, { flex: 1 }]}>
                          {ts}
                        </Text>
                        <Text style={[styles.priceValText, {}]}>
                          {(tick.bid ?? 0).toFixed(1)}
                        </Text>
                        <Text
                          style={[styles.priceValText, { color: "#f87171" }]}
                        >
                          {(tick.ask ?? 0).toFixed(1)}
                        </Text>
                        <Text
                          style={[styles.priceValText, { color: accentColor }]}
                        >
                          {parseFloat((tick.spread ?? 0).toFixed(4))}
                        </Text>
                      </View>
                    );
                  })}
              </ScrollView>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  brandText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 20,
    letterSpacing: 2,
  },
  subBrandText: {
    color: textSecondary,
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  statusWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: borderColor,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  statsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: borderColor,
    backgroundColor: cardColor,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 4,
    marginBottom: 24,
  },
  statColumn: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 6,
  },
  statMainVal: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 18,
    marginTop: 4,
  },
  layoutGrid: {
    flexDirection: "column",
  },
  layoutGridRow: {
    flexDirection: "row",
  },
  leftColumn: {
    marginBottom: 24,
  },
  rightColumn: {
    marginBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  monoLabel: {
    color: "#34d399",
    fontSize: 9,
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
    letterSpacing: 1.2,
  },
  chartCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 4,
    overflow: "hidden",
  },
  chartPlaceholder: {
    height: 320,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: textSecondary,
    fontSize: 13,
  },
  tableCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 4,
    overflow: "hidden",
  },
  mobileChartPlaceholder: {
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#0F0F11",
  },
  tableHeaderCell: {
    color: textSecondary,
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#161619",
    alignItems: "center",
  },
  selectedRow: {
    backgroundColor: "#161619",
  },
  exchangeName: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  rowSelectorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: accentColor,
    marginRight: 8,
  },
  priceValText: {
    color: "#34d399",
    fontWeight: "600",
    fontSize: 13,
    flex: 1,
    textAlign: "right",
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: textSecondary,
    fontSize: 13,
  },
  feedCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 24,
    padding: 16,
  },
  emptyFeed: {
    height: 150,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: borderColor,
    borderRadius: 4,
  },
  emptyFeedText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
  },
  emptyFeedSubtext: {
    color: "#475569",
    fontSize: 10,
    marginTop: 4,
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
  },
  alertItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#161619",
    paddingVertical: 12,
  },
  alertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  alertId: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
  },
  alertTime: {
    color: "#475569",
    fontSize: 10,
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
  },
  alertRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  routeBadgeBuy: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.3)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 2,
  },
  routeBadgeSell: {
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.3)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 2,
  },
  routeBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  routeArrow: {
    color: "#64748b",
    marginHorizontal: 8,
    fontSize: 12,
  },
  alertDataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  alertDataLabel: {
    color: "#475569",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  alertDataVal: {
    color: "#e2e8f0",
    fontSize: 11,
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
  },
  alertProfitText: {
    color: "#34d399",
    fontWeight: "700",
  },
  feePanel: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 4,
    padding: 16,
    marginTop: 16,
  },
  feeTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  feeLabel: {
    color: textSecondary,
    fontSize: 11,
    marginRight: 6,
  },
  feeValue: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    fontFamily: Platform.OS === "web" ? "monospace" : "System",
  },
});
