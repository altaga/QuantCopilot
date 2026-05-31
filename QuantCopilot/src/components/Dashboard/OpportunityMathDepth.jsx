
import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { createGlobalStyles } from '../../../core/styles';

const accentColor = "#D4AF37";
const dangerColor = "#f87171";
const successColor = "#4ade80";
const infoColor = "#38bdf8";
const textMuted = "#A1A1AA";
const textSecondary = "#D4D4D8";
const textPrimary = "#F4F4F5";
const whiteColor = "#FFFFFF";
const cardColor = "#09090B";
const borderColor = "#27272A";

// calculo duro de riesgo y rentabilidad. extraido para no renderizar lo demas
export const OpportunityMathDepth = React.memo(
  ({ alerts, trades, selectedTradeId, onClearSelection, exchangeFees }) => {
    const GlobalStyles = createGlobalStyles();
    const rawTrade = selectedTradeId ? trades.find((t) => t.id === selectedTradeId) || null : alerts.length > 0 ? alerts[0] : null;
    const buyEx = rawTrade?.buyExchange || rawTrade?.from || null;
    const sellEx = rawTrade?.sellExchange || rawTrade?.to || null;

    const displayTrade = rawTrade ? {
        id: rawTrade.id,
        buyExchange: buyEx,
        sellExchange: sellEx,
        buyPrice: rawTrade.buyPrice || rawTrade.price1 || null,
        sellPrice: rawTrade.sellPrice || rawTrade.price2 || null,
        profitUSD: rawTrade.netProfitUSD || rawTrade.profitUSD || rawTrade.profit || null,
        volume: rawTrade.volumeBTC || rawTrade.volume || rawTrade.size || null,
        status: rawTrade.status || rawTrade.state || "UNKNOWN",
        riskScore: rawTrade.riskScore || rawTrade.score || null,
        timestamp: rawTrade.timestamp,
    } : null;

    return (
      <View style={[styles.feedCard, { marginTop: 16 }]}>
        <View style={styles.sectionTitleRow}>
          <Text style={GlobalStyles.sectionHeader}>OPPORTUNITY DETAIL (MATH DEPTH)</Text>
          {selectedTradeId && (
            <Pressable onPress={onClearSelection} style={styles.clearSelectionBtn}>
              <Text style={styles.clearSelectionText}>SELECTED — TAP TO RELEASE</Text>
            </Pressable>
          )}
        </View>

        {!displayTrade ? (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedText}>WAITING FOR SPREAD</Text>
          </View>
        ) : (
          <View>
            <View style={styles.tradeHeader}>
              <Text style={styles.tradeTitle}>
                BTC/USD: {displayTrade.buyExchange} <Text style={{ color: textMuted }}>➔</Text> {displayTrade.sellExchange}
              </Text>
              <View style={styles.executableBadge}>
                <Text style={styles.executableText}>EXECUTABLE</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 24 }}>
              <View style={{ flex: 1, gap: 12 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowLabel}>Buy Price ({displayTrade.buyExchange})</Text>
                  <Text style={styles.rowValue}>${displayTrade.buyPrice?.toLocaleString()}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowLabel}>Sell Price ({displayTrade.sellExchange})</Text>
                  <Text style={styles.rowValue}>${displayTrade.sellPrice?.toLocaleString()}</Text>
                </View>
                <View style={[styles.rowBetween, styles.borderTop]}>
                  <Text style={styles.rowLabel}>Spread</Text>
                  <Text style={[styles.rowValue, { color: infoColor, fontWeight: "600" }]}>
                    {displayTrade.buyPrice > 0 ? (((displayTrade.sellPrice - displayTrade.buyPrice) / displayTrade.buyPrice) * 100).toFixed(2) : 0}%
                  </Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowLabel}>Est. Slippage</Text>
                  <Text style={styles.rowValue}>{((Math.max(2.5, displayTrade.buyPrice * (displayTrade.volume || 1) * 0.0001) / (displayTrade.buyPrice * (displayTrade.volume || 1))) * 100).toFixed(2)}%</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowLabel}>Taker Fees (Both)</Text>
                  <Text style={styles.rowValue}>{(((exchangeFees?.[displayTrade.buyExchange?.toLowerCase()]?.taker || 0.002) + (exchangeFees?.[displayTrade.sellExchange?.toLowerCase()]?.taker || 0.002)) * 100).toFixed(2)}%</Text>
                </View>
                <View style={[styles.rowBetween, styles.borderTop]}>
                  <Text style={styles.profitLabel}>Net Profit %</Text>
                  <Text style={styles.profitValue}>
                    {((parseFloat(displayTrade.profitUSD || 0) / ((displayTrade.buyPrice || 1) * (displayTrade.volume || 1))) * 100).toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowLabel}>Est. Net Profit (Total Volume)</Text>
                  <Text style={styles.profitAmount}>${displayTrade.profitUSD?.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.riskContainer}>
                <Text style={styles.riskLabel}>Risk-Adjusted Score</Text>
                <View style={styles.riskCircle}>
                  <Text style={styles.riskScore}>{displayTrade?.riskScore ?? "--"}</Text>
                  <Text style={styles.riskMax}>/100</Text>
                </View>
                <Text style={styles.riskDesc}>Full transparency. Every component of the profit equation is calculated.</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }
);
OpportunityMathDepth.displayName = "OpportunityMathDepth";

const styles = StyleSheet.create({
  feedCard: { backgroundColor: cardColor, borderWidth: 1, borderColor: borderColor, borderRadius: 2, overflow: "hidden", marginTop: 20, padding: 14 },
  sectionTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10, paddingHorizontal: 2 },
  clearSelectionBtn: { backgroundColor: "rgba(201, 169, 98, 0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, borderWidth: 1, borderColor: accentColor },
  clearSelectionText: { color: accentColor, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  emptyFeed: { height: 120, justifyContent: "center", alignItems: "center", borderWidth: 1, borderStyle: "dashed", borderColor: borderColor, borderRadius: 2 },
  emptyFeedText: { color: textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 1, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  tradeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  tradeTitle: { color: whiteColor, fontSize: 16, fontWeight: "600" },
  executableBadge: { backgroundColor: "rgba(74, 222, 128, 0.15)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 },
  executableText: { color: successColor, fontSize: 11, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: textSecondary, fontSize: 12 },
  rowValue: { color: textPrimary, fontSize: 13, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  borderTop: { borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 12 },
  profitLabel: { color: whiteColor, fontSize: 14, fontWeight: "600" },
  profitValue: { color: successColor, fontSize: 16, fontWeight: "700" },
  profitAmount: { color: successColor, fontSize: 14, fontWeight: "600" },
  riskContainer: { flex: 1, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: borderColor, paddingLeft: 24 },
  riskLabel: { color: textSecondary, fontSize: 13, marginBottom: 16 },
  riskCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: accentColor, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  riskScore: { color: whiteColor, fontSize: 20, fontWeight: "700" },
  riskMax: { color: textMuted, fontSize: 10 },
  riskDesc: { color: textMuted, fontSize: 11, textAlign: "center" }
});
