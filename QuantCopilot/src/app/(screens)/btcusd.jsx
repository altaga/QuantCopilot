import { useRouter } from "expo-router";
import { createChart, LineSeries } from "lightweight-charts";
import { ArrowLeft } from "lucide-react-native";
import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  accentColor,
  backgroundColor,
  borderColor,
  borderLight,
  cardColor,
  createGlobalStyles,
  dangerColor,
  dangerMuted,
  elevatedColor,
  infoColor,
  successColor,
  successMuted,
  textMuted,
  textPrimary,
  textSecondary,
  warningColor,
  warningMuted,
  whiteColor,
} from "../../core/styles";
import ContextModule from "../../providers/contextModule";
import { createMqttClient } from "../../utilsApp/mqttClient";
import { remoteLog } from "../../utilsApp/remoteLog";
import { getMqttToken } from "../../utilsApp/tokenGenerator";

// Fallback risk score calculator for trades without server-computed score
const EXCHANGE_TRUST = {
  Binance: 95,
  Kraken: 90,
  Coinbase: 88,
  OKX: 82,
  Bitfinex: 75,
  Bybit: 80,
  Gateio: 78,
  Gemini: 72,
  Bitstamp: 85,
  Kucoin: 76,
  RektSwap: 20,
};

function deriveRiskScore(buyEx, sellEx) {
  if (!buyEx || !sellEx) return 75;
  const buyTrust = EXCHANGE_TRUST[buyEx] || 75;
  const sellTrust = EXCHANGE_TRUST[sellEx] || 75;
  // Base score from average exchange trust
  const base = (buyTrust + sellTrust) / 2;
  // Minimal RektSwap penalty (15% off)
  if (buyEx === "RektSwap" || sellEx === "RektSwap") {
    return Math.round(base * 0.85);
  }
  return Math.round(base);
}

