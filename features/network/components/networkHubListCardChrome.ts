/**
 * Shared list-row card chrome for Network hub (connections + discover panes).
 */
import Theme from "@/constants/Theme";
import { Platform, StyleSheet } from "react-native";

/** Horizontal rule between identity and metrics — matches TripsHubMobileTripCard `divider`. */
export const hubCardSectionDivider = {
  height: StyleSheet.hairlineWidth,
  backgroundColor: Theme.borderLight,
  width: "100%" as const,
};

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
  /** Card paddings trimmed ~15 % across the board (16→14 h, 13→11 v)
   *  to match the now-smaller avatar (48), role chip (12 px tall),
   *  and INTEGRATED badge. The prior 16/13 felt airy relative to the
   *  shrunken pills — 14/11 keeps the content rhythm tight without
   *  the card looking cramped.
   *
   *  `alignSelf: stretch` lets the card grow to match the tallest
   *  sibling in a grid row, and `minHeight` pins a baseline so cards
   *  with sparse content (no phone line, no extra meta) don't
   *  collapse shorter than cards with full content — combined with
   *  the row's `flex: 1`, this lands the metrics at the bottom-right
   *  at a consistent Y across every card in the grid. */
  card: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 70,
    backgroundColor: Theme.networkHubListCardBackground,
    borderRadius: NETWORK_HUB_RADIUS.card,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    paddingHorizontal: 14,
    paddingVertical: 11,
    overflow: "hidden",
    position: "relative",
    ...cardShadow,
  },
  cardCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  /** Shared avatar shell. Kept at 52 so the native list-row path
   *  (which renders a 48 px `PartyAvatar` inside this wrap) doesn't
   *  clip. Desktop / hub cards override to a tighter 46 in
   *  `networkPartyHubListCard.styles.ts`. */
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: NETWORK_HUB_RADIUS.avatar,
    backgroundColor: Theme.networkHubListCardAvatarBg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.networkHubListCardAvatarBorder,
  },
  /** Row for trip + rating tiles — no outer chrome (tiles carry their own borders). */
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    flexShrink: 0,
  },
  metricsRowCompact: {
    gap: 5,
  },
  metricsRowMobileGrid: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    gap: 4,
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
    gap: 14,
    minWidth: 0,
    paddingRight: 36,
  },
  headerPressed: {
    opacity: 0.94,
  },
  avatarCol: {
    width: 52,
    height: 52,
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
  sectionDivider: {
    ...hubCardSectionDivider,
    marginTop: 12,
    marginBottom: 12,
  },
  footer: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  footerBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    width: "100%",
    minWidth: 0,
  },
  footerMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    flexShrink: 0,
    minWidth: 0,
  },
  footerAction: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  /** Top-right dismiss/close affordance for discover cards. Sized to a
   *  comfortable hit target while staying subtle enough not to compete
   *  visually with the primary status button at the bottom. */
  dismissBtn: {
    position: "absolute",
    top: 10,
    right: 12,
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.networkHubListCardMetricsBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkHubListCardMetricsBorder,
  },
});
