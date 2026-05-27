import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import {
  NETWORK_HUB_RADIUS,
  networkHubListCardChromeStyles,
} from "@/features/network/components/networkHubListCardChrome";
import Theme from "@/constants/Theme";
import { StyleSheet } from "react-native";

/** Matches NetworkPartyHubListCard / transaction list row alignment. */
export const discoverListCardStyles = StyleSheet.create({
  card: networkHubListCardChromeStyles.card,
  cardCompact: networkHubListCardChromeStyles.cardCompact,
  cardDesktopPane: networkHubListCardChromeStyles.cardDesktopPane,
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
  },
  rowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatarCol: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarWrap: networkHubListCardChromeStyles.avatarWrap,
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
    paddingLeft: 2,
  },
  partyName: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  partyNameCompact: {
    fontSize: 13,
    lineHeight: 16,
  },
  partyNameMobileGrid: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  rowMobileGrid: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  leftMobileGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
  },
  avatarColMobileGrid: {
    width: 44,
    height: 44,
  },
  identityMobileGrid: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingLeft: 0,
    justifyContent: "flex-start",
  },
  locationTextMobileGrid: {
    fontSize: 8,
    lineHeight: 10,
  },
  rightMobileGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: 6,
  },
  actionColMobileGrid: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 0,
    flexShrink: 0,
  },
  connectBtnMobileGrid: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 0,
    minHeight: 28,
    gap: 4,
  },
  connectBtnTextMobileGrid: {
    fontSize: 7,
    letterSpacing: 0.4,
  },
  statusBtnMobileGrid: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 28,
    minWidth: 0,
  },
  statusBtnTextMobileGrid: {
    fontSize: 7,
    letterSpacing: 0.3,
  },
  partyNameNativeList: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
    textTransform: "uppercase",
  },
  leftPressed: {
    opacity: 0.92,
  },
  /** Footer metrics block on native list rows. We deliberately do NOT
   *  flex this to fill the row — the action pill must keep its slot
   *  next to the metrics. With `flex: 1` the metrics block grabbed all
   *  available horizontal space and visually hid the CONNECT / REQUEST
   *  SENT pill (the parent `footerBody` then had no room left to
   *  honour `justifyContent: space-between`). Letting it size to
   *  content + `flexShrink: 1` keeps the long-card layout balanced. */
  nativeFooterMetrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  nativeActionWrap: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  connectBtnNative: {
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
    gap: 5,
  },
  connectBtnTextNative: {
    fontSize: 9,
    letterSpacing: 0.4,
  },
  statusBtnNative: {
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
    maxWidth: 140,
    gap: 5,
  },
  statusBtnTextNative: {
    fontSize: 9,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    marginTop: 1,
  },
  locationText: {
    ...FinanceTxnTypography.routeWhy,
    flex: 1,
    flexShrink: 1,
    lineHeight: 11,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  rightCompact: {
    justifyContent: "space-between",
    width: "100%",
  },
  metricsRow: networkHubListCardChromeStyles.metricsRow,
  metricsRowCompact: networkHubListCardChromeStyles.metricsRowCompact,
  mutualsSlot: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  actionCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    minWidth: 100,
  },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: NETWORK_HUB_RADIUS.control,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardPrimaryTintBorder,
    backgroundColor: Theme.networkHubListCardPrimaryTintBg,
    minWidth: 100,
    minHeight: 36,
    overflow: "hidden",
  },
  connectBtnText: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.primary,
    letterSpacing: 0.5,
  },
  statusBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: NETWORK_HUB_RADIUS.control,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    backgroundColor: Theme.networkHubListCardActionBg,
    minWidth: 100,
    maxWidth: 148,
    minHeight: 36,
    overflow: "hidden",
  },
  statusBtnText: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.textMuted,
    flexShrink: 1,
  },
  dismissBtn: {
    width: 36,
    height: 36,
    borderRadius: NETWORK_HUB_RADIUS.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.networkHubListCardActionBg,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    overflow: "hidden",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  /** Small "Client" / "Supplier" tag rendered immediately before the
   *  "Request sent" status button so the viewer can tell which role
   *  was used when the invitation was sent. */
  pendingRolePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    backgroundColor: Theme.networkHubListCardActionBg,
    flexShrink: 0,
  },
  pendingRolePillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
});
