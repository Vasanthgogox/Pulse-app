/**
 * Shared list-row card chrome for Network hub (connections + discover panes).
 */
import Theme from "@/constants/Theme";
import { Platform, StyleSheet } from "react-native";

/** Consistent corner radii — avoids mismatched nested curves. */
export const NETWORK_HUB_RADIUS = {
  card: 12,
  inset: 10,
  control: 10,
  metric: 8,
  badge: 5,
  avatar: 22,
} as const;

const cardShadow = Platform.select({
  ios: {
    shadowColor: Theme.networkHubListCardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  android: { elevation: 2 },
  web: {
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
  },
  default: {},
});

const controlShadow = Platform.select({
  web: {
    boxShadow: "0 1px 1px rgba(15, 23, 42, 0.04)",
  },
  default: {},
});

const nativeListCardShadow = Platform.select({
  ios: {
    shadowColor: Theme.networkHubListCardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  android: { elevation: 3 },
  web: {
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
  },
  default: {},
});

export const networkHubListCardChromeStyles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: Theme.networkHubListCardBackground,
    borderRadius: NETWORK_HUB_RADIUS.card,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    paddingHorizontal: 16,
    paddingVertical: 13,
    overflow: "hidden",
    ...cardShadow,
  },
  cardCompact: {
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  /** Native app + mobile web — 2-up hub grid cells. */
  cardMobileGrid: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  cardDesktopPane: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: NETWORK_HUB_RADIUS.avatar,
    backgroundColor: Theme.networkHubListCardAvatarBg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.networkHubListCardAvatarBorder,
  },
  metricsBlock: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: NETWORK_HUB_RADIUS.inset,
    backgroundColor: Theme.networkHubListCardMetricsBg,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardMetricsBorder,
    minHeight: 44,
    overflow: "hidden",
  },
  metricsBlockCompact: {
    gap: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
    minHeight: 40,
  },
  metricsBlockMobileGrid: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 3,
    minHeight: 34,
  },
  controlBase: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    ...controlShadow,
  },
});

/** Native app full-width list row — elevated card on page canvas. */
export const networkHubNativeListStyles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.networkHubListCardBackground,
    borderRadius: NETWORK_HUB_RADIUS.card,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: "hidden",
    position: "relative",
    ...nativeListCardShadow,
  },
  headerPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    paddingRight: 26,
  },
  headerPressed: {
    opacity: 0.94,
  },
  avatarCol: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    position: "relative",
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    justifyContent: "center",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    paddingTop: 0,
    borderTopWidth: 0,
    minWidth: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  footerMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    flexShrink: 0,
    minWidth: 0,
  },
  footerAction: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  dismissBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.networkHubListCardMetricsBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkHubListCardMetricsBorder,
  },
});
