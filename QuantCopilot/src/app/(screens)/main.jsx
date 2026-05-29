import React, { useEffect, useState, useRef, useContext } from 'react';
import { 
  Text, 
  View, 
  ScrollView, 
  SafeAreaView, 
  StatusBar, 
  Platform, 
  Pressable, 
  StyleSheet, 
  Dimensions 
} from 'react-native';
import mqtt from 'mqtt/dist/mqtt';
import { createGlobalStyles, backgroundColor, accentColor, borderColor, cardColor, textSecondary } from '../../core/styles';
import ContextModule from '../../providers/contextModule';

const BROKER_URL = process.env.EXPO_PUBLIC_MQTT_URL || 'wss://websocket.blankit.dpdns.org';
const TOPIC = 'market/btc/ticker';

export default function MainScreen() {
  const context = useContext(ContextModule);
  const GlobalStyles = createGlobalStyles();

  const [isConnected, setIsConnected] = useState(false);
  const [marketData, setMarketData] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [latency, setLatency] = useState(0);
  const [selectedExchange, setSelectedExchange] = useState(context?.value?.selectedExchange || "Binance");
  const [token, setToken] = useState(null);

  // Chart refs
  const chartContainerRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const chartRef = useRef(null);

  // Update global context value when exchange changes
  const handleSelectExchange = (exchange) => {
    setSelectedExchange(exchange);
    if (context && context.setValue) {
      context.setValue({ selectedExchange: exchange });
    }
  };

  // Initialize Lightweight Charts (Web Only)
  useEffect(() => {
    if (Platform.OS === 'web' && chartContainerRef.current) {
      try {
        const { createChart } = require('lightweight-charts');
        
        const chart = createChart(chartContainerRef.current, {
          layout: { 
            background: { type: 'solid', color: backgroundColor }, 
            textColor: '#8E8E93',
            fontSize: 11,
          },
          grid: { 
            vertLines: { color: '#1F1F22' }, 
            horzLines: { color: '#1F1F22' } 
          },
          timeScale: { 
            timeVisible: true, 
            secondsVisible: true,
            borderVisible: false,
          },
          rightPriceScale: {
            borderVisible: false,
            alignLabels: true,
          },
          height: 320,
        });

        const lineSeries = chart.addLineSeries({
          color: accentColor, 
          lineWidth: 2,
          priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
          },
        });

        lineSeriesRef.current = lineSeries;
        chartRef.current = chart;

        // Make chart responsive
        const handleResize = () => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth
            });
          }
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          chart.remove();
        };
      } catch (err) {
        console.warn("Failed to initialize TradingView Chart:", err);
      }
    }
  }, []);

  // Fetch dynamic JWT token from API route
  useEffect(() => {
    const loadToken = async () => {
      try {
        let tokenUrl = '/api/secure/token';
        if (Platform.OS !== 'web') {
          tokenUrl = 'http://localhost:8081/api/secure/token';
        }
        const response = await fetch(tokenUrl);
        const data = await response.json();
        if (data.token) {
          setToken(data.token);
        } else if (process.env.EXPO_PUBLIC_MQTT_JWT) {
          setToken(process.env.EXPO_PUBLIC_MQTT_JWT);
        }
      } catch (err) {
        console.warn("Failed to fetch dynamic JWT token, using fallback:", err);
        if (process.env.EXPO_PUBLIC_MQTT_JWT) {
          setToken(process.env.EXPO_PUBLIC_MQTT_JWT);
        }
      }
    };
    loadToken();
  }, []);

  // Sync chart data when selected exchange changes
  useEffect(() => {
    if (lineSeriesRef.current) {
      // Reset series data to avoid line jump artifacts
      lineSeriesRef.current.setData([]);
    }
  }, [selectedExchange]);

  // Establish MQTT connection
  useEffect(() => {
    if (!token) return;

    let client = null;
    try {
      client = mqtt.connect(BROKER_URL, {
        username: 'ccm_id',
        password: token,
        protocol: 'wss'
      });

      client.on('connect', () => {
        setIsConnected(true);
        client.subscribe(TOPIC);
      });

      client.on('message', (topic, message) => {
        try {
          const startTime = Date.now();
          const envelope = JSON.parse(message.toString());
          let payload = envelope.payload ? (typeof envelope.payload === 'string' ? JSON.parse(envelope.payload) : envelope.payload) : envelope;
          const data = payload.data || payload;

          setMarketData(data);
          setLastUpdate(new Date().toLocaleTimeString());
          setLatency(Date.now() - startTime);

          // Update chart line points with selected exchange price
          if (data[selectedExchange] && data[selectedExchange].ask && lineSeriesRef.current) {
            const currentTime = Math.floor(Date.now() / 1000);
            lineSeriesRef.current.update({
              time: currentTime,
              value: parseFloat(data[selectedExchange].ask)
            });
          }
        } catch (_e) {
          // Parse error
        }
      });

      client.on('error', () => {
        setIsConnected(false);
      });

      client.on('close', () => {
        setIsConnected(false);
      });

    } catch (err) {
      console.warn("MQTT Connection Error:", err);
    }

    return () => {
      if (client) client.end();
    };
  }, [selectedExchange, token]);

  // Get active price metrics for header highlight
  const activeExchangeData = marketData[selectedExchange] || {};
  const activeBid = activeExchangeData.bid ? parseFloat(activeExchangeData.bid) : 0;
  const activeAsk = activeExchangeData.ask ? parseFloat(activeExchangeData.ask) : 0;
  const activeSpread = activeAsk - activeBid;

  const isLargeScreen = Platform.OS === 'web' && Dimensions.get('window').width > 768;

  return (
    <SafeAreaView style={GlobalStyles.container}>
      <StatusBar barStyle="light-content" />

      {/* ─── Premium Header ─── */}
      <View style={GlobalStyles.header}>
        <View>
          <Text style={styles.brandText}>QUANTCOPILOT</Text>
          <Text style={styles.subBrandText}>REAL-TIME ORDERBOOK FEED</Text>
        </View>
        <View style={styles.statusWrapper}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#34d399' : '#f87171' }]} />
          <Text style={styles.statusText}>{isConnected ? 'LIVE FEED ACTIVE' : 'DISCONNECTED'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ─── Global Stats Bar ─── */}
        <View style={styles.statsBar}>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Active Asset</Text>
            <Text style={styles.statMainVal}>BTC / USD</Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Chart Focus</Text>
            <Text style={[styles.statMainVal, { color: accentColor }]}>{selectedExchange.toUpperCase()}</Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Market Ask Price</Text>
            <Text style={styles.statMainVal}>${activeAsk > 0 ? activeAsk.toLocaleString() : '---'}</Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Exchange Spread</Text>
            <Text style={styles.statMainVal}>${activeSpread > 0 ? activeSpread.toFixed(1) : '---'}</Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={GlobalStyles.labelSmall}>Feed Latency</Text>
            <Text style={styles.statMainVal}>{latency}ms</Text>
          </View>
        </View>

        {/* ─── Responsive Layout Grid ─── */}
        <View style={[styles.layoutGrid, isLargeScreen && styles.layoutGridRow]}>
          
          {/* Left Column - Charting */}
          <View style={[styles.leftColumn, isLargeScreen && { flex: 2, marginRight: 24 }]}>
            <View style={styles.sectionTitleRow}>
              <Text style={GlobalStyles.sectionHeader}>Institutional Price Index</Text>
              <Text style={styles.monoLabel}>TICK-BY-TICK FEED</Text>
            </View>

            <View style={styles.chartCard}>
              {Platform.OS === 'web' ? (
                <div ref={chartContainerRef} style={{ width: '100%', minHeight: '320px' }} />
              ) : (
                <View style={styles.mobileChartPlaceholder}>
                  <Text style={GlobalStyles.bodyText}>
                    Interactive chart is optimized for Web.
                  </Text>
                  <Text style={[GlobalStyles.bodyText, { fontSize: 13, marginTop: 8 }]}>
                    Selected Exchange: {selectedExchange} (Ask: ${activeAsk})
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Right Column - Exchange Table Grid */}
          <View style={[styles.rightColumn, isLargeScreen && { flex: 1 }]}>
            <View style={styles.sectionTitleRow}>
              <Text style={GlobalStyles.sectionHeader}>Exchange Spread Monitor</Text>
              <Text style={styles.monoLabel}>UPDATED: {lastUpdate || 'WAITING'}</Text>
            </View>

            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Exchange</Text>
                <Text style={styles.tableHeaderCell}>Bid</Text>
                <Text style={styles.tableHeaderCell}>Ask</Text>
                <Text style={styles.tableHeaderCell}>Spread</Text>
              </View>

              {Object.entries(marketData).length > 0 ? (
                Object.entries(marketData).map(([exchange, data]) => {
                  const bidVal = data.bid ? parseFloat(data.bid) : 0;
                  const askVal = data.ask ? parseFloat(data.ask) : 0;
                  const spreadVal = askVal - bidVal;
                  const isSelected = selectedExchange === exchange;

                  return (
                    <Pressable 
                      key={exchange} 
                      onPress={() => handleSelectExchange(exchange)}
                      style={[styles.tableRow, isSelected && styles.selectedRow]}
                    >
                      <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center' }}>
                        {isSelected && <View style={styles.rowSelectorDot} />}
                        <Text style={[styles.exchangeName, isSelected && { color: accentColor }]}>
                          {exchange}
                        </Text>
                      </View>
                      <Text style={styles.priceValText}>
                        {bidVal > 0 ? bidVal.toFixed(1) : '---'}
                      </Text>
                      <Text style={[styles.priceValText, { color: '#f87171' }]}>
                        {askVal > 0 ? askVal.toFixed(1) : '---'}
                      </Text>
                      <Text style={[styles.priceValText, { color: accentColor }]}>
                        {spreadVal > 0 ? spreadVal.toFixed(1) : '---'}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Orchestrating market channels...</Text>
                </View>
              )}
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
    color: '#FFFFFF',
    fontWeight: '800',
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
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
    marginTop: 4,
  },
  layoutGrid: {
    flexDirection: 'column',
  },
  layoutGridRow: {
    flexDirection: 'row',
  },
  leftColumn: {
    marginBottom: 24,
  },
  rightColumn: {
    marginBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  monoLabel: {
    color: textSecondary,
    fontSize: 9,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'System',
    letterSpacing: 1.2,
  },
  chartCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    padding: 16,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableCard: {
    backgroundColor: cardColor,
    borderWidth: 1,
    borderColor: borderColor,
    borderRadius: 4,
    overflow: 'hidden',
  },
  mobileChartPlaceholder: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0F0F11',
  },
  tableHeaderCell: {
    color: textSecondary,
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#161619',
    alignItems: 'center',
  },
  selectedRow: {
    backgroundColor: '#161619',
  },
  exchangeName: {
    color: '#FFFFFF',
    fontWeight: '600',
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
    color: '#34d399',
    fontWeight: '600',
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'System',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: textSecondary,
    fontSize: 13,
  },
});
