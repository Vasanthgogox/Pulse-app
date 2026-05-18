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
  controlBase: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    ...controlShadow,
  },
});
