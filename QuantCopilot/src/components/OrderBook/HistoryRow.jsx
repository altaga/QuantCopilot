
import React from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';

const dangerColor = "#f87171";
const successColor = "#4ade80";
const warningColor = "#facc15";
const whiteColor = "#FFFFFF";
const borderColor = "#27272A";

export const HistoryRow = React.memo(({ tick }) => {
  if (!tick || !tick.ts) return null;
  const ts = new Date(tick.ts).toLocaleTimeString() || "--";
  return (
    <View style={[styles.tableRow, Platform.OS === 'web' && { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }]}>
      <Text style={styles.priceValText}>{ts}</Text>
      <Text style={styles.priceValText}>{(tick.bid ?? 0).toFixed(1)}</Text>
      <Text style={[styles.priceValText, { color: dangerColor }]}>{(tick.ask ?? 0).toFixed(1)}</Text>
      <Text
        style={[
          styles.priceValText,
          { color: (tick.spread ?? 0) > 5 ? dangerColor : (tick.spread ?? 0) < 1 ? successColor : warningColor },
        ]}
      >
        {parseFloat((tick.spread ?? 0).toFixed(4))}
      </Text>
    </View>
  );
}, (prevProps, nextProps) => {
  return prevProps.tick?.ts === nextProps.tick?.ts;
});

HistoryRow.displayName = "HistoryRow";

const styles = StyleSheet.create({
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
    alignItems: "center",
  },
  priceValText: {
    color: whiteColor,
    fontWeight: "500",
    fontSize: 14,
    flex: 1,
    textAlign: "right",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  }
});
