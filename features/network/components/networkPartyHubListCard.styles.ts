import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import {
  NETWORK_HUB_RADIUS,
  networkHubListCardChromeStyles,
} from "@/features/network/components/networkHubListCardChrome";
import Theme from "@/constants/Theme";
import { StyleSheet } from "react-native";

/** List row chrome aligned with NetworkPartyProfileCard list + FinanceTxnTypography. */
export const hubListCardStyles = StyleSheet.create({
  card: networkHubListCardChromeStyles.card,
  cardCompact: networkHubListCardChromeStyles.cardCompact,
  /** Row uses `alignItems: flex-start` (not center) so the avatar's
   *  TOP edge and the name's TOP edge share the same Y position
   *  regardless of how much content the identity column carries
   *  (e.g. AHMED has a phone line, AMAN LOGS doesn't). With
   *  center-aligned children, the name would slide vertically as
   *  content height varied and cards in the same grid row would
   *  visually disagree.
   *
   *  `flex: 1` stretches the row to fill the card vertically so
   *  cards stretched to the same height by their grid container
   *  share an internal layout — the right-column's
   *  `alignSelf: flex-end` then lands metrics at the SAME Y across
   *  all cards in the row, level with the bottom card padding.
   *
   *  `minHeight: 48` matches the avatar column so cards without
   *  phone lines don't collapse shorter than cards with one. */
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
    minHeight: 48,
  },
  rowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
  },
  leftCompact: {
    gap: 10,
  },
  /** Avatar column tightened from 56→48 to peer with the smaller role
   *  chip / INTEGRATED badge scale. Combined with reducing
   *  `avatarSize` in the parent (44 default), this trims ~12 px of
   *  vertical chrome per card and keeps the identity column more
   *  proportional to its now-compact pills. */
  avatarCol: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    position: "relative",
  },
  /** Desktop / hub card avatar wrap — 46×46 to peer with the new
   *  48 px column and the smaller 44 px `PartyAvatar` rendered inside. */
  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: networkHubListCardChromeStyles.avatarWrap.borderRadius,
    backgroundColor: networkHubListCardChromeStyles.avatarWrap.backgroundColor,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: networkHubListCardChromeStyles.avatarWrap.borderWidth,
    borderColor: networkHubListCardChromeStyles.avatarWrap.borderColor,
  },
  /** Native list-row avatar wrap — 52×52 (full chrome size) so the
   *  larger 48 px `PartyAvatar` rendered in the native path is never
   *  clipped. */
  avatarWrapNative: networkHubListCardChromeStyles.avatarWrap,
  onlineDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Theme.networkHubListCardOnlineDot,
    borderWidth: 2,
    borderColor: Theme.networkHubListCardBackground,
    zIndex: 2,
  },
  /** Identity content is top-anchored to match the row's top-align —
   *  the party name always sits on the same baseline as the avatar's
   *  top edge across cards, regardless of whether a phone or extra
   *  meta line is present. A small `paddingTop` accounts for the
   *  avatar wrap's border so the name visually aligns with the top
   *  of the avatar's content, not the chrome border. */
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "flex-start",
    paddingTop: 1,
    paddingLeft: 2,
  },
  partyName: {
    ...FinanceTxnTypography.partyTitle,
    lineHeight: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  partyNameCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  partyNameMobileGrid: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textSecondary,
    letterSpacing: 0.15,
    textTransform: "uppercase",
    textAlign: "center",
    width: "100%",
    marginTop: 4,
    paddingHorizontal: 2,
  },
  /** Desktop 2-row hub — matches chat people strip density. */
  chatHubTile: {
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  /** Metronic user-directory tile (avatar, name + verified, muted handle). */
  directoryTile: {
    gap: 8,
    minHeight: 0,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EFF2F5",
    backgroundColor: Theme.cardWhite,
    ...({
      boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.05)",
    } as object),
  },
  directoryAvatarCol: {
    width: 56,
    height: 56,
  },
  directoryAvatarWrap: {
    width: 56,
    height: 56,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  directoryOnlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#50CD89",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    zIndex: 3,
  },
  directoryNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    maxWidth: "100%",
    paddingHorizontal: 2,
  },
  directoryName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#181C32",
    letterSpacing: -0.15,
    textAlign: "center",
  },
  directoryHandle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: "#A1A5B7",
    textAlign: "center",
    width: "100%",
  },
  chatHubAvatarWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  chatHubAvatarRing: {
    borderRadius: 999,
    padding: 2,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  chatHubAvatarCircle: {
    borderRadius: 999,
    overflow: "hidden",
  },
  chatHubOnlineDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.positive,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    zIndex: 3,
  },
  chatHubName: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    textTransform: "none",
    marginTop: 2,
  },
  chatHubRoleCue: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    textAlign: "center",
    width: "100%",
  },
  /** 3-up Your connections tile — avatar stacked above name only. */
  cardGridTile: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    width: "100%",
  },
  gridTileAvatarCol: {
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  gridTileOnlineDot: {
    right: 6,
    bottom: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 4,
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
  badgesRowMobileGrid: {
    flexWrap: "wrap",
    gap: 3,
    marginTop: 0,
  },
  badgeTextMobileGrid: {
    fontSize: 6,
    letterSpacing: 0.2,
  },
  phoneTextMobileGrid: {
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
    gap: 4,
  },
  connectedBtnMobileGrid: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 0,
    minHeight: 28,
    gap: 4,
  },
  connectedBtnTextMobileGrid: {
    fontSize: 7,
    letterSpacing: 0.4,
  },
  partyNameNativeList: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
    textTransform: "uppercase",
  },
  nativeFooterMetrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  nativeActionWrap: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    maxWidth: "52%",
  },
  roleChipText: {
    ...FinanceTxnTypography.routeWhy,
    lineHeight: 11,
    flexShrink: 1,
  },
  /** Subtitle line under the party name carrying the role label
   *  (e.g. "Supplier partner"). Moved here from the right-side action
   *  column to prevent collision with the floating "INTEGRATED" pill
   *  anchored at the card's top-right. */
  roleSubLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    marginTop: 1,
  },
  roleSubLineText: {
    ...FinanceTxnTypography.routeWhy,
    lineHeight: 12,
    flexShrink: 1,
  },
  /** Colored category chip sitting under the party name — tells the
   *  viewer *how* they are connected (CLIENT / SUPPLIER / DRIVER).
   *  Background, border and text colour are passed in per role
   *  (`networkBadgeClient*` / `networkBadgeSupplier*` / `networkBadgeDriver*`)
   *  so the chip carries the same tone palette as the other badges
   *  in the network surfaces. */
  rolePillRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    minWidth: 0,
    marginTop: 2,
    gap: 4,
  },
  /** Role chip dimensions are deliberately matched to the floating
   *  INTEGRATED badge (`NetworkHubGlassBadge` size="compact"). Both
   *  chips now share the same height (~12-14 px), padding (5 / 2),
   *  font size (6 px), letter-spacing (0.7), and line-height (9 px)
   *  so DRIVER / CLIENT / SUPPLIER reads as a peer to INTEGRATED
   *  rather than dominating it visually. */
  rolePillChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    maxWidth: "100%",
    minHeight: 12,
  },
  rolePillChipText: {
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    lineHeight: 9,
    flexShrink: 1,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  /** Floating "INTEGRATED" status pill anchored to the top-right of the
   *  card. Replaces the inline role + integration badges row so the name
   *  and metrics get more horizontal real estate and the card reads as a
   *  single composed unit. Pulled tighter into the corner (8/10 instead
   *  of 10/12) since the badge itself is now compact-sized — the prior
   *  inset was calibrated for the larger default-size badge. */
  integrationPillTopRight: {
    position: "absolute",
    top: 8,
    right: 10,
    zIndex: 3,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: NETWORK_HUB_RADIUS.badge,
    overflow: "hidden",
  },
  badgeText: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    marginTop: 1,
  },
  phoneText: {
    ...FinanceTxnTypography.routeWhy,
    flexShrink: 1,
    lineHeight: 11,
  },
  /** Right column is end-anchored vertically so the metrics tile row
   *  sits at the BOTTOM-right of the card, leaving a clean gap below
   *  the floating INTEGRATED badge at the top-right corner. With both
   *  metrics + badge at fixed positions (top vs bottom corner), the
   *  right side reads as a stable bookend layout instead of metrics
   *  floating at row-center where they crowd the badge. */
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    alignSelf: "flex-end",
  },
  rightCompact: {
    justifyContent: "space-between",
    width: "100%",
    alignSelf: "stretch",
  },
  metricsRow: networkHubListCardChromeStyles.metricsRow,
  metricsRowCompact: networkHubListCardChromeStyles.metricsRowCompact,
  /** Holds up to 3 overlapping faces + an optional +N overflow chip.
   *  Sized for the desktop card faces (32 px) which the parent passes
   *  in: 32 + 2·22 ≈ 76 px → 100 px ceiling absorbs the overflow chip
   *  comfortably while no longer hogging horizontal real estate on
   *  the now-narrower cards. */
  mutualsSlot: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    marginRight: 2,
    maxWidth: 100,
    overflow: "hidden",
  },
  actionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    width: "100%",
    flexShrink: 0,
  },
  /** Action column no longer reserves 100 px — the CONNECTED status
   *  pill is intrinsically smaller now (~70 px) and the column may
   *  be empty altogether when the INTEGRATED badge supersedes it.
   *  Letting the column size to its content frees the metrics row
   *  to sit closer to the identity column. */
  actionCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
  },
  connectedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: NETWORK_HUB_RADIUS.control,
    backgroundColor: Theme.networkHubListCardActionBg,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardBorder,
    minWidth: 100,
    minHeight: 36,
    overflow: "hidden",
  },
  connectedDotOuter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.25)",
  },
  connectedDotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Theme.positive,
  },
  connectedBtnText: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.textSecondary,
    letterSpacing: 0.6,
  },
});
