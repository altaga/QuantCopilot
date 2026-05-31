
import React from 'react';
import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import { createGlobalStyles } from '../../../core/styles';

const dangerColor = "#f87171";
const dangerMuted = "rgba(248, 113, 113, 0.15)";
const warningColor = "#facc15";
const warningMuted = "rgba(250, 204, 21, 0.15)";
const textMuted = "#A1A1AA";
const textSecondary = "#D4D4D8";
const cardColor = "#09090B";
const elevatedColor = "#161618";
const borderColor = "#27272A";

// log de auditoria de riesgos. aca saltan los killswitches
export const RiskAuditConsole = React.memo(({ auditLog }) => {
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

RiskAuditConsole.displayName = "RiskAuditConsole";

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
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
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
    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
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
});
