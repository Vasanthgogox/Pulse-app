import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { StyleSheet } from "react-native";

const H = Layout.entityHero;
const rupeePad = Layout.currencyTextPaddingStart;
const rupeePadLg = Layout.currencyTextPaddingStartLarge;
const rupeePadV = Layout.currencyTextPaddingVertical;
const rupeePadVTight = Layout.currencyTextPaddingVerticalTight;

/**
 * Financial hero LinearGradient card on entity detail pages — single global scale
 * (client / supplier / driver / vehicle).
 */
export const entityHeroScorecardStyles = StyleSheet.create({
  scorecard: {
    backgroundColor: Theme.financeHeroBg,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.financeHeroBorder,
  },
  scorecardWebDesktop: {
    borderRadius: H.scorecardRadiusDesktop,
    paddingHorizontal: H.scorecardPaddingHorizontal,
    paddingVertical: H.scorecardPaddingVertical,
    minHeight: H.columnMinHeightDesktop,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  heroCardsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: H.rowGap,
    marginBottom: H.rowMarginBottom,
    minHeight: H.columnMinHeightDesktop,
  },
  scorecardHeroPane: {
    flex: H.financialFlex,
    marginBottom: 0,
  },
  scorecardDecorIconWrap: {
    position: "absolute",
    right: -8,
    top: -10,
  },
  scorecardDecorIcon: {
    transform: [{ rotate: "12deg" }],
    opacity: 0.14,
  },
  scorecardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  scorecardTopWebDesktop: {
    marginBottom: 30,
  },
  scorecardLeft: { flex: 1 },
  scorecardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1.2,
  },
  scorecardSalesLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "rgba(255,255,255,0.78)",
    letterSpacing: 1.2,
    marginTop: 8,
    textTransform: "uppercase",
  },
  scorecardAmount: {
    fontSize: 36,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 6,
    letterSpacing: -0.35,
    paddingLeft: rupeePad,
    paddingTop: rupeePadVTight,
    paddingBottom: rupeePadVTight,
    lineHeight: 46,
  },
  scorecardAmountWebDesktop: {
    fontSize: 64,
    lineHeight: 82,
    fontWeight: "800",
    letterSpacing: -0.85,
    paddingLeft: rupeePadLg,
    paddingTop: rupeePadV,
    paddingBottom: rupeePadV,
  },
  scorecardGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    minHeight: 100,
    alignItems: "flex-end",
  },
  scorecardGridWebDesktop: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 0,
    paddingTop: 18,
  },
  scorecardGridStat: {
    minWidth: 0,
    flex: 1,
  },
  scorecardGridRight: { alignItems: "flex-end" },
  scorecardGridLabelPaid: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.9,
  },
  scorecardGridLabelDue: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.9,
  },
  scorecardGridPaid: {
    fontSize: 22,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 6,
    letterSpacing: -0.35,
    paddingLeft: rupeePad,
    paddingTop: rupeePadVTight,
    paddingBottom: rupeePadVTight,
    lineHeight: 30,
  },
  scorecardGridPaidWebDesktop: {
    fontSize: 40,
    lineHeight: 52,
    letterSpacing: -0.45,
    paddingLeft: rupeePadLg,
    paddingTop: rupeePadVTight,
    paddingBottom: rupeePadVTight,
  },
  scorecardGridDue: {
    fontSize: 22,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 6,
    textAlign: "right",
    letterSpacing: -0.35,
    paddingLeft: rupeePad,
    paddingTop: rupeePadVTight,
    paddingBottom: rupeePadVTight,
    lineHeight: 30,
  },
  scorecardGridDueWebDesktop: {
    fontSize: 40,
    lineHeight: 52,
    letterSpacing: -0.45,
    paddingLeft: rupeePadLg,
    paddingTop: rupeePadVTight,
    paddingBottom: rupeePadVTight,
  },
});