const PnLBar = React.memo(({ pnl }) => {
  const GlobalStyles = createGlobalStyles();
  if (!pnl) return null;
  const isDailyProfitable = pnl.dailyPnL >= 0;
  const isTotalProfitable = pnl.totalNetUSD >= 0;

  return (
    <View style={[styles.statsBar, { marginTop: 16 }]}>
      <View style={styles.statColumn}>
        <Text style={GlobalStyles.labelSmall}>Total P&L</Text>
        <Text
          style={[
            styles.statMainVal,
            { color: isTotalProfitable ? successColor : dangerColor },
          ]}
        >
          {isTotalProfitable ? "▲" : "▼"} $
          {Math.abs(pnl.totalNetUSD || 0).toFixed(2)}
        </Text>
      </View>
      <View style={styles.statColumn}>
        <Text style={GlobalStyles.labelSmall}>Win Rate</Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}
        >
          <Text style={[styles.statMainVal, { marginTop: 0 }]}>
            {pnl.winRatePercent?.toFixed(1) || "0"}%
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${pnl.winRatePercent || 0}%`,
                  backgroundColor:
                    pnl.winRatePercent >= 50 ? successColor : warningColor,
                },
              ]}
            />
          </View>
        </View>
      </View>
      <View style={styles.statColumn}>
        <Text style={GlobalStyles.labelSmall}>Trades</Text>
        <Text style={styles.statMainVal}>{pnl.totalTrades || 0}</Text>
      </View>
      <View style={styles.statColumn}>
        <Text style={GlobalStyles.labelSmall}>Daily P&L</Text>
        <Text
          style={[
            styles.statMainVal,
            { color: isDailyProfitable ? successColor : dangerColor },
          ]}
        >
          {isDailyProfitable ? "▲" : "▼"} $
          {Math.abs(pnl.dailyPnL || 0).toFixed(2)}
        </Text>
      </View>
    </View>
  );
});
PnLBar.displayName = "PnLBar";

const TradeLog = React.memo(({ trades, selectedTradeId, onSelectTrade }) => {
  const GlobalStyles = createGlobalStyles();
  return (
    <View style={[styles.feedCard, { marginTop: 16 }]}>
      <View style={styles.sectionTitleRow}>
        <Text style={GlobalStyles.sectionHeader}>Execution Log</Text>
        <Text style={[styles.monoLabel, { color: "#818cf8" }]}>SIM</Text>
      </View>
      {trades.length === 0 ? (
        <View style={styles.emptyFeed}>
          <Text style={styles.emptyFeedText}>NO TRADES EXECUTED</Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled={true}>
          {trades.map((trade, idx) => {
            const isSelected = selectedTradeId === trade.id;
            return (
              <Pressable
                key={trade.id || idx}
                onPress={() => onSelectTrade(isSelected ? null : trade.id)}
                style={[
                  styles.alertItem,
                  isSelected && {
                    backgroundColor: "rgba(201, 169, 98, 0.08)",
                    borderColor: accentColor,
                    borderWidth: 1,
                  },
                ]}
              >
                <View style={styles.alertHeader}>
                  <Text style={styles.alertId}>{trade.id}</Text>
                  <Text style={styles.alertTime}>
                    {new Date(trade.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
                <View style={styles.alertRouteRow}>
                  <View style={styles.routeBadgeBuy}>
                    <Text style={styles.routeBadgeText}>
                      BUY: {trade.buyExchange}
                    </Text>
                  </View>
                  <Text style={styles.routeArrow}>➔</Text>
                  <View style={styles.routeBadgeSell}>
                    <Text style={styles.routeBadgeText}>
                      SELL: {trade.sellExchange}
                    </Text>
                  </View>
                </View>
                <View style={styles.alertDataRow}>
                  <View>
                    <Text style={styles.alertDataLabel}>Vol / Status</Text>
                    <Text style={styles.alertDataVal}>
                      {trade.volumeBTC} BTC |{" "}
                      <Text
                        style={{
                          color:
                            trade.status === "FILLED" ? "#34d399" : "#fbbf24",
                        }}
                      >
                        {trade.status}
                      </Text>
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.alertDataLabel}>Net Profit</Text>
                    <Text
                      style={[
                        styles.alertDataVal,
                        {
                          color:
                            trade.netProfitUSD >= 0
                              ? successColor
                              : dangerColor,
                        },
                      ]}
                    >
                      {trade.netProfitUSD >= 0 ? "+" : ""}$
                      {trade.netProfitUSD?.toFixed(2)}
                    </Text>
                  </View>
                </View>
                {isSelected && (
                  <Text
                    style={{
                      color: accentColor,
                      fontSize: 9,
                      marginTop: 6,
                      textAlign: "center",
                      fontWeight: "600",
                      letterSpacing: 0.5,
                    }}
                  >
                    SELECTED — TAP TO RELEASE
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
});

const RiskAuditConsole = React.memo(({ auditLog }) => {
  const GlobalStyles = createGlobalStyles();
  return (
    <View
      style={[
        styles.feedCard,
        { marginTop: 16, backgroundColor: elevatedColor },
      ]}
    >
      <View style={styles.sectionTitleRow}>
        <Text style={GlobalStyles.sectionHeader}>Risk Audit Console</Text>
        <Text style={[styles.monoLabel, { color: dangerColor }]}>GUARD</Text>
      </View>
      {auditLog.length === 0 ? (
        <View style={styles.emptyFeed}>
          <Text style={styles.emptyFeedText}>NO BLOCKED TRADES</Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
          {auditLog.map((log, idx) => (
            <View
              key={log.id || idx}
              style={{
                marginBottom: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: dangerColor,
                    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                    fontSize: 12,
                  }}
                >
                  🛡️ BLOCKED: {log.buyExchange} ➔{" "}
                  {log.sellExchange}
                </Text>
                <Text style={{ color: textMuted, fontSize: 10 }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <View
                  style={[
                    styles.reasonBadge,
                    log.reason === "KILL_SWITCH" && {
                      backgroundColor: dangerMuted,
                      borderColor: dangerColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.reasonBadgeText,
                      log.reason === "KILL_SWITCH" && { color: dangerColor },
                    ]}
                  >
                    {log.reason}
                  </Text>
                </View>
                <Text
                  style={{ color: textSecondary, fontSize: 11, marginLeft: 6 }}
                >
                  {log.detail}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
});
const StrategyPrompter = React.memo(
  ({
    activeRules,
    onSetStrategy,
    agentResponse,
    agentLoading,
    onUpdateRulesDirect,
  }) => {
    const GlobalStyles = createGlobalStyles();
    const [prompt, setPrompt] = useState("");
    const [expertMode, setExpertMode] = useState(false);
    const [draftRules, setDraftRules] = useState({});
    const [rulesSubmitting, setRulesSubmitting] = useState(false);

    // Local text states to hold intermediate typing states (like decimal points, negative signs, trailing zeros)
    const [minSpreadText, setMinSpreadText] = useState("");
    const [maxExposureText, setMaxExposureText] = useState("");
    const [maxDailyLossText, setMaxDailyLossText] = useState("");
    const [maxConsecutiveText, setMaxConsecutiveText] = useState("");

    // ── Guard: skip useEffect sync while user is actively editing text fields ──
    // Prevents keystrokes from being wiped when the server pushes a confirmed state
    // or when any parent re-render propagates a new activeRules object reference.
    const isEditingForm = useRef(false);

    // Keep draft rules in sync with activeRules changes from server/agent
    // ONLY when the user is NOT actively editing — this prevents keystrokes from
    // being overwritten by incoming MQTT pushes or confirmed state updates.
    useEffect(() => {
      if (activeRules) {
        const rules = {
          ...activeRules,
          exchangeBlacklist: activeRules.exchangeBlacklist || [],
        };

        // ── Only sync text fields when user is NOT typing ──────────────────
        // Once they stop (onChangeText fires), isEditingForm becomes true,
        // blocking the next activeRules change from wiping their input.
        if (!isEditingForm.current) {
          setDraftRules(rules);
          setMinSpreadText(
            activeRules.minSpreadPercent !== undefined
              ? String(activeRules.minSpreadPercent)
              : "",
          );
          setMaxExposureText(
            activeRules.maxExposureUSD !== undefined
              ? String(activeRules.maxExposureUSD)
              : "",
          );
          setMaxDailyLossText(
            activeRules.maxDailyLossUSD !== undefined
              ? String(activeRules.maxDailyLossUSD)
              : "",
          );
          setMaxConsecutiveText(
            activeRules.maxConsecutiveLosses !== undefined
              ? String(activeRules.maxConsecutiveLosses)
              : "",
          );
        }
      }
    }, [activeRules]);

    const handleSubmit = () => {
      if (prompt.trim() !== "") {
        onSetStrategy(prompt);
        setPrompt("");
      }
    };

    return (
      <View style={[styles.feedCard, { marginTop: 16 }]}>
        <View style={styles.sectionTitleRow}>
          <Text style={GlobalStyles.sectionHeader}>AI Strategy Console</Text>
          <Text style={[styles.monoLabel, { color: accentColor }]}>
            NLP / BEDROCK
          </Text>
        </View>
        <TextInput
          style={styles.prompterInput}
          multiline
          placeholderTextColor={textMuted}
          placeholder="e.g. Look at our win rate. If it's below 50%, tighten spreads..."
          value={prompt}
          onChangeText={setPrompt}
          editable={!agentLoading}
        />
        <View style={styles.presetsRow}>
          <Pressable
            disabled={agentLoading}
            onPress={() =>
              setPrompt(
                "Check our current win rate and P&L. If we are profitable, make active rules more aggressive by setting min spread to 0.1%. Otherwise, set min spread to 0.4%",
              )
            }
            style={styles.presetPill}
          >
            <Text style={styles.presetText}>Check Status & Adjust</Text>
          </Pressable>
          <Pressable
            disabled={agentLoading}
            onPress={() =>
              setPrompt(
                "Tighten rules: set minSpreadPercent to 0.5% and maxExposureUSD to 100",
              )
            }
            style={styles.presetPill}
          >
            <Text style={styles.presetText}>Conservative Guard</Text>
          </Pressable>
          <Pressable
            disabled={agentLoading}
            onPress={() => setPrompt("Emergency Stop. Block all execution.")}
            style={[
              styles.presetPill,
              {
                borderColor: dangerMuted,
                backgroundColor: "rgba(248, 113, 113, 0.05)",
              },
            ]}
          >
            <Text style={[styles.presetText, { color: dangerColor }]}>
              Kill Switch
            </Text>
          </Pressable>
          <Pressable
            disabled={agentLoading}
            onPress={() => {
              if (onUpdateRulesDirect) {
                const current = activeRules || {};
                onUpdateRulesDirect({
                  ...current,
                  enableRektSwap: !current.enableRektSwap,
                });
              }
            }}
            style={[
              styles.presetPill,
              {
                borderColor: activeRules?.enableRektSwap
                  ? dangerMuted
                  : successMuted,
                backgroundColor: activeRules?.enableRektSwap
                  ? "rgba(248, 113, 113, 0.05)"
                  : "rgba(52, 211, 153, 0.05)",
              },
            ]}
          >
            <Text
              style={[
                styles.presetText,
                {
                  color: activeRules?.enableRektSwap
                    ? dangerColor
                    : successColor,
                },
              ]}
            >
              {activeRules?.enableRektSwap
                ? "Disable RektSwap"
                : "Enable RektSwap"}
            </Text>
          </Pressable>
          <Pressable
            disabled={agentLoading}
            onPress={handleSubmit}
            style={[
              styles.actionButton,
              agentLoading && { backgroundColor: borderLight },
            ]}
          >
            <Text style={styles.actionButtonText}>
              {agentLoading ? "THINKING..." : "UPDATE RULES"}
            </Text>
          </Pressable>
        </View>

        {/* AI Agent Dialogue Box */}
        {agentResponse && (
          <View style={styles.agentBox}>
            <View style={styles.agentHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.agentPulseDot} />
                <Text style={styles.agentName}>🤖 COPILOT AGENT</Text>
              </View>
              <Text style={styles.agentTime}>
                {new Date(agentResponse.timestamp).toLocaleTimeString()}
              </Text>
            </View>
            <Text style={styles.agentText}>{agentResponse.response}</Text>
            <Text style={styles.agentPromptRef}>
              Prompt: "{agentResponse.prompt}"
            </Text>
          </View>
        )}

        <View style={styles.rulesContainer}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text style={styles.rulesHeader}>ACTIVE RULES</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{
                  color: textSecondary,
                  fontSize: 11,
                  marginRight: 8,
                  fontWeight: "500",
                }}
              >
                EXPERT MODE
              </Text>
              <Pressable
                style={[
                  styles.toggleSwitchSmall,
                  expertMode && styles.toggleSwitchActive,
                ]}
                onPress={() => {
                  // Reset guard so next activeRules push can sync the form fresh
                  isEditingForm.current = false;
                  setExpertMode(!expertMode);
                }}
              >
                <View
                  style={[
                    styles.toggleThumbSmall,
                    expertMode && styles.toggleThumbActiveSmall,
                  ]}
                />
              </Pressable>
            </View>
          </View>

          {expertMode ? (
            <View style={{ gap: 4 }}>
              {/* minSpreadPercent */}
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Min Spread %</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  style={styles.formInput}
                  value={minSpreadText}
                  onChangeText={(text) => {
                    isEditingForm.current = true;
                    setMinSpreadText(text);
                  }}
                />
              </View>
              {/* maxExposureUSD */}
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Max Exposure (USD)</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  style={styles.formInput}
                  value={maxExposureText}
                  onChangeText={(text) => {
                    isEditingForm.current = true;
                    setMaxExposureText(text);
                  }}
                />
              </View>
              {/* maxDailyLossUSD */}
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Max Daily Loss (USD)</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  style={styles.formInput}
                  value={maxDailyLossText}
                  onChangeText={(text) => {
                    isEditingForm.current = true;
                    setMaxDailyLossText(text);
                  }}
                />
              </View>
              {/* maxConsecutiveLosses */}
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Max Consecutive Losses</Text>
                <TextInput
                  keyboardType="number-pad"
                  style={styles.formInput}
                  value={maxConsecutiveText}
                  onChangeText={(text) => {
                    isEditingForm.current = true;
                    setMaxConsecutiveText(text);
                  }}
                />
              </View>
              {/* avoidHighVolatility */}
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Avoid High Volatility</Text>
                <Pressable
                  style={[
                    styles.toggleSwitch,
                    draftRules.avoidHighVolatility && styles.toggleSwitchActive,
                  ]}
                  onPress={() =>
                    setDraftRules((prev) => ({
                      ...prev,
                      avoidHighVolatility: !prev.avoidHighVolatility,
                    }))
                  }
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      draftRules.avoidHighVolatility &&
                      styles.toggleThumbActive,
                    ]}
                  />
                </Pressable>
              </View>
              {/* killSwitch */}
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>
                  Kill Switch (Emergency Stop)
                </Text>
                <Pressable
                  style={[
                    styles.toggleSwitch,
                    draftRules.killSwitch && styles.toggleSwitchDanger,
                  ]}
                  onPress={() =>
                    setDraftRules((prev) => ({
                      ...prev,
                      killSwitch: !prev.killSwitch,
                    }))
                  }
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      draftRules.killSwitch && styles.toggleThumbActive,
                    ]}
                  />
                </Pressable>
              </View>

              {/* exchangeBlacklist selector */}
              <View style={{ marginVertical: 12 }}>
                <Text
                  style={[
                    styles.formLabel,
                    { marginBottom: 10, fontSize: 12, color: textMuted },
                  ]}
                >
                  BLACKLISTED EXCHANGES (CLICK TO BLOCK)
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  {EXCHANGES.map((ex) => {
                    const isBlacklisted =
                      draftRules.exchangeBlacklist?.includes(ex);
                    return (
                      <Pressable
                        key={ex}
                        onPress={() => {
                          setDraftRules((prev) => {
                            const list = prev.exchangeBlacklist || [];
                            const newList = list.includes(ex)
                              ? list.filter((item) => item !== ex)
                              : [...list, ex];
                            return { ...prev, exchangeBlacklist: newList };
                          });
                        }}
                        style={[
                          styles.exchangePill,
                          isBlacklisted
                            ? styles.exchangePillBlacklisted
                            : styles.exchangePillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.exchangePillText,
                            isBlacklisted
                              ? styles.exchangePillTextBlacklisted
                              : styles.exchangePillTextActive,
                          ]}
                        >
                          {ex} {isBlacklisted ? "⛔" : "✓"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable
                disabled={rulesSubmitting}
                onPress={() => {
                  if (onUpdateRulesDirect && !rulesSubmitting) {
                    setRulesSubmitting(true);
                    const parsed = {
                      ...draftRules,
                      minSpreadPercent:
                        minSpreadText === "" ||
                          minSpreadText === "." ||
                          minSpreadText === "-"
                          ? 0
                          : parseFloat(minSpreadText),
                      maxExposureUSD:
                        maxExposureText === ""
                          ? 0
                          : parseFloat(maxExposureText),
                      maxDailyLossUSD:
                        maxDailyLossText === "" || maxDailyLossText === "-"
                          ? 0
                          : parseFloat(maxDailyLossText),
                      maxConsecutiveLosses:
                        maxConsecutiveText === ""
                          ? 0
                          : parseInt(maxConsecutiveText, 10),
                    };
                    onUpdateRulesDirect(parsed, () =>
                      setRulesSubmitting(false),
                    );
                  }
                }}
                style={[
                  styles.submitDirectButton,
                  rulesSubmitting && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.submitDirectText}>
                  {rulesSubmitting ? "APPLYING..." : "APPLY MANUAL CHANGES"}
                </Text>
              </Pressable>
            </View>
          ) : activeRules ? (
            Object.keys(activeRules).map((key) => (
              <View key={key} style={styles.ruleRow}>
                <Text style={styles.ruleKey}>{key}</Text>
                <Text style={styles.ruleValue}>
                  {JSON.stringify(activeRules[key])}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.ruleValue}>{"{}"}</Text>
          )}
        </View>
      </View>
    );
  },
);
StrategyPrompter.displayName = "StrategyPrompter";

const BROKER_URL =
  process.env.EXPO_PUBLIC_MQTT_URL || "wss://websocket.blankit.dpdns.org";
// Derive HTTP control endpoint from the WebSocket URL (same host, different protocol)
const BROKER_HTTP_URL = BROKER_URL.replace(/^wss:\/\//, "https://").replace(
  /^ws:\/\//,
  "http://",
);
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
  "RektSwap",
];

const OpportunityMathDepth = React.memo(
  ({ alerts, trades, selectedTradeId, onClearSelection }) => {
    const GlobalStyles = createGlobalStyles();
    // Determine which trade/alert to show
    const rawTrade = selectedTradeId
      ? trades.find((t) => t.id === selectedTradeId) || null
      : alerts.length > 0
        ? alerts[0]
        : null;

    // Extract exchange names early for reuse in risk score calculation
    const buyEx = rawTrade?.buyExchange || rawTrade?.from || null;
    const sellEx = rawTrade?.sellExchange || rawTrade?.to || null;

    // Normalize trade/alert fields for consistent display (handles both TRADE_EXECUTED and ARBITRAGE_ALERTS formats)
    const displayTrade = rawTrade
      ? {
        id: rawTrade.id,
        buyExchange: buyEx,
        sellExchange: sellEx,
        buyPrice:
          rawTrade.buyPrice ||
          rawTrade.price1 ||
          null,
        sellPrice:
          rawTrade.sellPrice ||
          rawTrade.price2 ||
          null,
        profitUSD:
          rawTrade.netProfitUSD ||
          rawTrade.profitUSD ||
          rawTrade.profit ||
          null,
        volume:
          rawTrade.volumeBTC || rawTrade.volume || rawTrade.size || null,
        status: rawTrade.status || rawTrade.state || "UNKNOWN",
        // Computed from exchanges if no server score
        riskScore:
          rawTrade.riskScore ||
          rawTrade.score ||
          (buyEx && sellEx ? deriveRiskScore(buyEx, sellEx) : 50),
        timestamp: rawTrade.timestamp,
      }
      : null;

    return (
      <View style={[styles.feedCard, { marginTop: 16 }]}>
        <View style={styles.sectionTitleRow}>
          <Text style={GlobalStyles.sectionHeader}>
            OPPORTUNITY DETAIL (MATH DEPTH)
          </Text>
          {selectedTradeId && (
            <Pressable
              onPress={onClearSelection}
              style={{
                backgroundColor: "rgba(201, 169, 98, 0.15)",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 2,
                borderWidth: 1,
                borderColor: accentColor,
              }}
            >
              <Text
                style={{
                  color: accentColor,
                  fontSize: 9,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                }}
              >
                SELECTED — TAP TO RELEASE
              </Text>
            </Pressable>
          )}
        </View>

        {!displayTrade ? (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedText}>WAITING FOR SPREAD</Text>
          </View>
        ) : (
          <View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text
                style={{ color: whiteColor, fontSize: 16, fontWeight: "600" }}
              >
                BTC/USD: {displayTrade.buyExchange}{" "}
                <Text style={{ color: textMuted }}>➔</Text>{" "}
                {displayTrade.sellExchange}
              </Text>
              <View
                style={{
                  backgroundColor: "rgba(74, 222, 128, 0.15)",
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 4,
                }}
              >
                <Text
                  style={{
                    color: successColor,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  EXECUTABLE
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 24 }}>
              <View style={{ flex: 1, gap: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: textSecondary, fontSize: 12 }}>
                    Buy Price ({displayTrade.buyExchange})
                  </Text>
                  <Text
                    style={{
                      color: textPrimary,
                      fontSize: 13,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  >
                    ${displayTrade.buyPrice?.toLocaleString()}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: textSecondary, fontSize: 12 }}>
                    Sell Price ({displayTrade.sellExchange})
                  </Text>
                  <Text
                    style={{
                      color: textPrimary,
                      fontSize: 13,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  >
                    ${displayTrade.sellPrice?.toLocaleString()}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    borderTopWidth: 1,
                    borderTopColor: borderColor,
                    paddingTop: 12,
                  }}
                >
                  <Text style={{ color: textSecondary, fontSize: 12 }}>
                    Spread
                  </Text>
                  <Text
                    style={{
                      color: infoColor,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {displayTrade.buyPrice > 0
                      ? (
                        ((displayTrade.sellPrice - displayTrade.buyPrice) /
                          displayTrade.buyPrice) *
                        100
                      ).toFixed(2)
                      : 0}
                    %
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: textSecondary, fontSize: 12 }}>
                    Est. Slippage
                  </Text>
                  <Text style={{ color: textPrimary, fontSize: 13 }}>
                    0.05%
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: textSecondary, fontSize: 12 }}>
                    Taker Fees (Both)
                  </Text>
                  <Text style={{ color: textPrimary, fontSize: 13 }}>
                    0.35%
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    borderTopWidth: 1,
                    borderTopColor: borderColor,
                    paddingTop: 12,
                  }}
                >
                  <Text
                    style={{
                      color: whiteColor,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    Net Profit %
                  </Text>
                  <Text
                    style={{
                      color: successColor,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    {(
                      (parseFloat(displayTrade.profitUSD) /
                        displayTrade.buyPrice) *
                      100
                    ).toFixed(2)}
                    %
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: textSecondary, fontSize: 12 }}>
                    Est. Profit (For $10,000)
                  </Text>
                  <Text
                    style={{
                      color: successColor,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    ${displayTrade.profitUSD?.toFixed(2)}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderLeftWidth: 1,
                  borderLeftColor: borderColor,
                  paddingLeft: 24,
                }}
              >
                <Text
                  style={{
                    color: textSecondary,
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  Risk-Adjusted Score
                </Text>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    borderWidth: 4,
                    borderColor: accentColor,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      color: whiteColor,
                      fontSize: 20,
                      fontWeight: "700",
                    }}
                  >
                    {displayTrade?.riskScore ?? "--"}
                  </Text>
                  <Text style={{ color: textMuted, fontSize: 10 }}>/100</Text>
                </View>
                <Text
                  style={{
                    color: textMuted,
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  Full transparency. Every component of the profit equation is
                  calculated.
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  },
);
OpportunityMathDepth.displayName = "OpportunityMathDepth";

export default function MainScreen() {
  const context = useContext(ContextModule);
  const GlobalStyles = createGlobalStyles();
  const router = useRouter();

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
  const [activeRules, setActiveRules] = useState(null);
  const [trades, setTrades] = useState([]);
  const [selectedTradeId, setSelectedTradeId] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [activeMqttClient, setActiveMqttClient] = useState(null);
  const [serverTime, setServerTime] = useState("--:--:--");
  const [agentResponse, setAgentResponse] = useState(null);
  const [agentLoading, setAgentLoading] = useState(false);
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

  // Clock timer
  useEffect(() => {
    const timer = setInterval(() => {
      setServerTime(new Date().toISOString().substring(11, 19) + " UTC");
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── Bootstrap: fetch static/slow-changing state via REST on mount ────────
  // Rules, fees, P&L history and wallets are loaded once via HTTP.
  // Only live streaming data (price ticks, alerts, trades) uses the WebSocket.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${BROKER_HTTP_URL}/api/snapshot`);
        if (!res.ok) return;
        const snap = await res.json();
        if (snap.rules) setActiveRules(snap.rules);
        if (snap.fees) setExchangeFees(snap.fees);
        if (snap.trades) setTrades(snap.trades);
        if (snap.pnl) setPnl(snap.pnl);
        remoteLog("Bootstrap snapshot loaded via REST", "INFO", "BOOT");
      } catch (e) {
        remoteLog(`Bootstrap fetch failed: ${e.message}`, "WARN", "BOOT");
      }
    };
    load();
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
        setActiveMqttClient(activeClient);
        // Subscribe only to live-streaming topics
        activeClient.subscribe(TOPIC);
        activeClient.subscribe("ARBITRAGE_ALERTS");
        activeClient.subscribe("TRADE_EXECUTED");
        activeClient.subscribe("PNL_UPDATE");
        activeClient.subscribe("RISK_AUDIT");
        activeClient.subscribe("ACTIVE_RULES"); // live rule-change notifications from backend
        activeClient.subscribe("AGENT_RESPONSE");
      });

      activeClient.on("message", (topic, message) => {
        try {
          let raw = message.toString();
          if (!raw || raw === "[object Object]") return;
          const data = JSON.parse(raw);
          if (!data || typeof data !== "object") return;

          // ── Fees message: removed — now loaded via REST /api/snapshot ──────

          // ── Live alerts & events ───────────────────────────────────────────
          if (topic === "ARBITRAGE_ALERTS") {
            setAlerts((prev) => {
              if (prev.some((item) => item.id === data.id)) return prev;
              return [data, ...prev].slice(0, 50);
            });
            return;
          }
          if (topic === "TRADE_EXECUTED") {
            setTrades((prev) => {
              if (prev.some((item) => item.id === data.id)) return prev;
              return [data, ...prev].slice(0, 100);
            });
            // Auto-update balance if trade was profitable
            const tradeProfit = parseFloat(
              data.netProfitUSD || data.profitUSD || data.profitTotalUSD || 0,
            );
            if (tradeProfit !== 0) {
              setPnl((prev) =>
                prev
                  ? {
                    ...prev,
                    totalBalanceUSD:
                      (prev.totalBalanceUSD || 0) + tradeProfit,
                  }
                  : { totalBalanceUSD: tradeProfit },
              );
            }
            return;
          }
          if (topic === "PNL_UPDATE") {
            setPnl(data);
            return;
          }
          if (topic === "RISK_AUDIT") {
            setAuditLog((prev) => {
              if (prev.some((item) => item.id === data.id)) return prev;
              return [data, ...prev].slice(0, 50);
            });
            return;
          }
          if (topic === "ACTIVE_RULES") {
            // Live server push when rules are changed from another client or AI agent
            setActiveRules(data);
            return;
          }
          if (topic === "AGENT_RESPONSE") {
            setAgentResponse(data);
            setAgentLoading(false);
            return;
          }

          // ── History message: fill chart with last 50 values ─────────────────
          if (topic && topic.endsWith("/history")) {
            remoteLog(
              `Received historical data payload on topic: ${topic}`,
              "INFO",
              "HISTORY",
            );
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
              remoteLog(
                `Applied ${uniquePoints.length} unique history chart points for ${selectedExchangeRef.current}`,
                "INFO",
                "HISTORY",
              );
            } else {
              remoteLog(
                `No chart points to render from history data`,
                "WARN",
                "HISTORY",
              );
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

      <View
        style={{
          height: 84,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 24,
          width: "100%",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* Back button */}
          <Pressable
            onPress={() => router.push("/(screens)/main")}
            style={{ marginRight: 24 }}
          >
            <ArrowLeft color={whiteColor} size={24} />
          </Pressable>

          {/* Logo & Brand block */}
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
                width: 48,
                height: 48,
                borderRadius: 10,
                marginRight: 16,
                marginTop: 0,
              }}
              resizeMode="contain"
            />
            <View style={{ justifyContent: "center" }}>
              <Text
                style={{
                  fontSize: 20,
                  color: whiteColor,
                  fontWeight: "700",
                  letterSpacing: -0.2,
                  marginBottom: 2,
                  lineHeight: 24,
                }}
              >
                QuantCopilot
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: "#A1A1AA",
                  letterSpacing: 0,
                  textTransform: "none",
                  lineHeight: 14,
                }}
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

          <Text
            style={{
              color: whiteColor,
              fontSize: 20,
              fontWeight: "600",
              marginRight: 12,
            }}
          >
            BTC/USD Ticker
          </Text>
          <View
            style={{
              backgroundColor: "rgba(74, 222, 128, 0.15)",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4,
            }}
          >
            <Text
              style={{
                color: successColor,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1,
              }}
            >
              LIVE
            </Text>
          </View>
        </View>

        {/* Right Stats Group */}
        <View style={{ flexDirection: "row", gap: 32 }}>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                color: textMuted,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              System
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                marginTop: 2,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: successColor,
                  marginRight: 6,
                  shadowColor: successColor,
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                }}
              />
              <Text
                style={{ color: successColor, fontSize: 12, fontWeight: "600" }}
              >
                Operational
              </Text>
            </View>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                color: textMuted,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Latency
            </Text>
            <Text
              style={{
                color: successColor,
                fontSize: 13,
                fontWeight: "600",
                marginTop: 2,
              }}
            >
              78 ms
            </Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                color: textMuted,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Feed Status
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                marginTop: 2,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: isConnected ? successColor : dangerColor,
                  marginRight: 6,
                  shadowColor: isConnected ? successColor : dangerColor,
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                }}
              />
              <Text
                style={{
                  color: isConnected ? successColor : dangerColor,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </Text>
            </View>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                color: textMuted,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Server Time
            </Text>
            <Text
              style={{
                color: whiteColor,
                fontSize: 13,
                fontWeight: "600",
                marginTop: 2,
              }}
            >
              {serverTime}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                color: textMuted,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Account Balance
            </Text>
            <Text
              style={{
                color: whiteColor,
                fontSize: 13,
                fontWeight: "600",
                marginTop: 2,
              }}
            >
              {typeof pnl?.totalBalanceUSD === "number"
                ? pnl.totalBalanceUSD.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
                : "loading..."}{" "}
              USDT
            </Text>
          </View>
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
              {truePrice > 0
                ? `$${truePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "---"}
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
              {selectedSpread > 0
                ? `$${parseFloat(selectedSpread.toFixed(4))}`
                : "---"}
            </Text>
          </View>
        </View>

        <PnLBar pnl={pnl} />

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
            <StrategyPrompter
              activeRules={activeRules}
              agentResponse={agentResponse}
              agentLoading={agentLoading}
              onSetStrategy={(prompt) => {
                if (activeMqttClient) {
                  setAgentLoading(true);
                  activeMqttClient.publish(
                    "SET_STRATEGY",
                    JSON.stringify({ prompt }),
                  );
                }
              }}
              onUpdateRulesDirect={async (rules, onComplete) => {
                // ── Strip undefined values before any dispatch ──
                // Prevents fields never touched by the user (e.g. enableRektSwap: undefined
                // from the server snapshot) from accidentally overwriting server state.
                const clean = Object.fromEntries(
                  Object.entries(rules).filter(([, v]) => v !== undefined),
                );
                setActiveRules(clean); // Optimistic update — no undefined can leak
                try {
                  const res = await fetch(`${BROKER_HTTP_URL}/api/rules`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(clean),
                  });
                  if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                  }
                  const result = await res.json();
                  if (result.rules) {
                    // Ensure the confirmed state also has no undefined leaking back
                    const confirmed = Object.fromEntries(
                      Object.entries(result.rules).filter(
                        ([, v]) => v !== undefined,
                      ),
                    );
                    setActiveRules(confirmed);
                  }
                  console.log(
                    "[RULES] Server confirmed update:",
                    JSON.stringify(result.rules),
                  );
                } catch (e) {
                  console.warn(
                    "[RULES] HTTP POST failed, falling back to MQTT:",
                    e.message,
                  );
                  if (activeMqttClient) {
                    activeMqttClient.publish(
                      "UPDATE_RULES",
                      JSON.stringify(clean),
                    );
                  }
                } finally {
                  // Release the loading state regardless of outcome
                  if (onComplete) onComplete();
                }
              }}
            />
            <OpportunityMathDepth
              alerts={alerts}
              trades={trades}
              selectedTradeId={selectedTradeId}
              onClearSelection={() => setSelectedTradeId(null)}
            />
            <TradeLog
              trades={trades}
              selectedTradeId={selectedTradeId}
              onSelectTrade={setSelectedTradeId}
            />
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
                    <Text style={[styles.priceValText, { color: dangerColor }]}>
                      {askVal > 0 ? askVal.toFixed(1) : "---"}
                    </Text>
                    <Text
                      style={[
                        styles.priceValText,
                        {
                          color:
                            spreadVal > 5
                              ? dangerColor
                              : spreadVal < 1
                                ? successColor
                                : warningColor,
                        },
                      ]}
                    >
                      {spreadVal > 0 ? parseFloat(spreadVal.toFixed(4)) : "---"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Selected Exchange Fee Panel */}
            {exchangeFees && exchangeFees[selectedExchange] && (
              <View style={styles.feePanel}>
                <Text style={styles.feeTitle}>
                  {selectedExchange} Fee Matrix
                </Text>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Taker Fee:</Text>
                  <Text style={styles.feeValue}>
                    {(exchangeFees[selectedExchange].taker * 100).toFixed(2)}%
                  </Text>
                  <Text style={[styles.feeLabel, { marginLeft: 16 }]}>
                    Withdrawal:
                  </Text>
                  <Text style={styles.feeValue}>
                    {exchangeFees[selectedExchange].withdrawalBTC} BTC
                  </Text>
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
                          style={[styles.priceValText, { color: dangerColor }]}
                        >
                          {(tick.ask ?? 0).toFixed(1)}
                        </Text>
                        <Text
                          style={[
                            styles.priceValText,
                            {
                              color:
                                (tick.spread ?? 0) > 5
                                  ? dangerColor
                                  : (tick.spread ?? 0) < 1
                                    ? successColor
                                    : warningColor,
                            },
                          ]}
                        >
                          {parseFloat((tick.spread ?? 0).toFixed(4))}
                        </Text>
                      </View>
                    );
                  })}
              </ScrollView>
            </View>
            <RiskAuditConsole auditLog={auditLog} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  brandText: {
    color: whiteColor,
    fontWeight: "600",
    fontSize: 22,
    letterSpacing: 1.5,
  },
  subBrandText: {
    color: textMuted,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 2,
    textTransform: "uppercase",
  },
  statusWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: borderColor,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 2,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    marginRight: 7,
  },
  statusText: {
    color: whiteColor,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  // ─── Stats Bar: Tight, dense, layered surface ───────────────────────────────
  statsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: elevatedColor,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
    marginTop: 16,
  },
  statColumn: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 4,
  },
  statMainVal: {
    color: whiteColor,
    fontWeight: "600",
    fontSize: 18,
    marginTop: 2,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  layoutGrid: {
    flexDirection: "column",
    marginTop: 28,
  },
  layoutGridRow: {
    flexDirection: "row",
  },
  leftColumn: {
    marginBottom: 32,
  },
  rightColumn: {
    marginBottom: 32,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  monoLabel: {
    color: successColor,
    fontSize: 11,
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
    letterSpacing: 1,
    fontWeight: "500",
  },
  // ─── Sharp-corner cards: 2px radius max ───────────────────────────────────
  chartCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 2,
    overflow: "hidden",
  },
  chartPlaceholder: {
    height: 300,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: textMuted,
    fontSize: 14,
  },
  tableCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 2,
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
    borderBottomColor: borderLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: elevatedColor,
  },
  tableHeaderCell: {
    color: textMuted,
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
    alignItems: "center",
  },
  selectedRow: {
    backgroundColor: elevatedColor,
  },
  exchangeName: {
    color: whiteColor,
    fontWeight: "500",
    fontSize: 15,
  },
  rowSelectorDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: accentColor,
    marginRight: 8,
  },
  priceValText: {
    color: whiteColor,
    fontWeight: "500",
    fontSize: 14,
    flex: 1,
    textAlign: "right",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: textMuted,
    fontSize: 12,
  },
  // ─── Feed cards: subtle surfaces ───────────────────────────────────────────
  feedCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 20,
    padding: 14,
  },
  emptyFeed: {
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: borderColor,
    borderRadius: 2,
  },
  emptyFeedText: {
    color: textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
  },
  emptyFeedSubtext: {
    color: textMuted,
    fontSize: 11,
    marginTop: 4,
    opacity: 0.6,
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
  },
  alertItem: {
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
    paddingVertical: 10,
  },
  alertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  alertId: {
    color: textSecondary,
    fontSize: 12,
    fontWeight: "500",
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
  },
  alertTime: {
    color: textMuted,
    fontSize: 11,
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
  },
  alertRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  // ─── Sharp-corner badges (2px) or pill only ──────────────────────────────
  routeBadgeBuy: {
    backgroundColor: "rgba(74, 222, 128, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.2)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 2,
  },
  routeBadgeSell: {
    backgroundColor: "rgba(248, 113, 113, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.2)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 2,
  },
  routeBadgeText: {
    color: whiteColor,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  routeArrow: {
    color: textMuted,
    marginHorizontal: 6,
    fontSize: 12,
  },
  alertDataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  alertDataLabel: {
    color: textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  alertDataVal: {
    color: textPrimary,
    fontSize: 13,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  alertProfitText: {
    color: successColor,
    fontWeight: "600",
  },
  feePanel: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 2,
    padding: 14,
    marginTop: 14,
  },
  feeTitle: {
    color: textSecondary,
    fontSize: 12,
    fontWeight: "600",
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
    color: textMuted,
    fontSize: 12,
    marginRight: 4,
  },
  feeValue: {
    color: whiteColor,
    fontSize: 13,
    fontWeight: "500",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  progressBarBg: {
    width: 40,
    height: 4,
    backgroundColor: borderLight,
    marginLeft: 8,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
  },
  // ─── Prompter Styles ────────────────────────────────────────────────────────
  prompterInput: {
    backgroundColor: elevatedColor,
    color: whiteColor,
    padding: 12,
    borderRadius: 4,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    minHeight: 60,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: borderColor,
  },
  presetsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  presetPill: {
    backgroundColor: elevatedColor,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: borderLight,
  },
  presetText: {
    color: textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  actionButton: {
    backgroundColor: accentColor,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: "auto",
  },
  actionButtonText: {
    color: backgroundColor,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  agentBox: {
    backgroundColor: elevatedColor,
    padding: 12,
    borderRadius: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: borderColor,
    borderLeftWidth: 3,
    borderLeftColor: accentColor,
  },
  agentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  agentPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: accentColor,
    marginRight: 6,
  },
  agentName: {
    color: accentColor,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  agentTime: {
    color: textMuted,
    fontSize: 11,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  agentText: {
    color: textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  agentPromptRef: {
    color: textMuted,
    fontSize: 11,
    marginTop: 8,
    textAlign: "right",
    fontStyle: "italic",
  },
  rulesContainer: {
    backgroundColor: elevatedColor,
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: borderLight,
  },
  rulesHeader: {
    color: successColor,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  ruleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
  },
  ruleKey: {
    color: textSecondary,
    fontSize: 13,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  ruleValue: {
    color: whiteColor,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  reasonBadge: {
    backgroundColor: warningMuted,
    borderWidth: 1,
    borderColor: warningColor,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  reasonBadgeText: {
    color: warningColor,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  toggleSwitchSmall: {
    width: 28,
    height: 16,
    borderRadius: 8,
    backgroundColor: borderLight,
    padding: 2,
    justifyContent: "center",
  },
  toggleThumbSmall: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: whiteColor,
  },
  toggleThumbActiveSmall: {
    transform: [{ translateX: 12 }],
  },
  toggleSwitch: {
    width: 38,
    height: 20,
    borderRadius: 10,
    backgroundColor: borderLight,
    padding: 2,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: whiteColor,
  },
  toggleThumbActive: {
    transform: [{ translateX: 18 }],
  },
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
  },
  formLabel: {
    color: textSecondary,
    fontSize: 13,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  formInput: {
    backgroundColor: backgroundColor,
    borderWidth: 1,
    borderColor: borderLight,
    borderRadius: 2,
    color: whiteColor,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 13,
    minWidth: 100,
    textAlign: "right",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  exchangePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  exchangePillActive: {
    backgroundColor: elevatedColor,
    borderColor: borderLight,
  },
  exchangePillBlacklisted: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: dangerColor,
  },
  exchangePillText: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  exchangePillTextActive: {
    color: textSecondary,
  },
  exchangePillTextBlacklisted: {
    color: dangerColor,
  },
  submitDirectButton: {
    backgroundColor: accentColor,
    paddingVertical: 10,
    borderRadius: 2,
    alignItems: "center",
    marginTop: 16,
  },
  submitDirectText: {
    color: backgroundColor,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
