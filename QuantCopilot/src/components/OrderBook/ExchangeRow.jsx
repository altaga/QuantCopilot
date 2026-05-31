
import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';

const accentColor = "#D4AF37";
const dangerColor = "#f87171";
const successColor = "#4ade80";
const warningColor = "#facc15";
const whiteColor = "#FFFFFF";
const elevatedColor = "#161618";
const borderColor = "#27272A";

// fila de exchange usando css grid para evitar layout shifts
export const ExchangeRow = React.memo(({ exchange, marketData, isSelected, onSelect }) => {
  const exData = marketData || {};
  const bidVal = exData.bid ? parseFloat(exData.bid) : 0;
  const askVal = exData.ask ? parseFloat(exData.ask) : 0;
  const spreadVal = askVal - bidVal;

  return (
    <Pressable
      onPress={() => onSelect(exchange)}
      style={[
        styles.tableRow,
        isSelected && styles.selectedRow,
        Platform.OS === 'web' && { display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr' }
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {isSelected && <View style={styles.rowSelectorDot} />}
        <Text style={[styles.exchangeName, isSelected && { color: accentColor }]}>
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
          { color: spreadVal > 5 ? dangerColor : spreadVal < 1 ? successColor : warningColor },
        ]}
      >
        {spreadVal > 0 ? parseFloat(spreadVal.toFixed(4)) : "---"}
      </Text>
    </Pressable>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.marketData?.bid === nextProps.marketData?.bid &&
    prevProps.marketData?.ask === nextProps.marketData?.ask
  );
});

ExchangeRow.displayName = "ExchangeRow";

const styles = StyleSheet.create({
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
  rowSelectorDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: accentColor,
    marginRight: 8,
  },
  exchangeName: {
    color: whiteColor,
    fontWeight: "500",
    fontSize: 15,
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
