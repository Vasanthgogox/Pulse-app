import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { StyleSheet } from "react-native";

const GUTTER = Layout.screenPaddingHorizontal;

export const clientFinanceAnalyticsStyles = StyleSheet.create({
  bodyDesktop: {
    backgroundColor: METRONIC.bodyBg,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 16,
    borderBottomWidth: 0,
  },
  pageIntro: {
    marginBottom: 4,
    gap: 4,
  },
  pageIntroDesktop: {
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
  },
  pageIntroCompact: {
    marginBottom: 0,
    paddingHorizontal: GUTTER,
    paddingTop: 4,
    paddingBottom: 8,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.3,
  },
  pageTitleCompact: {
    fontSize: 16,
  },
  pageSub: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  pageSubCompact: {
    fontSize: 10,
    letterSpacing: 0.35,
    textTransform: "none",
    fontWeight: "500",
  },
  mobileStack: {
    width: "100%",
    gap: 10,
    paddingBottom: 8,
  },
  mobileSection: {
    paddingHorizontal: GUTTER,
    gap: 8,
  },
  mobileFilterScroll: {
    paddingHorizontal: GUTTER,
    gap: 8,
    paddingBottom: 2,
  },
  mobileFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    marginRight: 8,
  },
  mobileFilterChipOn: {
    borderColor: METRONIC.link,
    backgroundColor: "#EEF6FF",
  },
  mobileFilterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  mobileFilterChipTextOn: {
    color: METRONIC.link,
    fontWeight: "700",
  },
  mobileClearBtn: {
    alignSelf: "flex-start",
    marginLeft: GUTTER,
    marginTop: -2,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  mobileClearBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.link,
  },
  kpiGridMobile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  kpiCardMobile: {
    width: "48%",
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 0,
  },
  kpiCardMobileWide: {
    width: "100%",
    flexBasis: "100%",
  },
  kpiLabelMobile: {
    color: Theme.textMuted,
  },
  kpiSubMobile: {
    color: Theme.textSecondary,
  },
  chartStackMobile: {
    gap: 8,
    width: "100%",
  },
  chartCardMobile: {
    width: "100%",
    minWidth: 0,
  },
  healthStackMobile: {
    gap: 8,
    width: "100%",
  },
  healthCardMobile: {
    width: "100%",
  },
  carousel: {
    paddingHorizontal: GUTTER,
    gap: 10,
    paddingVertical: 2,
  },
  carouselCard: {
    width: 280,
    minHeight: 196,
  },
  carouselCardInner: {
    flex: 1,
    minHeight: 196,
  },
  tripsSectionMobile: {
    paddingHorizontal: GUTTER,
    gap: 8,
  },
  tripsListMobile: {
    gap: 8,
  },
  tripsSearchMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  tripsSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    color: METRONIC.text,
    padding: 0,
  },
  sectionCardMobile: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 4,
  },
  desktopMainCol: {
    gap: 14,
    minWidth: 0,
    flex: 1,
  },
  desktopSidebar: {
    gap: 12,
  },
  healthBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F3E8FF",
    borderWidth: 1,
    borderColor: "#E9D5FF",
  },
  healthBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B21A8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  healthHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  healthScore: {
    fontSize: 28,
    fontWeight: "800",
    color: Theme.warning,
    letterSpacing: -0.5,
  },
  healthScoreCompact: {
    fontSize: 32,
    lineHeight: 36,
  },
  healthScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 4,
    flexWrap: "wrap",
  },
  healthScoreMax: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  healthScoreMaxCompact: {
    fontSize: 14,
  },
  healthBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  healthBarLabel: {
    width: 88,
    fontSize: 10,
    fontWeight: "600",
    color: METRONIC.subtle,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  healthBarLabelCompact: {
    width: 76,
    fontSize: 9,
  },
  healthBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#EFF2F5",
    overflow: "hidden",
  },
  healthBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  healthBarValue: {
    width: 28,
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.text,
    textAlign: "right",
  },
  gaugeCard: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  gaugeCardDesktop: {
    minHeight: 220,
  },
  gaugeBody: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  clientTripsGrid: {
    width: "100%",
    minWidth: 720,
    ...({
      display: "grid",
      gridTemplateColumns:
        "minmax(96px, 0.9fr) minmax(140px, 1.4fr) 76px 76px 76px minmax(88px, 0.9fr)",
      columnGap: 14,
      alignItems: "center",
      boxSizing: "border-box",
    } as object),
  },
  tripsEmpty: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  insightsCard: {
    gap: 2,
  },
  insightsCardDesktop: {
    padding: 18,
  },
});
