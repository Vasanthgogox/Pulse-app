/**
 * Mobile loads hub — ticket card aligned with TripsHubMobileTripCard.
 */
import {
  HUB_GRID_CARD_MIN_HEIGHT,
  HUB_GRID_DIVIDER_MARGIN_BOTTOM,
  HUB_GRID_DIVIDER_MARGIN_TOP,
  HUB_CARD_HEAD_AVATAR,
  HUB_CARD_HEAD_LEFT_GAP,
  HUB_GRID_HEAD_MARGIN_BOTTOM,
  HUB_GRID_PARTY_MIN_HEIGHT,
  HUB_GRID_ROUTE_MIN_HEIGHT,
} from "@/components/hub/hubGridCardLayout";
import { PartyAvatar } from "@/components/PartyAvatar";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { IndentHubPerforation } from "@/features/indents/components/IndentHubPerforation";
import { getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import type { LoadCenterTicketCommerce } from "@/features/network/utils/loadCenter.model";
import { formatINR } from "@/lib/format";
import { formatMobileTripSchedule } from "@/features/trips/components/TripsHubMobileTripCard";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import type { LoadCenterTripAllocation } from "@/features/network/utils/loadCenterTripAllocation.util";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";

const ALLOCATION_AVATAR_SIZE = 24;

const REF = {
  card: Theme.screenBackground,
  ink: "#1c1c1e",
  inkMid: "#3d4650",
  muted: "#9aa3ad",
  hairline: "#e8ecf0",
  accent: "#1a73e8",
  radius: 16,
} as const;

const ROUTE_ARROW_TOP = 2;
const ROUTE_PIN_SIZE = 8;
/** @deprecated Use `HUB_GRID_CARD_MIN_HEIGHT` from `@/components/hub/hubGridCardLayout`. */
export const LOAD_CENTER_GRID_CARD_MIN_HEIGHT = HUB_GRID_CARD_MIN_HEIGHT;

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

function formatPartyName(value: string): string {
  return asLabel(value).toUpperCase();
}

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function quoteStatusPillStyles(status: string) {
  const s = status.toLowerCase();
  if (s === "accepted") {
    return { pill: styles.statusAwarded, text: styles.statusAwardedText };
  }
  if (s === "rejected") {
    return { pill: styles.statusRejected, text: styles.statusRejectedText };
  }
  return { pill: styles.statusPending, text: styles.statusPendingText };
}

function RoutePin({ variant }: { variant: "origin" | "dest" }) {
  return (
    <View
      style={[
        styles.routePin,
        variant === "origin" ? styles.routePinOrigin : styles.routePinDest,
      ]}
    />
  );
}

function RouteLeg({
  location,
  variant,
  align,
  dense,
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
  dense?: boolean;
}) {
  const { city, state } = splitHubRouteLocationDisplay(location);
  const end = align === "right";
  return (
    <View style={[styles.leg, end && styles.legEnd]}>
      <View style={[styles.legRow, end && styles.legRowEnd]}>
        {!end ? <RoutePin variant={variant} /> : null}
        <View style={[styles.legText, end && styles.legTextEnd]}>
          <Text
            style={[
              styles.legCity,
              dense && styles.legCityDense,
              end && styles.textEnd,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {asLabel(city)}
          </Text>
          <Text
            style={[
              styles.legState,
              dense && styles.legStateDense,
              end && styles.textEnd,
              !state && styles.legStatePlaceholder,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {state || "\u00a0"}
          </Text>
        </View>
        {end ? <RoutePin variant={variant} /> : null}
      </View>
    </View>
  );
}

export type LoadCenterHubMobileIndentCardProps = {
  indent: IndentRow;
  titleName: string;
  statusLabel: string;
  origin: string;
  dest: string;
  pickupIso?: string | null;
  leftFooterLabel: string;
  rightFooterLabel: string;
  /** Travel-ticket stub: target rate / your quote (GET LOAD, claimed). */
  ticketCommerce?: LoadCenterTicketCommerce | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  initialsColorSeed?: string;
  /** Shown on Done → Converted to trips (driver + vehicle from linked trip). */
  tripAllocation?: LoadCenterTripAllocation | null;
  onPress: () => void;
  /** Footer slot (share / pulse / CTA) — rendered outside the pressable body. */
  actions?: ReactNode;
  /** Tighter padding for 4-column desktop grid cards. */
  dense?: boolean;
  /** Stretch card to fill grid cell height. */
  fillGrid?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LoadCenterHubMobileListCanvas({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.list, style]}>{children}</View>;
}

export function LoadCenterHubMobileIndentCard({
  indent,
  titleName,
  statusLabel,
  origin,
  dest,
  pickupIso,
  leftFooterLabel,
  rightFooterLabel,
  ticketCommerce,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  initialsColorSeed,
  tripAllocation,
  onPress,
  actions,
  dense = false,
  fillGrid = false,
  style,
}: LoadCenterHubMobileIndentCardProps) {
  const router = useRouter();
  const indentNo = asLabel(getIndentDisplayNumber(indent));
  const schedule = formatMobileTripSchedule(
    pickupIso ?? indent.pickup_date ?? indent.created_at,
  );
  const displayName = formatPartyName(titleName);
  const avatarFb =
    (initialsColorSeed ?? avatarSeed ?? "").trim() ||
    (indent.client_id
      ? `client-entity:${String(indent.client_id).trim()}`
      : `indent:${indent.id}`);
  const bodyPadding = dense || fillGrid ? 12 : 16;
  const useTicketStub = ticketCommerce != null;
  const commerce = ticketCommerce;
  const heroAmount =
    commerce?.amountInr != null && commerce.amountInr > 0
      ? stripCurrencyPrefix(formatINR(commerce.amountInr))
      : null;
  const referenceTarget =
    commerce?.targetRateInr != null && commerce.targetRateInr > 0
      ? stripCurrencyPrefix(formatINR(commerce.targetRateInr))
      : null;
  const quoteStatusNorm = (commerce?.quoteStatus ?? "").trim().toLowerCase();
  const statusStyles =
    quoteStatusNorm && commerce?.kicker === "YOUR QUOTE"
      ? quoteStatusPillStyles(quoteStatusNorm)
      : null;
  const rightCaption =
    commerce?.rightCaption?.trim() ||
    (!heroAmount ? rightFooterLabel : null);

  const stubBlock = (
    <View
      style={[
        styles.stub,
        fillGrid && styles.stubGrid,
        dense && styles.stubDense,
      ]}
    >
      <IndentHubPerforation contentPadding={bodyPadding} />
      <View style={styles.refRow}>
        <Text style={styles.refLine} numberOfLines={1}>
          <Text style={styles.refId}>{indentNo}</Text>
          <Text style={styles.refMuted}>{` · ${schedule.time} · ${schedule.dateLine}`}</Text>
        </Text>
      </View>
      <View style={[styles.stubRow, fillGrid && styles.stubRowGrid]}>
        <Text style={styles.stubVehicle} numberOfLines={2}>
          {leftFooterLabel}
        </Text>
        {heroAmount ? (
          <View style={styles.stubCommerce}>
            <View style={styles.stubCommerceTop}>
              <Text style={styles.stubKicker} numberOfLines={1}>
                {commerce?.kicker ?? "TARGET RATE"}
              </Text>
              {statusStyles ? (
                <View style={[styles.statusPill, statusStyles.pill]}>
                  <Text style={[styles.statusPillText, statusStyles.text]}>
                    {quoteStatusNorm === "accepted"
                      ? "Awarded"
                      : quoteStatusNorm === "rejected"
                        ? "Rejected"
                        : "Pending"}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.stubAmountRow}>
              <Text style={styles.stubCurrency}>₹</Text>
              <Text
                style={styles.stubAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {heroAmount}
              </Text>
            </View>
            {referenceTarget ? (
              <Text style={styles.stubReference} numberOfLines={1}>
                {`Target · ₹ ${referenceTarget}`}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.stubCaption} numberOfLines={2}>
            {rightCaption ?? rightFooterLabel}
          </Text>
        )}
      </View>
    </View>
  );

  const legacyFooter = fillGrid ? (
    <View style={styles.metaBlockGrid}>
      <View style={styles.metaBlockGridGrow} />
      <View style={styles.refRow}>
        <Text style={styles.refLine} numberOfLines={1}>
          <Text style={styles.refId}>{indentNo}</Text>
          <Text style={styles.refMuted}>{` · ${schedule.time} · ${schedule.dateLine}`}</Text>
        </Text>
      </View>
      <View style={[styles.partyRow, styles.partyRowGrid]}>
        <Text style={styles.footerLabel} numberOfLines={1}>
          {leftFooterLabel}
        </Text>
        <Text
          style={[styles.footerLabel, styles.footerLabelEnd]}
          numberOfLines={1}
        >
          {rightFooterLabel}
        </Text>
      </View>
    </View>
  ) : (
    <>
      <View style={styles.refRow}>
        <Text style={styles.refLine} numberOfLines={1}>
          <Text style={styles.refId}>{indentNo}</Text>
          <Text style={styles.refMuted}>{` · ${schedule.time} · ${schedule.dateLine}`}</Text>
        </Text>
      </View>
      <View style={styles.partyRow}>
        <Text style={styles.footerLabel} numberOfLines={1}>
          {leftFooterLabel}
        </Text>
        <Text
          style={[styles.footerLabel, styles.footerLabelEnd]}
          numberOfLines={1}
        >
          {rightFooterLabel}
        </Text>
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.cardWrap,
        fillGrid && styles.cardWrapGrid,
        style,
      ]}
    >
      <View style={[styles.card, fillGrid && styles.cardGrid]}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.body,
            dense && styles.bodyDense,
            fillGrid && styles.bodyGrid,
            pressed && styles.bodyPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${indentNo} ${displayName}, ${asLabel(origin)} to ${asLabel(dest)}`}
        >
          <View style={[styles.head, fillGrid && styles.headGrid]}>
            <View style={styles.headLeft}>
              <PartyAvatar
                name={displayName}
                initialsColorSeed={avatarFb}
                organizationImageUrl={organizationImageUrl}
                organizationAvatarSeed={organizationAvatarSeed}
                avatarUrl={avatarUrl}
                avatarSeed={avatarSeed}
                entityType="client"
                size={HUB_CARD_HEAD_AVATAR}
              />
              <View style={styles.headText}>
                <Text style={styles.brand} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>
            </View>
            <Text style={styles.headMeta} numberOfLines={1}>
              {asLabel(statusLabel).toUpperCase()}
            </Text>
          </View>

          <View
            style={[
              styles.route,
              dense && styles.routeDense,
              fillGrid && styles.routeGrid,
            ]}
          >
            <RouteLeg
              location={origin}
              variant="origin"
              align="left"
              dense={dense || fillGrid}
            />
            <View style={styles.routeMid}>
              <Text style={styles.routeArrow}>→</Text>
            </View>
            <RouteLeg
              location={dest}
              variant="dest"
              align="right"
              dense={dense || fillGrid}
            />
          </View>

          {!useTicketStub ? (
            <View style={[styles.divider, fillGrid && styles.dividerGrid]} />
          ) : null}

          {tripAllocation ? (
            <View
              style={[
                styles.allocationRow,
                fillGrid && styles.allocationRowGrid,
              ]}
            >
              <View style={styles.allocationCell}>
                <View style={styles.allocationPartyRow}>
                  {tripAllocation.driverId ? (
                    <Pressable
                      onPress={() =>
                        router.push(
                          `/public-profile/driver/${tripAllocation.driverId}`,
                        )
                      }
                      style={styles.allocationAvatarPress}
                      accessibilityRole="button"
                      accessibilityLabel={`View driver profile for ${tripAllocation.driver}`}
                      hitSlop={4}
                    >
                      <PartyAvatar
                        name={tripAllocation.driver}
                        avatarUrl={tripAllocation.driverAvatarUrl}
                        avatarSeed={tripAllocation.driverAvatarSeed}
                        entityType="driver"
                        size={ALLOCATION_AVATAR_SIZE}
                        initialsColorSeed={tripAllocation.driverId}
                      />
                    </Pressable>
                  ) : (
                    <PartyAvatar
                      name={tripAllocation.driver}
                      avatarUrl={tripAllocation.driverAvatarUrl}
                      avatarSeed={tripAllocation.driverAvatarSeed}
                      entityType="driver"
                      size={ALLOCATION_AVATAR_SIZE}
                      initialsColorSeed={tripAllocation.driver}
                    />
                  )}
                  <View style={styles.allocationTextCol}>
                    <Text style={styles.allocationLabel}>Driver</Text>
                    <Text style={styles.allocationValue} numberOfLines={1}>
                      {tripAllocation.driver}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.allocationDivider} />
              <View style={[styles.allocationCell, styles.allocationCellEnd]}>
                <Text style={[styles.allocationLabel, styles.allocationLabelEnd]}>
                  Vehicle
                </Text>
                <Text
                  style={[styles.allocationValue, styles.allocationValueEnd]}
                  numberOfLines={1}
                >
                  {tripAllocation.vehicle}
                </Text>
              </View>
            </View>
          ) : null}

          {useTicketStub ? (
            fillGrid ? (
              <View style={styles.metaBlockGrid}>
                <View style={styles.metaBlockGridGrow} />
                {stubBlock}
              </View>
            ) : (
              stubBlock
            )
          ) : fillGrid ? (
            legacyFooter
          ) : (
            legacyFooter
          )}
        </Pressable>
        {actions ? (
          <View style={[styles.actionsSlot, fillGrid && styles.actionsSlotGrid]}>
            {actions}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: "100%",
    gap: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  cardWrap: {
    width: "100%",
    marginBottom: 12,
  },
  cardWrapGrid: {
    flex: 1,
    marginBottom: 0,
    minWidth: 0,
  },
  card: {
    backgroundColor: REF.card,
    borderRadius: REF.radius,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 12px rgba(15, 23, 42, 0.08)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 2,
      },
    }),
  },
  cardGrid: {
    flex: 1,
    width: "100%",
    minHeight: HUB_GRID_CARD_MIN_HEIGHT,
    flexDirection: "column",
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  bodyDense: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  bodyGrid: {
    flex: 1,
    flexDirection: "column",
    paddingBottom: 10,
  },
  actionsSlot: {
    marginTop: "auto",
    width: "100%",
    minWidth: 0,
  },
  actionsSlotGrid: {
    flexShrink: 0,
    marginTop: 0,
  },
  metaBlockGrid: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  metaBlockGridGrow: {
    flex: 1,
    minHeight: 0,
  },
  bodyPressed: {
    opacity: 0.98,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  headGrid: {
    marginBottom: HUB_GRID_HEAD_MARGIN_BOTTOM,
  },
  headLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: HUB_CARD_HEAD_LEFT_GAP,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    minHeight: HUB_CARD_HEAD_AVATAR,
    justifyContent: "center",
  },
  brand: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: -0.15,
    fontWeight: "400",
  },
  headMeta: {
    flexShrink: 0,
    maxWidth: "38%",
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    color: REF.muted,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  allocationRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: REF.hairline,
    overflow: "hidden",
  },
  allocationRowGrid: {
    marginBottom: 8,
  },
  allocationCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  allocationPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  allocationAvatarPress: {
    borderRadius: ALLOCATION_AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: REF.hairline,
  },
  allocationTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  allocationCellEnd: {
    alignItems: "flex-end",
  },
  allocationDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: REF.hairline,
  },
  allocationLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: REF.muted,
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  allocationLabelEnd: {
    textAlign: "right",
  },
  allocationValue: {
    fontSize: 10,
    fontWeight: "700",
    color: REF.ink,
    letterSpacing: -0.1,
  },
  allocationValueEnd: {
    textAlign: "right",
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  routeDense: {
    gap: 3,
  },
  routeGrid: {
    minHeight: HUB_GRID_ROUTE_MIN_HEIGHT,
    flexShrink: 0,
  },
  leg: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "48%",
    overflow: "hidden",
  },
  legEnd: {
    alignItems: "flex-end",
  },
  legRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
  },
  legRowEnd: {
    justifyContent: "flex-end",
  },
  legText: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    ...Platform.select({
      web: { width: "100%" } as ViewStyle,
      default: {},
    }),
  },
  legTextEnd: {
    alignItems: "flex-end",
  },
  routePin: {
    width: ROUTE_PIN_SIZE,
    height: ROUTE_PIN_SIZE,
    borderRadius: ROUTE_PIN_SIZE / 2,
    marginTop: 2,
    flexShrink: 0,
  },
  routePinOrigin: {
    backgroundColor: REF.accent,
  },
  routePinDest: {
    backgroundColor: Theme.positive,
  },
  legCity: {
    fontSize: 11,
    fontWeight: "600",
    color: REF.ink,
    letterSpacing: -0.15,
    lineHeight: 14,
    textTransform: "uppercase",
    width: "100%",
  },
  legCityDense: {
    fontSize: 10,
    lineHeight: 13,
  },
  legState: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
    width: "100%",
  },
  legStateDense: {
    fontSize: 8,
    lineHeight: 11,
  },
  legStatePlaceholder: {
    opacity: 0,
  },
  textEnd: {
    textAlign: "right",
  },
  routeMid: {
    width: 24,
    paddingTop: ROUTE_ARROW_TOP,
    alignItems: "center",
    justifyContent: "flex-start",
    flexShrink: 0,
  },
  routeArrow: {
    fontSize: 16,
    fontWeight: "300",
    color: REF.muted,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: REF.hairline,
    marginTop: 12,
    marginBottom: 10,
  },
  dividerGrid: {
    marginTop: HUB_GRID_DIVIDER_MARGIN_TOP,
    marginBottom: HUB_GRID_DIVIDER_MARGIN_BOTTOM,
    flexShrink: 0,
  },
  refRow: {
    minWidth: 0,
  },
  refLine: {
    fontSize: 8,
    lineHeight: 11,
    letterSpacing: 0.1,
  },
  refId: {
    fontSize: 8,
    fontWeight: "500",
    color: REF.inkMid,
    lineHeight: 11,
    fontVariant: ["tabular-nums"],
  },
  refMuted: {
    fontSize: 8,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 11,
    fontVariant: ["tabular-nums"],
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 6,
    minHeight: 18,
  },
  partyRowGrid: {
    marginTop: 4,
    minHeight: HUB_GRID_PARTY_MIN_HEIGHT,
    flexShrink: 0,
  },
  footerLabel: {
    ...FinanceTxnTypography.partyTitle,
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: -0.15,
    fontWeight: "400",
    color: REF.inkMid,
    textTransform: "uppercase",
  },
  footerLabelEnd: {
    textAlign: "right",
  },
  stub: {
    minWidth: 0,
  },
  stubGrid: {
    flexShrink: 0,
  },
  stubDense: {},
  stubRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
    minWidth: 0,
  },
  stubRowGrid: {
    marginTop: 2,
    minHeight: HUB_GRID_PARTY_MIN_HEIGHT + 8,
    flexShrink: 0,
  },
  stubVehicle: {
    ...FinanceTxnTypography.partyTitle,
    flex: 1,
    minWidth: 0,
    maxWidth: "46%",
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: -0.15,
    fontWeight: "400",
    color: REF.inkMid,
    textTransform: "uppercase",
    alignSelf: "center",
  },
  stubCommerce: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 2,
  },
  stubCommerceTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    maxWidth: "100%",
  },
  stubKicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: REF.muted,
    flexShrink: 1,
  },
  stubAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 2,
    maxWidth: "100%",
  },
  stubCurrency: {
    fontSize: 14,
    fontWeight: "700",
    color: REF.inkMid,
    lineHeight: 18,
    marginBottom: 1,
  },
  stubAmount: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: REF.ink,
    lineHeight: 24,
    flexShrink: 1,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  stubReference: {
    fontSize: 8,
    fontWeight: "600",
    color: REF.muted,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  stubCaption: {
    ...FinanceTxnTypography.partyTitle,
    flex: 1,
    minWidth: 0,
    maxWidth: "52%",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    color: REF.inkMid,
    textTransform: "uppercase",
    textAlign: "right",
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusPending: { backgroundColor: "#F1F5F9" },
  statusPendingText: { color: "#475569" },
  statusAwarded: { backgroundColor: "#FEF3C7" },
  statusAwardedText: { color: "#B45309" },
  statusRejected: { backgroundColor: "#FEE2E2" },
  statusRejectedText: { color: "#B91C1C" },
});
