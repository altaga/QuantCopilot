import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

const EXCHANGE_URLS = {
  binance: "https://www.binance.com/en/trade/BTC_USDT",
  okx: "https://www.okx.com/trade-spot/btc-usdt",
  bybit: "https://www.bybit.com/en/trade/spot/BTC/USDT",
  kraken: "https://pro.kraken.com/app/trade/btc-usd",
  coinbase: "https://advanced.coinbase.com/trade/BTC-USD",
  bitfinex: "https://trading.bitfinex.com/t/BTC:UST",
  gateio: "https://www.gate.io/trade/BTC_USDT",
  gemini: "https://exchange.gemini.com/trade/BTCUSD",
  bitstamp: "https://www.bitstamp.net/market/btcusd/",
  kucoin: "https://www.kucoin.com/trade/BTC-USDT",
};

const openExchange = (exchange) => {
  const url = EXCHANGE_URLS[exchange];
  if (!url) return;
  if (Platform.OS === "web") {
    window.open(url, "_blank");
  } else {
    Linking.openURL(url);
  }
};

import {
  accentColor,
  backgroundColor,
  borderColor,
  cardColor,
  createGlobalStyles,
  dangerColor,
  elevatedColor,
  infoColor,
  successColor,
  textMuted,
  textPrimary,
  textSecondary,
  warningColor,
  whiteColor
} from "../../core/styles";
import { createMqttClient } from "../../utilsApp/mqttClient";
import { getMqttToken } from "../../utilsApp/tokenGenerator";

const BROKER_URL =
  process.env.EXPO_PUBLIC_MQTT_URL || "wss://websocket.blankit.dpdns.org";
const BROKER_HTTP_URL = BROKER_URL.replace(/^wss:\/\//, "https://").replace(
  /^ws:\/\//,
  "http://",
);

// Helper to draw smooth sparkline curves
const generateSmoothSparkline = (data, width = 100, height = 35) => {
  if (!data || data.length < 2)
    return `M0,${height / 2} L${width},${height / 2}`;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min === 0 ? 1 : max - min;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 10) - 5;
    return { x, y };
  });

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = (p0.x + p1.x) / 2;
    d += ` C${cp1x},${p0.y} ${cp1x},${p1.y} ${p1.x},${p1.y}`;
  }
  return d;
};

// Helper for the main PnL chart with fill
const generateFilledChart = (data, width = 300, height = 120) => {
  if (!data || data.length < 2) {
    return {
      line: `M0,${height / 2} L${width},${height / 2}`,
      fill: `M0,${height} L0,${height / 2} L${width},${height / 2} L${width},${height} Z`,
    };
  }

  const max = Math.max(...data, 1500);
  const min = Math.min(...data, -500);
  const range = max - min === 0 ? 1 : max - min;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return { x, y };
  });

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = (p0.x + p1.x) / 2;
    d += ` C${cp1x},${p0.y} ${cp1x},${p1.y} ${p1.x},${p1.y}`;
  }

  const fill = `${d} L${width},${height} L0,${height} Z`;
  return { line: d, fill };
};

