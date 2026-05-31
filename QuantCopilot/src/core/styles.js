
import { Dimensions, StatusBar, StyleSheet, Platform } from "react-native";

export const screenHeight = Dimensions.get("screen").height;
export const windowHeight = Dimensions.get("window").height;

// ─── Refined Dark Palette ──────────────────────────────────────────────────
// Warm off-white surface, not cold gray
export const backgroundColor = "#0C0C0E"; // Carbon Black
// Subtle layered elevation — not floating cards
export const cardColor = "#111113"; // Near-black with warmth
export const elevatedColor = "#18181B"; // Slightly lighter for nested content
export const accentColor = "#C9A962"; // Muted Gold — not saturated
export const accentMuted = "#8B7355"; // Muted bronze for secondary accents
export const whiteColor = "#F4F4F5"; // Warm off-white
export const textPrimary = "#E4E4E7"; // Primary text
// Graphite neutrals instead of cool gray
export const textSecondary = "#71717A"; // Zinc-500 equivalent
export const textMuted = "#52525B"; // Zinc-600 equivalent
export const borderColor = "#27272A"; // Zinc-800 — subtle separation
export const borderLight = "#3F3F46"; // Zinc-700 — slightly visible
export const successColor = "#4ADE80"; // Soft green
export const dangerColor = "#F87171"; // Muted red
export const dangerMuted = "rgba(248, 113, 113, 0.15)";
export const warningColor = "#FBBF24"; // Muted amber
export const warningMuted = "rgba(251, 191, 36, 0.15)";
export const infoColor = "#60A5FA"; // Cobalt blue
export const infoMuted = "rgba(96, 165, 250, 0.15)";
export const successMuted = "rgba(74, 222, 128, 0.15)";

export const headerHeight = 84;
export const footerHeight = 64;
export const ratio =
  Dimensions.get("window").height / Dimensions.get("window").width;
export const mainHeight =
  Dimensions.get("window").height -
  (headerHeight +
    footerHeight +
    (ratio > 1.7 ? 0 : (StatusBar.currentHeight ?? 0)));
export const StatusBarHeight = StatusBar.currentHeight ?? 0;

export const createGlobalStyles = ({ normalize = (val) => val } = {}) => {
  const baseText = {
    color: textPrimary,
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "sans-serif",
    }),
  };
  const baseBoldText = {
    ...baseText,
    fontWeight: "600", // Swiss-style: not overly bold, confident
  };
  const monoText = {
    ...baseText,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  };

  return StyleSheet.create({
    // ─── Core Layout ──────────────────────────────────────────────────────────
    container: {
      flex: 1,
      backgroundColor,
    },
    header: {
      height: normalize(headerHeight),
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: normalize(20),
      borderBottomWidth: 1,
      borderBottomColor: borderColor,
    },
    main: {
      flex: 1,
      width: "100%",
    },
    footer: {
      width: "100%",
      height: normalize(footerHeight),
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: borderColor,
    },
    // ─── Typography (Swiss Premium) ──────────────────────────────────────────
    heroTitle: {
      ...baseBoldText,
      fontSize: normalize(32),
      letterSpacing: -0.5,
      color: whiteColor,
    },
    sectionHeader: {
      ...baseBoldText,
      fontSize: normalize(13),
      color: textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "500",
    },
    bodyText: {
      ...baseText,
      fontSize: normalize(16),
      color: textSecondary,
      lineHeight: normalize(22),
    },
    labelSmall: {
      ...baseText,
      fontSize: normalize(12),
      color: textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      fontWeight: "500",
    },
    // ─── Semantic Colors ──────────────────────────────────────────────────────
    textAccent: { color: accentColor },
    textWhite: { color: whiteColor },
    textMuted: { color: textMuted },
    textSuccess: { color: successColor },
    textDanger: { color: dangerColor },
    textInfo: { color: infoColor },
    mono: monoText,
  });
};
