/**
 * Filter/tab chrome shared with Chat (`ChatScreen` list header).
 * Use for Finance cash toolbar, Trips filters, etc.
 */
import { StyleSheet } from "react-native";

export const CHAT_FILTER_MUTED = "#64748b";
export const CHAT_FILTER_TRAY_BG = "#f1f5f9";
export const CHAT_FILTER_TRAY_BORDER = "#e8ecf1";
export const CHAT_FILTER_ACTIVE_BG = "#0f172a";

export const chatFilterChromeStyles = StyleSheet.create({
  toolbarStack: {
    width: "100%",
    minWidth: 0,
    gap: 6,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 18,
    backgroundColor: CHAT_FILTER_TRAY_BG,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
  },
  tabPill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
    backgroundColor: "#ffffff",
    minHeight: 34,
  },
  tabPillActive: {
    borderColor: CHAT_FILTER_ACTIVE_BG,
    backgroundColor: CHAT_FILTER_ACTIVE_BG,
    shadowColor: CHAT_FILTER_ACTIVE_BG,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tabPillLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: CHAT_FILTER_MUTED,
    letterSpacing: 0.55,
    textTransform: "uppercase",
    textAlign: "center",
  },
  tabPillLabelActive: {
    color: "#ffffff",
  },
  searchScopeStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  searchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: "#334155",
    fontWeight: "500",
    paddingVertical: 0,
  },
  scopeSegment: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 5,
    flexShrink: 0,
  },
  scopePill: {
    minWidth: 58,
    maxWidth: 84,
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  scopePillActive: {
    backgroundColor: CHAT_FILTER_ACTIVE_BG,
    borderColor: CHAT_FILTER_ACTIVE_BG,
  },
  scopePillText: {
    fontSize: 8,
    fontWeight: "600",
    color: CHAT_FILTER_MUTED,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  scopePillTextActive: {
    color: "#ffffff",
  },
});
