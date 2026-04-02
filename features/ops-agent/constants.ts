/**
 * Ops Agent constants — initial messages, spacing, theme palettes, fonts.
 */
import { Platform } from "react-native";
import type { Message, OpsRef } from "./types";

export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const INITIAL_MESSAGES: Message[] = [
  {
    role: "system",
    content:
      "Operational Grid Online. You can add entities (e.g. 'Add a client', 'Add a vehicle', 'Create a trip') or ask about your data—e.g. 'What's my revenue?', 'How many vehicles?', 'Give me a report' (report is shown in a card and can be downloaded as PDF).",
  },
];

export const REF_DARK: OpsRef = {
  bg: "#000000",
  surface: "#1C1C1E",
  surface2: "#2C2C2E",
  surface3: "#363636",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  text2: "#B0B0B0",
  text3: "#8E8E93",
  textOnAccent: "#FFFFFF",
  accent: "#2196F3",
  accentSoft: "rgba(33,150,243,0.15)",
  green: "#4CAF50",
  greenSoft: "rgba(76,175,80,0.15)",
  amber: "#F59E0B",
  amberSoft: "rgba(245,158,11,0.12)",
  red: "#F44336",
  userBubble: "#2C2C2E",
  botBubble: "#1C1C1E",
  cardBg: "#1C1C1E",
  cardBorder: "rgba(255,255,255,0.08)",
  inputBg: "#1C1C1E",
  imagePlaceholderOverlay: "rgba(0,0,0,0.3)",
  contactCardBg: "rgba(255,255,255,0.12)",
  contactCardBorder: "rgba(255,255,255,0.2)",
  editInputBg: "rgba(0,0,0,0.15)",
  editInputBorder: "rgba(255,255,255,0.25)",
  surfaceOverlay: "rgba(255,255,255,0.1)",
  surfaceOverlayText: "rgba(255,255,255,0.9)",
  surfaceOverlayMuted: "rgba(255,255,255,0.7)",
  radiusSm: 8,
  radius: 14,
  radiusLg: 18,
  radiusXl: 22,
  shadow:
    Platform.OS === "ios"
      ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 4 }
      : { elevation: 3 },
  shadowSm:
    Platform.OS === "ios"
      ? { shadowColor: "#000", shadowOffset: { width: 0, height: 0.5 }, shadowOpacity: 0.15, shadowRadius: 2 }
      : { elevation: 2 },
};

export const REF_LIGHT: OpsRef = {
  bg: "#FFFFFF",
  surface: "#F5F5F7",
  surface2: "#E8E8ED",
  surface3: "#D1D1D6",
  border: "rgba(0,0,0,0.08)",
  border2: "rgba(0,0,0,0.12)",
  text: "#1C1C1E",
  text2: "#3A3A3C",
  text3: "#8E8E93",
  textOnAccent: "#FFFFFF",
  accent: "#2196F3",
  accentSoft: "rgba(33,150,243,0.12)",
  green: "#34C759",
  greenSoft: "rgba(52,199,89,0.12)",
  amber: "#FF9500",
  amberSoft: "rgba(255,149,0,0.12)",
  red: "#FF3B30",
  userBubble: "#E8E8ED",
  botBubble: "#F5F5F7",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(0,0,0,0.08)",
  inputBg: "#F5F5F7",
  imagePlaceholderOverlay: "rgba(0,0,0,0.06)",
  contactCardBg: "rgba(0,0,0,0.05)",
  contactCardBorder: "rgba(0,0,0,0.12)",
  editInputBg: "#F5F5F7",
  editInputBorder: "rgba(0,0,0,0.2)",
  surfaceOverlay: "rgba(0,0,0,0.06)",
  surfaceOverlayText: "#1C1C1E",
  surfaceOverlayMuted: "#6C6C70",
  radiusSm: 8,
  radius: 14,
  radiusLg: 18,
  radiusXl: 22,
  shadow:
    Platform.OS === "ios"
      ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }
      : { elevation: 2 },
  shadowSm:
    Platform.OS === "ios"
      ? { shadowColor: "#000", shadowOffset: { width: 0, height: 0.5 }, shadowOpacity: 0.06, shadowRadius: 2 }
      : { elevation: 1 },
};

/** Plus Jakarta Sans — creative, friendly, contrasts with app system font. Used only in Ops Agent. */
export const FONT = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semiBold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
} as const;