export default function MainHub() {
  const router = useRouter();
  const GlobalStyles = createGlobalStyles();

  const [token, setToken] = useState(null);
  const [activeMqttClient, setActiveMqttClient] = useState(null);

  // Dashboard Live Data
  const [pnl, setPnl] = useState({
    totalNetUSD: 0,
    dailyPnL: 0,
    totalTrades: 0,
    winRatePercent: 0,
    totalBalanceUSD: 12540.32,
    blockedTradesCount: 0,
    totalRiskSavedUSD: 0,
  });
  const [activeRules, setActiveRules] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [auditLog, setAuditLog] = useState([]);

  const [serverTime, setServerTime] = useState(new Date().toUTCString());

  // Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setServerTime(new Date().toISOString().substring(11, 19) + " UTC");
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial REST snapshot
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${BROKER_HTTP_URL}/api/snapshot`);
        if (!res.ok) return;
        const snap = await res.json();
        if (snap.rules) setActiveRules(snap.rules);
        if (snap.pnl) {
          setPnl(snap.pnl);
        }
        // We leave alerts empty to only show live ones, or we could fetch trade history here.
      } catch (e) {
        console.warn("Bootstrap fetch failed:", e.message);
      }
    };
    load();
  }, []);

  // Connect MQTT for live dashboard metrics
  useEffect(() => {
    getMqttToken().then(setToken);
  }, []);

  useEffect(() => {
    if (!token) return;

    const client = createMqttClient(BROKER_URL, {
      username: "ccm_id",
      password: token,
    });

    client.on("connect", () => {
      setActiveMqttClient(client);
      client.subscribe("PNL_UPDATE");
      client.subscribe("ARBITRAGE_ALERTS");
      client.subscribe("RISK_AUDIT");
      client.subscribe("ACTIVE_RULES");
    });

    client.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        if (topic === "PNL_UPDATE") {
          setPnl(data);
        }
        if (topic === "ACTIVE_RULES") setActiveRules(data);
        if (topic === "ARBITRAGE_ALERTS") {
          setAlerts((prev) => {
            if (prev.some((a) => a.id === data.id)) return prev;
            return [data, ...prev].slice(0, 10); // Keep top 10 on dashboard
          });
        }
        if (topic === "RISK_AUDIT") {
          setAuditLog((prev) => {
            if (prev.some((a) => a.id === data.id)) return prev;
            return [data, ...prev].slice(0, 50);
          });
        }
      } catch (e) { }
    });

    return () => client.end();
  }, [token]);

  // Calculations for cards
  const totalOpportunities = (pnl.totalTrades || 0) + alerts.length;
  const riskSaved = pnl.totalRiskSavedUSD || 0;
  return (
    <View style={styles.layout}>
      {/* ─── MAIN CONTENT ─── */}
      <View style={styles.mainArea}>
        {/* TOP NAVBAR */}
        <View style={styles.topNav}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginRight: 32,
              }}
            >
              <Image
                source={require("../../assets/logoBN.png")}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 12,
                  marginRight: 16,
                  marginTop: 0,
                }}
                resizeMode="contain"
              />
              <View style={{ justifyContent: "center" }}>
                <Text
                  style={[
                    styles.brandText,
                    {
                      fontSize: 24,
                      color: whiteColor,
                      fontWeight: "700",
                      letterSpacing: -0.2,
                      marginBottom: 2,
                      lineHeight: 28,
                    },
                  ]}
                >
                  QuantCopilot
                </Text>
                <Text
                  style={[
                    styles.subBrandText,
                    {
                      fontSize: 13,
                      color: "#A1A1AA",
                      letterSpacing: 0,
                      textTransform: "none",
                      lineHeight: 18,
                    },
                  ]}
                >
                  AI Risk Copilot for{"\n"}Autonomous Arbitrage
                </Text>
              </View>
            </View>

            <View
              style={{
                width: 1,
                height: 32,
                backgroundColor: borderColor,
                marginRight: 24,
              }}
            />

            <Text style={styles.pageTitle}>Live Dashboard</Text>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>

          <View style={[styles.navStatsGroup, { alignItems: "center" }]}>
            {/* Connected Exchanges */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginRight: 16,
              }}
            >
              <Text
                style={{
                  color: textSecondary,
                  fontSize: 11,
                  marginRight: 12,
                  fontWeight: "500",
                }}
              >
                Connected Exchanges
              </Text>

              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable
                  onPress={() => openExchange("binance")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/binance.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("okx")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/okx.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("bybit")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/bybit.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("kraken")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/kraken.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("coinbase")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/coinbase.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("bitfinex")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/bitfinex.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("gateio")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/gateio.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("gemini")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/gemini.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("bitstamp")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/bitstamp.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openExchange("kucoin")}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    Platform.OS === "web" ? { cursor: "pointer" } : {},
                  ]}
                >
                  <Image
                    source={require("../../assets/exchanges/kucoin.png")}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.navStat}>
              <Text style={styles.navStatLabel}>System</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  marginTop: 2,
                }}
              >
                <View style={[styles.statusDot, { marginRight: 6 }]} />
                <Text style={styles.statusTextActive}>Operational</Text>
              </View>
            </View>
            <View style={styles.navStat}>
              <Text style={styles.navStatLabel}>Latency</Text>
              <Text style={[styles.navStatValue, { color: successColor }]}>
                78 ms
              </Text>
            </View>
            <View style={styles.navStat}>
              <Text style={styles.navStatLabel}>Server Time</Text>
              <Text style={styles.navStatValue}>{serverTime}</Text>
            </View>
            <View style={styles.navStat}>
              <Text style={styles.navStatLabel}>Account Balance</Text>
              <Text style={[styles.navStatValue, { color: whiteColor }]}>
                {pnl.totalBalanceUSD !== undefined
                  ? pnl.totalBalanceUSD.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                  : "12,540.32"}{" "}
                USDT
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* METRIC CARDS ROW */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.metricLabel}>Total Opportunities</Text>
                <Text style={styles.metricValue}>{totalOpportunities}</Text>
                <Text style={styles.metricChange}>
                  +{alerts.length} vs last min
                </Text>
              </View>
              <View
                style={{
                  width: 70,
                  height: 35,
                  marginLeft: 12,
                  marginBottom: 4,
                }}
              >
                <Svg width="100%" height="100%" viewBox="0 0 100 35">
                  <Path
                    d={generateSmoothSparkline(pnl.history?.opportunities)}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            </View>
            <View style={styles.metricCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.metricLabel}>Est. Net Profit (24h)</Text>
                <Text
                  style={[
                    styles.metricValue,
                    {
                      color:
                        (pnl.dailyPnL || 0) >= 0 ? successColor : dangerColor,
                    },
                  ]}
                >
                  {(pnl.dailyPnL || 0) >= 0 ? "+" : ""}
                  {(pnl.dailyPnL || 0).toFixed(2)} USDT
                </Text>
                <Text style={styles.metricChange}>
                  {(pnl.winRatePercent || 0).toFixed(1)}% Win Rate
                </Text>
              </View>
              <View
                style={{
                  width: 70,
                  height: 35,
                  marginLeft: 12,
                  marginBottom: 4,
                }}
              >
                <Svg width="100%" height="100%" viewBox="0 0 100 35">
                  <Path
                    d={generateSmoothSparkline(pnl.history?.profit)}
                    fill="none"
                    stroke={successColor}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            </View>
            <View style={styles.metricCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.metricLabel}>Trades Executed (24h)</Text>
                <Text style={styles.metricValue}>{pnl.totalTrades || 0}</Text>
                <Text style={[styles.metricChange, { color: infoColor }]}>
                  Success Rate {pnl.winRatePercent?.toFixed(1) || 0}%
                </Text>
              </View>
              <View
                style={{
                  width: 70,
                  height: 35,
                  marginLeft: 12,
                  marginBottom: 4,
                }}
              >
                <Svg width="100%" height="100%" viewBox="0 0 100 35">
                  <Path
                    d={generateSmoothSparkline(pnl.history?.trades)}
                    fill="none"
                    stroke={infoColor}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            </View>
            <View style={styles.metricCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.metricLabel}>Risk Saved (24h)</Text>
                <Text style={styles.metricValue}>
                  {(pnl.totalRiskSavedUSD || 0).toFixed(2)} USDT
                </Text>
                <Text style={[styles.metricChange, { color: dangerColor }]}>
                  Blocked {pnl.blockedTradesCount || 0} trades
                </Text>
              </View>
              <View
                style={{
                  width: 70,
                  height: 35,
                  marginLeft: 12,
                  marginBottom: 4,
                }}
              >
                <Svg width="100%" height="100%" viewBox="0 0 100 35">
                  <Path
                    d={generateSmoothSparkline(pnl.history?.riskSaved)}
                    fill="none"
                    stroke={warningColor}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            </View>
            <View style={styles.metricCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.metricLabel}>Current Drawdown (24h)</Text>
                <Text style={[styles.metricValue, { color: dangerColor }]}>
                  {(pnl.dailyPnL || 0) < 0
                    ? (pnl.dailyPnL || 0).toFixed(2)
                    : "0.00"}{" "}
                  USDT
                </Text>
                <Text style={[styles.metricChange, { color: warningColor }]}>
                  Limit: {activeRules?.maxDailyLossUSD || -200} USDT
                </Text>
              </View>
              <View
                style={{
                  width: 70,
                  height: 35,
                  marginLeft: 12,
                  marginBottom: 4,
                }}
              >
                <Svg width="100%" height="100%" viewBox="0 0 100 35">
                  <Path
                    d={generateSmoothSparkline(pnl.history?.drawdown)}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            </View>
          </View>

          {/* MIDDLE ROW */}
          <View style={styles.middleRow}>
            {/* LIVE OPPORTUNITIES TABLE */}
            <View style={styles.tableCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Live Opportunities</Text>
                <View style={styles.badgeCount}>
                  <Text style={styles.badgeCountText}>{alerts.length}</Text>
                </View>
              </View>

              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeader, { flex: 2 }]}>Market</Text>
                <Text style={[styles.tableHeader, { flex: 2 }]}>Buy (Ex)</Text>
                <Text style={[styles.tableHeader, { flex: 2 }]}>Sell (Ex)</Text>
                <Text style={[styles.tableHeader, { flex: 1.5 }]}>Spread</Text>
                <Text style={[styles.tableHeader, { flex: 1.5 }]}>Net %</Text>
                <Text style={[styles.tableHeader, { flex: 1.5 }]}>
                  Risk Score
                </Text>
                <Text
                  style={[styles.tableHeader, { flex: 1, textAlign: "right" }]}
                >
                  Action
                </Text>
              </View>

              {alerts.map((alert, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableCellBold}>BTC/USD</Text>
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableCellMuted}>
                      {alert.compraEn || alert.buyExchange}
                    </Text>
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableCellMuted}>
                      {alert.vendeEn || alert.sellExchange}
                    </Text>
                  </View>
                  <View style={{ flex: 1.5 }}>
                    <Text style={[styles.tableCell, { color: successColor }]}>
                      {(alert.precioCompra || alert.buyPrice) > 0
                        ? (
                          (((alert.precioVenta || alert.sellPrice) -
                            (alert.precioCompra || alert.buyPrice)) /
                            (alert.precioCompra || alert.buyPrice)) *
                          100
                        ).toFixed(2)
                        : "0"}
                      %
                    </Text>
                  </View>
                  <View style={{ flex: 1.5 }}>
                    <Text style={[styles.tableCell, { color: successColor }]}>
                      {((alert.profitUSD || alert.gananciaEstimadaUSD || 0) / 
                        ((alert.buyPrice || alert.precioCompra || 1) * (alert.volume || alert.volumenEjecutable || 1)) * 100).toFixed(2)}%
                    </Text>
                  </View>
                  <View style={{ flex: 1.5 }}>
                    <Text style={[styles.tableCell, { color: warningColor }]}>
                      {alert.riskScore ?? "--"}/100
                    </Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => router.push("/(screens)/btcusd")}
                    >
                      <Text style={styles.actionBtnText}>View</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            {/* PNL PLACEHOLDER & EXPOSURE */}
            <View style={styles.chartsColumn}>
              <View style={[styles.tableCard, { flex: 1, marginBottom: 16 }]}>
                <Text style={styles.cardTitle}>PnL Overview (24h)</Text>
                <Text
                  style={[
                    styles.metricValue,
                    {
                      fontSize: 24,
                      color:
                        (pnl.dailyPnL || 0) >= 0 ? successColor : dangerColor,
                      marginVertical: 8,
                    },
                  ]}
                >
                  {(pnl.dailyPnL || 0) >= 0 ? "+" : ""}
                  {(pnl.dailyPnL || 0).toFixed(2)} USDT
                </Text>

                <View style={{ flex: 1, marginTop: 16 }}>
                  {/* Y-Axis Labels (Absolute positioned on left) */}
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 20,
                      justifyContent: "space-between",
                      zIndex: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      1.5K
                    </Text>
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      1.0K
                    </Text>
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      0.0K
                    </Text>
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      -500
                    </Text>
                  </View>

                  {/* Chart Area */}
                  <View style={{ marginLeft: 30, flex: 1 }}>
                    <Svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 300 120"
                      preserveAspectRatio="none"
                    >
                      <Defs>
                        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                          <Stop
                            offset="0"
                            stopColor={
                              (pnl.dailyPnL || 0) >= 0
                                ? successColor
                                : dangerColor
                            }
                            stopOpacity="0.4"
                          />
                          <Stop
                            offset="1"
                            stopColor={
                              (pnl.dailyPnL || 0) >= 0
                                ? successColor
                                : dangerColor
                            }
                            stopOpacity="0.0"
                          />
                        </LinearGradient>
                      </Defs>
                      <Path
                        d={generateFilledChart(pnl.history?.profit).fill}
                        fill="url(#grad)"
                      />
                      <Path
                        d={generateFilledChart(pnl.history?.profit).line}
                        fill="none"
                        stroke={
                          (pnl.dailyPnL || 0) >= 0 ? successColor : dangerColor
                        }
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>

                  {/* X-Axis Labels */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginLeft: 30,
                      marginTop: 8,
                      paddingRight: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      00:00
                    </Text>
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      06:00
                    </Text>
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      12:00
                    </Text>
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      18:00
                    </Text>
                    <Text
                      style={{
                        color: textMuted,
                        fontSize: 10,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      24:00
                    </Text>
                  </View>
                </View>
              </View>
              <View style={[styles.tableCard, { height: 200 }]}>
                <Text style={styles.cardTitle}>Exposure by Asset</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 24,
                  }}
                >
                  <View style={styles.donutHole} />
                  <View style={{ marginLeft: 32, gap: 12 }}>
                    <Text style={styles.tableCellMuted}>● BTC (45.2%)</Text>
                    <Text style={styles.tableCellMuted}>● ETH (22.1%)</Text>
                    <Text style={styles.tableCellMuted}>● SOL (15.6%)</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: backgroundColor,
  },
  brandText: {
    color: whiteColor,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subBrandText: {
    color: textMuted,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: successColor,
    marginRight: 8,
    shadowColor: successColor,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  statusTextActive: {
    color: successColor,
    fontSize: 12,
    fontWeight: "600",
  },
  mainArea: {
    flex: 1,
    backgroundColor: backgroundColor,
  },
  topNav: {
    height: 84,
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  pageTitle: {
    color: whiteColor,
    fontSize: 20,
    fontWeight: "600",
    marginRight: 12,
  },
  liveBadge: {
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: successColor,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  navStatsGroup: {
    flexDirection: "row",
    gap: 32,
  },
  navStat: {
    alignItems: "flex-end",
  },
  navStatLabel: {
    color: textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  navStatValue: {
    color: textSecondary,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  scrollContent: {
    padding: 24,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 220,
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 8,
    padding: 20,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  metricLabel: {
    color: textMuted,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 12,
  },
  metricValue: {
    color: whiteColor,
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  metricChange: {
    color: successColor,
    fontSize: 12,
    fontWeight: "500",
  },
  middleRow: {
    flexDirection: "row",
    gap: 24,
  },
  tableCard: {
    flex: 2,
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 8,
    padding: 24,
  },
  chartsColumn: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  cardTitle: {
    color: whiteColor,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  badgeCount: {
    backgroundColor: elevatedColor,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 12,
  },
  badgeCountText: {
    color: successColor,
    fontSize: 11,
    fontWeight: "600",
  },
  tableHeaderRow: {
    flexDirection: "row",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
    marginBottom: 12,
  },
  tableHeader: {
    color: textMuted,
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: elevatedColor,
  },
  tableCellBold: {
    color: whiteColor,
    fontSize: 13,
    fontWeight: "600",
  },
  tableCellMuted: {
    color: textSecondary,
    fontSize: 13,
  },
  tableCell: {
    color: textPrimary,
    fontSize: 13,
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  actionBtn: {
    backgroundColor: "rgba(96, 165, 250, 0.15)", // info color tinted
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  actionBtnText: {
    color: "#60A5FA",
    fontSize: 11,
    fontWeight: "600",
  },
  donutHole: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 16,
    borderColor: accentColor,
    borderLeftColor: infoColor,
    borderRightColor: successColor,
  },
});
