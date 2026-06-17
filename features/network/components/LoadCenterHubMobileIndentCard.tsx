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
import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import { PartyAvatar } from "@/components/PartyAvatar";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { IndentHubPerforation } from "@/features/indents/components/IndentHubPerforation";
import {
  indentReviewHubLayout,
} from "@/features/indents/styles/indentReviewHubStyles";
import { getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import type { LoadCenterTicketCommerce } from "@/features/network/utils/loadCenter.model";
import { formatINR } from "@/lib/format";
import { formatMobileTripSchedule } from "@/features/trips/components/TripsHubMobileTripCard";
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
  ink: "#1c1c1e",
  inkMid: "#3d4650",
  muted: "#9aa3ad",
  hairline: "#e8ecf0",
} as const;

/** @deprecated Use `HUB_GRID_CARD_MIN_HEIGHT` from `@/components/hub/hubGridCardLayout`. */
export const LOAD_CENTER_GRID_CARD_MIN_HEIGHT = HUB_GRID_CARD_MIN_HEIGHT;

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

function formatPartyName(value: string, hubTicket?: boolean): string {
  const label = asLabel(value);
  return hubTicket ? label : label.toUpperCase();
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
  const hubTicket = dense || fillGrid;
  const displayName = formatPartyName(titleName, hubTicket);
  const avatarFb =
    (initialsColorSeed ?? avatarSeed ?? "").trim() ||
    (indent.client_id
      ? `client-entity:${String(indent.client_id).trim()}`
      : `indent:${indent.id}`);
  const bodyPadding =
    fillGrid
      ? 14
      : dense
        ? indentReviewHubLayout.hubCardPaddingDense
        : indentReviewHubLayout.hubCardPaddingComfort;
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
      {!fillGrid ? (
        <IndentHubPerforation contentPadding={bodyPadding} />
      ) : null}
      <View style={styles.refRow}>
        <Text style={[styles.refLine, hubTicket && styles.refLineHub]} numberOfLines={1}>
          <Text style={[styles.refId, hubTicket && styles.refIdHub]}>{indentNo}</Text>
          <Text style={[styles.refMuted, hubTicket && styles.refMutedHub]}>
            {` · ${schedule.time} · ${schedule.dateLine}`}
          </Text>
        </Text>
      </View>
      <View style={[styles.stubRow, fillGrid && styles.stubRowGrid]}>
        <Text
          style={[styles.stubVehicle, hubTicket && styles.stubVehicleHub]}
          numberOfLines={2}
        >
          {leftFooterLabel}
        </Text>
        {heroAmount ? (
          <View style={styles.stubCommerce}>
            <View style={styles.stubCommerceTop}>
              <Text
                style={[styles.stubKicker, hubTicket && styles.stubKickerHub]}
                numberOfLines={1}
              >
                {commerce?.kicker ?? "Target rate"}
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
              <Text style={[styles.stubCurrency, fillGrid && styles.stubCurrencyGrid]}>
                ₹
              </Text>
              <Text
                style={[styles.stubAmount, fillGrid && styles.stubAmountGrid]}
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
          <Text
            style={[styles.stubCaption, hubTicket && styles.stubCaptionHub]}
            numberOfLines={2}
          >
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
        <Text style={[styles.refLine, styles.refLineHub]} numberOfLines={1}>
          <Text style={[styles.refId, styles.refIdHub]}>{indentNo}</Text>
          <Text style={[styles.refMuted, styles.refMutedHub]}>
            {` · ${schedule.time} · ${schedule.dateLine}`}
          </Text>
        </Text>
      </View>
      <View style={[styles.partyRow, styles.partyRowGrid]}>
        <Text style={[styles.footerLabel, styles.footerLabelHub]} numberOfLines={1}>
          {leftFooterLabel}
        </Text>
        <Text
          style={[styles.footerLabel, styles.footerLabelEnd, styles.footerLabelHub]}
          numberOfLines={1}
        >
          {rightFooterLabel}
        </Text>
      </View>
    </View>
  ) : (
    <>
      <View style={styles.refRow}>
        <Text style={[styles.refLine, hubTicket && styles.refLineHub]} numberOfLines={1}>
          <Text style={[styles.refId, hubTicket && styles.refIdHub]}>{indentNo}</Text>
          <Text style={[styles.refMuted, hubTicket && styles.refMutedHub]}>
            {` · ${schedule.time} · ${schedule.dateLine}`}
          </Text>
        </Text>
      </View>
      <View style={styles.partyRow}>
        <Text
          style={[styles.footerLabel, hubTicket && styles.footerLabelHub]}
          numberOfLines={1}
        >
          {leftFooterLabel}
        </Text>
        <Text
          style={[
            styles.footerLabel,
            styles.footerLabelEnd,
            hubTicket && styles.footerLabelHub,
          ]}
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
      <View
        style={[
          styles.card,
          fillGrid && styles.cardGrid,
          fillGrid && styles.cardGridElevated,
        ]}
      >
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.body,
            !fillGrid && dense && styles.bodyDense,
            !fillGrid && !dense && styles.bodyComfort,
            fillGrid && styles.bodyGridPad,
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
                <Text
                  style={[styles.brand, hubTicket && styles.brandHub]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
              </View>
            </View>
            <View style={styles.headMetaCol}>
              <Text
                style={[styles.headMeta, hubTicket && styles.headMetaHub]}
                numberOfLines={1}
              >
                {asLabel(statusLabel).toUpperCase()}
              </Text>
            </View>
          </View>

          <LoadCardRouteRow
            origin={origin}
            destination={dest}
            compact={hubTicket}
            style={[
              styles.route,
              dense && styles.routeDense,
              fillGrid && styles.routeGrid,
            ]}
          />

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
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  cardGrid: {
    flex: 1,
    width: "100%",
    minHeight: HUB_GRID_CARD_MIN_HEIGHT,
    flexDirection: "column",
  },
  cardGridElevated: {
    borderRadius: 14,
    borderColor: "rgba(15, 23, 42, 0.06)",
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      web: {
        boxShadow:
          "0 8px 24px rgba(15, 23, 42, 0.07), 0 1px 4px rgba(15, 23, 42, 0.04)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
        elevation: 2,
      },
    }),
  },
  body: {},
  bodyComfort: {
    paddingHorizontal: indentReviewHubLayout.hubCardPaddingComfort,
    paddingTop: indentReviewHubLayout.hubCardPaddingComfort,
    paddingBottom: indentReviewHubLayout.hubCardPaddingComfort,
  },
  bodyDense: {
    paddingHorizontal: indentReviewHubLayout.hubCardPaddingDense,
    paddingTop: indentReviewHubLayout.hubCardPaddingDense,
    paddingBottom: indentReviewHubLayout.hubCardPaddingDense,
  },
  bodyGridPad: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  bodyGrid: {
    flex: 1,
    flexDirection: "column",
    paddingBottom: 12,
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
    alignItems: "center",
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
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.1,
    fontWeight: "500",
    fontStyle: "normal",
    color: REF.ink,
  },
  brandHub: {
    fontSize: 12,
    lineHeight: 15,
  },
  headMetaCol: {
    flexShrink: 0,
    maxWidth: "42%",
    alignItems: "flex-end",
  },
  headMeta: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: REF.muted,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.25,
    flexShrink: 0,
  },
  headMetaHub: {
    maxWidth: "100%",
  },
  allocationRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
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
    borderColor: Theme.borderLight,
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
    backgroundColor: Theme.borderLight,
  },
  allocationLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
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
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  allocationValueEnd: {
    textAlign: "right",
  },
  route: {
    width: "100%",
    maxWidth: "100%",
    marginBottom: 2,
  },
  routeDense: {
    marginBottom: 0,
  },
  routeGrid: {
    minHeight: HUB_GRID_ROUTE_MIN_HEIGHT,
    flexShrink: 0,
    marginBottom: 0,
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
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.05,
  },
  refLineHub: {
    fontSize: 9,
    lineHeight: 12,
  },
  refId: {
    fontSize: 9,
    fontWeight: "500",
    color: REF.inkMid,
    lineHeight: 12,
    fontVariant: ["tabular-nums"],
  },
  refIdHub: {
    fontSize: 9,
    fontWeight: "500",
    color: REF.inkMid,
  },
  refMuted: {
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
    lineHeight: 12,
    fontVariant: ["tabular-nums"],
  },
  refMutedHub: {
    fontSize: 9,
    fontWeight: "400",
    color: REF.muted,
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
    minHeight: 18,
    width: "100%",
  },
  partyRowGrid: {
    marginTop: 4,
    minHeight: 24,
    flexShrink: 0,
    alignItems: "flex-start",
  },
  footerLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
    color: REF.muted,
    letterSpacing: 0.1,
  },
  footerLabelHub: {
    flex: 1,
    minWidth: 0,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "500",
    color: REF.inkMid,
    letterSpacing: 0,
  },
  footerLabelEnd: {
    textAlign: "right",
    alignItems: "flex-end",
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
    flex: 1,
    minWidth: 0,
    maxWidth: "46%",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
    color: REF.muted,
    alignSelf: "center",
  },
  stubVehicleHub: {
    fontSize: 9,
    fontWeight: "500",
    color: REF.inkMid,
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
    fontWeight: "500",
    color: REF.muted,
    letterSpacing: 0.25,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  stubKickerHub: {
    fontSize: 8,
    fontWeight: "500",
    color: REF.muted,
  },
  stubAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 2,
    maxWidth: "100%",
  },
  stubCurrency: {
    fontSize: 12,
    fontWeight: "600",
    color: REF.muted,
    lineHeight: 16,
    marginBottom: 1,
  },
  stubCurrencyGrid: {
    fontSize: 11,
    lineHeight: 14,
  },
  stubAmount: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 18,
    color: REF.ink,
    flexShrink: 1,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  stubAmountGrid: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "600",
  },
  stubReference: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  stubCaption: {
    flex: 1,
    minWidth: 0,
    maxWidth: "52%",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
    color: REF.muted,
    textAlign: "right",
  },
  stubCaptionHub: {
    fontSize: 9,
    fontWeight: "500",
    color: REF.inkMid,
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
