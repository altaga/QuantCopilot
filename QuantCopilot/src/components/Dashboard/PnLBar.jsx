
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createGlobalStyles } from '../../../core/styles';

const dangerColor = "#f87171";
const successColor = "#4ade80";
const warningColor = "#facc15";
const whiteColor = "#FFFFFF";
const elevatedColor = "#161618";
const borderColor = "#27272A";
const borderLight = "#3F3F46";

// barra de ganancias. memoizada para que no brinque a 60fps
export const PnLBar = React.memo(({ pnl }) => {
  const GlobalStyles = createGlobalStyles();
  if (!pnl) return null;
  const isDailyProfitable = pnl.dailyPnL >= 0;
  const isTotalProfitable = pnl.totalNetUSD >= 0;

  return (
    <View style={[styles.statsBar, { marginTop: 16 }]}>
      <View style={styles.statColumn}>
        <Text style={GlobalStyles.labelSmall}>Total P&L</Text>
        <Text style={[styles.statMainVal, { color: isTotalProfitable ? successColor : dangerColor }]}>
          {isTotalProfitable ? "▲" : "▼"} ${Math.abs(pnl.totalNetUSD || 0).toFixed(2)}
        </Text>
      </View>
      <View style={styles.statColumn}>
        <Text style={GlobalStyles.labelSmall}>Win Rate</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
          <Text style={[styles.statMainVal, { marginTop: 0 }]}>
            {pnl.winRatePercent?.toFixed(1) || "0"}%
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${pnl.winRatePercent || 0}%`,
                  backgroundColor: pnl.winRatePercent >= 50 ? successColor : warningColor,
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
        <Text style={[styles.statMainVal, { color: isDailyProfitable ? successColor : dangerColor }]}>
          {isDailyProfitable ? "▲" : "▼"} ${Math.abs(pnl.dailyPnL || 0).toFixed(2)}
        </Text>
      </View>
    </View>
  );
});

PnLBar.displayName = "PnLBar";

const styles = StyleSheet.create({
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
    fontFamily: "monospace",
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
});
