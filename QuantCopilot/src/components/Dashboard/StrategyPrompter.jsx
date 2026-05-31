
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Platform, StyleSheet } from 'react-native';
import { createGlobalStyles } from '../../../core/styles';

const accentColor = "#D4AF37";
const dangerColor = "#f87171";
const dangerMuted = "rgba(248, 113, 113, 0.15)";
const successColor = "#4ade80";
const successMuted = "rgba(52, 211, 153, 0.15)";
const warningColor = "#facc15";
const warningMuted = "rgba(250, 204, 21, 0.15)";
const textMuted = "#A1A1AA";
const textSecondary = "#D4D4D8";
const textPrimary = "#F4F4F5";
const whiteColor = "#FFFFFF";
const backgroundColor = "#0F0F11";
const cardColor = "#09090B";
const elevatedColor = "#161618";
const borderColor = "#27272A";
const borderLight = "#3F3F46";

const EXCHANGES = [
  "Binance", "Kraken", "Coinbase", "OKX", "Bitfinex", 
  "Bybit", "Gateio", "Gemini", "Bitstamp", "Kucoin", "RektSwap"
];

export const StrategyPrompter = React.memo(
  ({ activeRules, onSetStrategy, agentResponse, agentLoading, onUpdateRulesDirect }) => {
    const GlobalStyles = createGlobalStyles();
    // definimos estado local para la ui
    const [prompt, setPrompt] = useState("");
    // definimos estado local para la ui
    const [expertMode, setExpertMode] = useState(false);
    // definimos estado local para la ui
    const [draftRules, setDraftRules] = useState({});
    // definimos estado local para la ui
    const [rulesSubmitting, setRulesSubmitting] = useState(false);

    // definimos estado local para la ui
    const [minSpreadText, setMinSpreadText] = useState("");
    // definimos estado local para la ui
    const [maxExposureText, setMaxExposureText] = useState("");
    // definimos estado local para la ui
    const [maxDailyLossText, setMaxDailyLossText] = useState("");
    // definimos estado local para la ui
    const [maxConsecutiveText, setMaxConsecutiveText] = useState("");

    const isEditingForm = useRef(false);

    // disparamos el effect al montar o cambiar dependencias
    useEffect(() => {
      if (activeRules) {
        const rules = { ...activeRules, exchangeBlacklist: activeRules.exchangeBlacklist || [] };
        if (!isEditingForm.current) {
          setDraftRules(rules);
          setMinSpreadText(activeRules.minSpreadPercent !== undefined ? String(activeRules.minSpreadPercent) : "");
          setMaxExposureText(activeRules.maxExposureUSD !== undefined ? String(activeRules.maxExposureUSD) : "");
          setMaxDailyLossText(activeRules.maxDailyLossUSD !== undefined ? String(activeRules.maxDailyLossUSD) : "");
          setMaxConsecutiveText(activeRules.maxConsecutiveLosses !== undefined ? String(activeRules.maxConsecutiveLosses) : "");
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={GlobalStyles.sectionHeader}>AI Strategy Console</Text>
            {activeRules?.killSwitch && (
              <View style={{ backgroundColor: "rgba(248, 113, 113, 0.1)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderColor: "rgba(248, 113, 113, 0.4)", borderWidth: 1 }}>
                <Text style={{ color: "#F87171", fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>SYS HALTED</Text>
              </View>
            )}
          </View>
          <Text style={[styles.monoLabel, { color: "#C9A962" }]}>NLP / BEDROCK</Text>
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
          <Pressable disabled={agentLoading} onPress={() => setPrompt("Check our current win rate and P&L. If we are profitable, make active rules more aggressive by setting min spread to 0.1%. Otherwise, set min spread to 0.4%")} style={styles.presetPill}>
            <Text style={styles.presetText}>Check Status & Adjust</Text>
          </Pressable>
          <Pressable disabled={agentLoading} onPress={() => setPrompt("Tighten rules: set minSpreadPercent to 0.5% and maxExposureUSD to 100")} style={styles.presetPill}>
            <Text style={styles.presetText}>Conservative Guard</Text>
          </Pressable>
          
          <Pressable
            disabled={agentLoading}
            onPress={() => {
              if (onUpdateRulesDirect) {
                const current = activeRules || {};
                onUpdateRulesDirect({ ...current, killSwitch: !current.killSwitch });
              }
            }}
            style={[
              styles.presetPill,
              {
                borderColor: activeRules?.killSwitch ? "rgba(52, 211, 153, 0.3)" : "rgba(248, 113, 113, 0.3)",
                backgroundColor: activeRules?.killSwitch ? "rgba(52, 211, 153, 0.05)" : "rgba(248, 113, 113, 0.05)",
              },
            ]}
          >
            <Text style={[styles.presetText, { color: activeRules?.killSwitch ? "#34D399" : "#F87171" }]}>
              {activeRules?.killSwitch ? "Resume Trading" : "Kill Switch"}
            </Text>
          </Pressable>

          <Pressable
            disabled={agentLoading}
            onPress={() => {
              if (onUpdateRulesDirect) {
                const current = activeRules || {};
                onUpdateRulesDirect({ ...current, enableRektSwap: !current.enableRektSwap });
              }
            }}
            style={[
              styles.presetPill,
              {
                borderColor: activeRules?.enableRektSwap ? dangerMuted : successMuted,
                backgroundColor: activeRules?.enableRektSwap ? "rgba(248, 113, 113, 0.05)" : "rgba(52, 211, 153, 0.05)",
              },
            ]}
          >
            <Text style={[styles.presetText, { color: activeRules?.enableRektSwap ? dangerColor : successColor }]}>
              {activeRules?.enableRektSwap ? "Disable RektSwap" : "Enable RektSwap"}
            </Text>
          </Pressable>

          <Pressable disabled={agentLoading} onPress={handleSubmit} style={[styles.actionButton, agentLoading && { backgroundColor: borderLight }]}>
            <Text style={styles.actionButtonText}>{agentLoading ? "THINKING..." : "UPDATE RULES"}</Text>
          </Pressable>
        </View>

        {agentResponse && (
          <View style={styles.agentBox}>
            <View style={styles.agentHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.agentPulseDot} />
                <Text style={styles.agentName}>🤖 COPILOT AGENT</Text>
              </View>
              <Text style={styles.agentTime}>{new Date(agentResponse.timestamp).toLocaleTimeString()}</Text>
            </View>
            <Text style={styles.agentText}>{agentResponse.response}</Text>
            <Text style={styles.agentPromptRef}>Prompt: "{agentResponse.prompt}"</Text>
          </View>
        )}

        <View style={styles.rulesContainer}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={styles.rulesHeader}>ACTIVE RULES</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ color: textSecondary, fontSize: 11, marginRight: 8, fontWeight: "500" }}>EXPERT MODE</Text>
              <Pressable style={[styles.toggleSwitchSmall, expertMode && styles.toggleSwitchActive]} onPress={() => { isEditingForm.current = false; setExpertMode(!expertMode); }}>
                <View style={[styles.toggleThumbSmall, expertMode && styles.toggleThumbActiveSmall]} />
              </Pressable>
            </View>
          </View>

          {expertMode ? (
            <View style={{ gap: 4 }}>
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Min Spread %</Text>
                <TextInput keyboardType="decimal-pad" style={styles.formInput} value={minSpreadText} onChangeText={(t) => { isEditingForm.current = true; setMinSpreadText(t); }} />
              </View>
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Max Exposure (USD)</Text>
                <TextInput keyboardType="decimal-pad" style={styles.formInput} value={maxExposureText} onChangeText={(t) => { isEditingForm.current = true; setMaxExposureText(t); }} />
              </View>
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Max Daily Loss (USD)</Text>
                <TextInput keyboardType="decimal-pad" style={styles.formInput} value={maxDailyLossText} onChangeText={(t) => { isEditingForm.current = true; setMaxDailyLossText(t); }} />
              </View>
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Max Consecutive Losses</Text>
                <TextInput keyboardType="number-pad" style={styles.formInput} value={maxConsecutiveText} onChangeText={(t) => { isEditingForm.current = true; setMaxConsecutiveText(t); }} />
              </View>

              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Avoid High Volatility</Text>
                <Pressable style={[styles.toggleSwitch, draftRules.avoidHighVolatility && styles.toggleSwitchActive]} onPress={() => setDraftRules(p => ({ ...p, avoidHighVolatility: !p.avoidHighVolatility }))}>
                  <View style={[styles.toggleThumb, draftRules.avoidHighVolatility && styles.toggleThumbActive]} />
                </Pressable>
              </View>
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Kill Switch (Emergency Stop)</Text>
                <Pressable style={[styles.toggleSwitch, draftRules.killSwitch && styles.toggleSwitchDanger]} onPress={() => setDraftRules(p => ({ ...p, killSwitch: !p.killSwitch }))}>
                  <View style={[styles.toggleThumb, draftRules.killSwitch && styles.toggleThumbActive]} />
                </Pressable>
              </View>

              <View style={{ marginVertical: 12 }}>
                <Text style={[styles.formLabel, { marginBottom: 10, fontSize: 12, color: textMuted }]}>BLACKLISTED EXCHANGES (CLICK TO BLOCK)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {EXCHANGES.map((ex) => {
                    const isBlacklisted = draftRules.exchangeBlacklist?.includes(ex);
                    return (
                      <Pressable key={ex} onPress={() => { setDraftRules(p => ({ ...p, exchangeBlacklist: isBlacklisted ? p.exchangeBlacklist.filter(i => i !== ex) : [...(p.exchangeBlacklist || []), ex] })); }} style={[styles.exchangePill, isBlacklisted ? styles.exchangePillBlacklisted : styles.exchangePillActive]}>
                        <Text style={[styles.exchangePillText, isBlacklisted ? styles.exchangePillTextBlacklisted : styles.exchangePillTextActive]}>{ex} {isBlacklisted ? "⛔" : "✓"}</Text>
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
                      minSpreadPercent: minSpreadText === "" || minSpreadText === "." || minSpreadText === "-" ? 0 : parseFloat(minSpreadText),
                      maxExposureUSD: maxExposureText === "" ? 0 : parseFloat(maxExposureText),
                      maxDailyLossUSD: maxDailyLossText === "" || maxDailyLossText === "-" ? 0 : parseFloat(maxDailyLossText),
                      maxConsecutiveLosses: maxConsecutiveText === "" ? 0 : parseInt(maxConsecutiveText, 10),
                    };
                    onUpdateRulesDirect(parsed, () => setRulesSubmitting(false));
                  }
                }}
                style={[styles.submitDirectButton, rulesSubmitting && { opacity: 0.6 }]}
              >
                <Text style={styles.submitDirectText}>{rulesSubmitting ? "APPLYING..." : "APPLY MANUAL CHANGES"}</Text>
              </Pressable>
            </View>
          ) : activeRules ? (
            Object.keys(activeRules).map((key) => (
              <View key={key} style={styles.ruleRow}>
                <Text style={styles.ruleKey}>{key}</Text>
                <Text style={styles.ruleValue}>{JSON.stringify(activeRules[key])}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.ruleValue}>{"{}"}</Text>
          )}
        </View>
      </View>
    );
  }
);
StrategyPrompter.displayName = "StrategyPrompter";

const styles = StyleSheet.create({
  feedCard: { backgroundColor: cardColor, borderWidth: 1, borderColor: borderColor, borderRadius: 2, overflow: "hidden", marginTop: 20, padding: 14 },
  sectionTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10, paddingHorizontal: 2 },
  monoLabel: { fontSize: 11, fontFamily: Platform.OS === "web" ? "monospace" : "Courier", letterSpacing: 1, fontWeight: "500" },
  prompterInput: { backgroundColor: elevatedColor, color: whiteColor, padding: 12, borderRadius: 4, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", minHeight: 60, marginBottom: 12, borderWidth: 1, borderColor: borderColor },
  presetsRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" },
  presetPill: { backgroundColor: elevatedColor, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: borderLight },
  presetText: { color: textSecondary, fontSize: 13, fontWeight: "500" },
  actionButton: { backgroundColor: accentColor, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, marginLeft: "auto" },
  actionButtonText: { color: backgroundColor, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  agentBox: { backgroundColor: elevatedColor, padding: 12, borderRadius: 4, marginBottom: 12, borderWidth: 1, borderColor: borderColor, borderLeftWidth: 3, borderLeftColor: accentColor },
  agentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  agentPulseDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: accentColor, marginRight: 6 },
  agentName: { color: accentColor, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  agentTime: { color: textMuted, fontSize: 11, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  agentText: { color: textPrimary, fontSize: 14, lineHeight: 20 },
  agentPromptRef: { color: textMuted, fontSize: 11, marginTop: 8, textAlign: "right", fontStyle: "italic" },
  rulesContainer: { backgroundColor: elevatedColor, padding: 12, borderRadius: 4, borderWidth: 1, borderColor: borderLight },
  rulesHeader: { color: successColor, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  ruleRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: borderColor },
  ruleKey: { color: textSecondary, fontSize: 13, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  ruleValue: { color: whiteColor, fontSize: 13, fontWeight: "600", fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  toggleSwitchSmall: { width: 28, height: 16, borderRadius: 8, backgroundColor: borderLight, padding: 2, justifyContent: "center" },
  toggleThumbSmall: { width: 12, height: 12, borderRadius: 6, backgroundColor: whiteColor },
  toggleThumbActiveSmall: { transform: [{ translateX: 12 }] },
  toggleSwitch: { width: 38, height: 20, borderRadius: 10, backgroundColor: borderLight, padding: 2, justifyContent: "center" },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: whiteColor },
  toggleThumbActive: { transform: [{ translateX: 18 }] },
  toggleSwitchActive: { backgroundColor: successColor },
  toggleSwitchDanger: { backgroundColor: dangerColor },
  formRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: borderColor },
  formLabel: { color: textSecondary, fontSize: 13, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  formInput: { backgroundColor: backgroundColor, borderWidth: 1, borderColor: borderLight, borderRadius: 2, color: whiteColor, paddingHorizontal: 8, paddingVertical: 2, fontSize: 13, minWidth: 100, textAlign: "right", fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  exchangePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 2, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  exchangePillActive: { backgroundColor: elevatedColor, borderColor: borderLight },
  exchangePillBlacklisted: { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: dangerColor },
  exchangePillText: { fontSize: 11, fontWeight: "600", fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  exchangePillTextActive: { color: textSecondary },
  exchangePillTextBlacklisted: { color: dangerColor },
  submitDirectButton: { backgroundColor: accentColor, paddingVertical: 10, borderRadius: 2, alignItems: "center", marginTop: 16 },
  submitDirectText: { color: backgroundColor, fontSize: 13, fontWeight: "800", letterSpacing: 1 }
});
