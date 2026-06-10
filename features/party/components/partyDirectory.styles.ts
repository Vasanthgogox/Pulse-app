/**
 * Party directory — Metronic Teams grid + Details tab chrome (purple).
 */
import Layout from "@/constants/Layout";
import {
  HUB_PURPLE,
  HUB_PURPLE_BORDER,
  HUB_PURPLE_DEEP,
  HUB_PURPLE_TINT,
  HUB_PURPLE_VIVID,
  METRONIC,
} from "@/components/profile/workspaceHubMenu.styles";
import { Platform, StyleSheet } from "react-native";

export { HUB_PURPLE, METRONIC };

export const PARTY_GRID_COLUMNS = 2;
export const PARTY_GRID_COLUMNS_DESKTOP = 4;

const CARD_SHADOW = Platform.select({
  web: {
    boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.06)" as unknown as undefined,
  },
  default: {
    shadowColor: "#4C577D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
});

export const partyDirectoryStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: METRONIC.bodyBg,
  },

  // Compact page chrome (no profile hero)
  pageChrome: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginBottom: 4,
    paddingVertical: 2,
  },
  backText: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: HUB_PURPLE_VIVID,
    textTransform: "uppercase",
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.35,
  },
  pageSub: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.muted,
    lineHeight: 17,
    maxWidth: 480,
  },

  // Metronic underline tabs
  tabBarWrap: {
    backgroundColor: METRONIC.heroBg,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  tabBarScroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  tabBarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    minHeight: 44,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    position: "relative",
    minWidth: 88,
    alignItems: "center",
  },
  tabItemActive: {},
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.muted,
  },
  tabLabelActive: {
    color: HUB_PURPLE_DEEP,
    fontWeight: "700",
  },
  tabCount: {
    fontSize: 9,
    fontWeight: "600",
    color: METRONIC.muted,
    marginTop: 2,
  },
  tabUnderline: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: HUB_PURPLE_VIVID,
  },

  // Card-style tab strip (Metronic segmented — mobile-friendly)
  tabCardStrip: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
    paddingVertical: 8,
    paddingHorizontal: 6,
    ...CARD_SHADOW,
  },
  tabCardRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    paddingHorizontal: 2,
  },
  tabCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
    minWidth: 120,
    position: "relative",
  },
  tabCardActive: {
    borderColor: HUB_PURPLE_BORDER,
    backgroundColor: HUB_PURPLE_TINT,
  },
  tabCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: METRONIC.bodyBg,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCardIconWrapActive: {
    backgroundColor: "rgba(124, 58, 237, 0.12)",
  },
  tabCardTextCol: { flex: 1, minWidth: 0, gap: 1 },
  tabCardLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.text,
  },
  tabCardLabelActive: {
    color: HUB_PURPLE_DEEP,
    fontWeight: "700",
  },
  tabCardCount: {
    fontSize: 9,
    fontWeight: "600",
    color: METRONIC.muted,
  },
  tabCardDot: {
    position: "absolute",
    bottom: 4,
    alignSelf: "center",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: HUB_PURPLE_VIVID,
  },

  // Section toolbar (Teams “9 Teams” row)
  sectionToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionToolbarLeft: { flex: 1, minWidth: 0, gap: 2 },
  sectionToolbarTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.2,
  },
  sectionToolbarSub: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
    lineHeight: 15,
  },
  countBadge: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: HUB_PURPLE_TINT,
    borderWidth: 1,
    borderColor: HUB_PURPLE_BORDER,
    alignItems: "center",
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: HUB_PURPLE_DEEP,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: METRONIC.text,
    padding: 0,
    minWidth: 0,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  grid: { gap: 12 },
  gridRow: {
    flexDirection: "row",
    gap: 12,
  },
  gridCell: {
    flex: 1,
    minWidth: 0,
  },

  emptyCard: {
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
    alignItems: "center",
    gap: 8,
    ...CARD_SHADOW,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: METRONIC.text,
  },
  emptyBody: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.muted,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 320,
  },

  // Party card (Metronic Teams grid)
  partyCard: {
    position: "relative",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    ...CARD_SHADOW,
  },
  partyCardPressed: {
    opacity: 0.92,
    borderColor: HUB_PURPLE_BORDER,
  },
  partyEntityBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: METRONIC.muted,
    textTransform: "uppercase",
  },
  partyAvatarHalo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: HUB_PURPLE_TINT,
    borderWidth: 1,
    borderColor: HUB_PURPLE_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  partyName: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.text,
    textAlign: "center",
    letterSpacing: -0.15,
    lineHeight: 18,
    maxWidth: "100%",
    marginBottom: 8,
  },
  partySectionsWrap: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: METRONIC.border,
    paddingTop: 6,
    gap: 0,
  },
  partyMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    borderStyle: "dashed",
  },
  partyMetaRowLast: {
    borderBottomWidth: 0,
  },
  partyMetaLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  partyMetaValue: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: METRONIC.subtle,
    textAlign: "right",
    minWidth: 0,
  },
  partyViewBtn: {
    marginTop: 10,
    width: "100%",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.bodyBg,
    alignItems: "center",
  },
  partyViewBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: HUB_PURPLE_DEEP,
  },
});
