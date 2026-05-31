
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { createGlobalStyles } from '../../../core/styles';

const accentColor = "#D4AF37";
const dangerColor = "#f87171";
const successColor = "#4ade80";
const textMuted = "#A1A1AA";
const textSecondary = "#D4D4D8";
const textPrimary = "#F4F4F5";
const whiteColor = "#FFFFFF";
const cardColor = "#09090B";
const borderColor = "#27272A";

// historial de trades ejecutados. ojo con el virtual scroll si crece mucho
export const TradeLog = React.memo(({ trades, selectedTradeId, onSelectTrade }) => {
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

TradeLog.displayName = "TradeLog";

const styles = StyleSheet.create({
  feedCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 20,
    padding: 14,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  monoLabel: {
    fontSize: 11,
    fontFamily: "monospace",
    letterSpacing: 1,
    fontWeight: "500",
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
    fontFamily: "monospace",
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
    fontFamily: "monospace",
  },
  alertTime: {
    color: textMuted,
    fontSize: 11,
    fontFamily: "monospace",
  },
  alertRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
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
    fontFamily: "monospace",
  },
});
