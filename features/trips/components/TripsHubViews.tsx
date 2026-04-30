/**
 * Trips hub — compact card grid and audit-style table for the main Trips tab.
 * Styling aligns with fleet hub / reference; data bindings mirror TripExpandableCard.
 */
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import Theme from "@/constants/Theme";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import {
    adjustedCost,
    adjustedRevenue,
    type TripAdjustment,
} from "@/features/trips/services/tripAdjustments";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { isAggregateTrip } from "@/lib/driverUtils";
import {
    formatINR,
    formatLedgerDate,
    formatLedgerDateTime,
} from "@/lib/format";
import {
    isBlankOrPlaceholderPartyName,
    partyAvatarHasRenderableOutput,
    resolvePartyDisplayUri,
} from "@/lib/partyAvatarDisplay";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
    Image,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    useWindowDimensions,
    View,
    type ViewStyle,
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTripDisplayNumber, type TripRow } from "../services/trips.service";
import type { TripHubPartyMeta } from "../utils/tripHubPartyMeta";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Subtle horizontal pulse on the route arrow (trips hub card manifest). */
function FleetManifestRouteArrow() {
  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = withRepeat(
      withSequence(
        withTiming(4, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );
  }, [offset]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  return (
    <Animated.View style={[animatedStyle, { paddingHorizontal: 4 }]}>
      <FontAwesome name="long-arrow-right" size={13} color={Theme.textPrimaryDark} />
    </Animated.View>
  );
}

/** Soft opacity pulse on hub icons (Tesla-like restraint, no purple). */
function HubIconPulse({ children }: { children: ReactNode }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.68, {
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );
  }, [opacity]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={pulseStyle}>{children}</Animated.View>;
}

/** Ledger cash / table typography parity (`LedgerTransactionListView` tableView*). */
const FS_CAPTION = 8;
const FS_LABEL = 9;
const FS_BODY = 10;
const FS_AMOUNT = 12;
const FS_AMOUNT_LABEL = 7;
/** Route line on trip cards — slightly larger than body, bold “hero” line without dominating the card. */
const FS_ROUTE_HERO = 11;

/**
 * When `adjustments` is omitted or null, uses raw trip rates only (while adjustment map loads).
 */
export function tripFinanceAdjForHubLookup(
  map: Record<string, TripAdjustment[]> | undefined,
  tripId: string,
): TripAdjustment[] | undefined {
  if (map === undefined) return undefined;
  const k = String(tripId).trim().toLowerCase();
  return map[k] ?? [];
}

export function tripHubRevenue(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
): number {
  const isOwner =
    currentOrganizationId != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganizationId;
  const useSupplierRate = trip.indent_id != null && !isOwner;
  const raw = useSupplierRate
    ? Number(trip.supplier_rate ?? 0)
    : Number(trip.client_price ?? 0);
  if (adjustments == null) return raw;
  return adjustedRevenue(raw, adjustments);
}

function trackingStepForTrip(trip: TripRow, stageUpper: string): number {
  const completedLike =
    stageUpper === "COMPLETED" ||
    stageUpper === "DELIVERED" ||
    stageUpper === "DONE";
  if (completedLike) return 4;
  const s = (trip.status ?? "").toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done") return 4;
  if (s === "in_progress" || s === "in transit" || s === "in_transit") return 3;
  if (trip.started_at) return 2;
  if (trip.driver_id || s === "assigned") return 1;
  return 0;
}

function missionStatusForTrip(trip: TripRow): string {
  const s = (trip.status ?? "").trim().toLowerCase();
  if (!s) return "Pending";
  if (s === "in_progress") return "Loading";
  if (s === "in_transit" || s === "in transit") return "In Transit";
  if (s === "at_destination" || s === "at_drop") return "At Destination";
  if (s === "completed" || s === "delivered" || s === "done") return "Completed";
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function tripHubCost(
  trip: TripRow,
  _currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
): number {
  const raw = Number(trip.supplier_rate ?? 0);
  if (adjustments == null) return raw;
  return adjustedCost(raw, adjustments);
}

function tripHubPnl(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
): number {
  return (
    tripHubRevenue(trip, currentOrganizationId, adjustments) -
    tripHubCost(trip, currentOrganizationId, adjustments)
  );
}

function marginPercentLabel(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
): string {
  const sales = tripHubRevenue(trip, currentOrganizationId, adjustments);
  if (!sales) return "—";
  const pnl = tripHubPnl(trip, currentOrganizationId, adjustments);
  const pct = (pnl / sales) * 100;
  return `${pct.toFixed(1)}%`;
}

export function tripHubDue(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
): number {
  const sales = tripHubRevenue(trip, currentOrganizationId, adjustments);
  const paid = Number(trip.amount_paid ?? 0);
  return Math.max(0, sales - paid);
}

function agingLine(trip: TripRow, tr: (k: string) => string): string {
  const raw = trip.pickup_date || trip.created_at;
  if (!raw) return "";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(raw).getTime()) / 86400000),
  );
  return `${days}d${tr("tripsHubAgoSuffix")}`;
}

function sortedTripLedger(entries: LedgerRow[]): LedgerRow[] {
  return [...entries].sort((a, b) => {
    const ta = new Date(a.transaction_date || a.created_at).getTime();
    const tb = new Date(b.transaction_date || b.created_at).getTime();
    return tb - ta;
  });
}

/** Short pickup / schedule label for hub table. */
function formatTripPickupCell(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return formatLedgerDate(iso);
  } catch {
    return "—";
  }
}

/** Distance from trip row (km). */
function formatTripDistanceKm(
  raw: string | number | null | undefined,
): string {
  if (raw == null || raw === "") return "—";
  const n =
    typeof raw === "string"
      ? parseFloat(String(raw).replace(/,/g, ""))
      : Number(raw);
  if (Number.isNaN(n) || n < 0) return "—";
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded} km`;
}

function formatLoadTypeCell(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  return s
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

type HubPaymentTone = "paid" | "partial" | "pending" | "neutral";

function hubPaymentTone(status: string | null | undefined): HubPaymentTone {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "neutral";
  if (s.includes("partial")) return "partial";
  if (s.includes("paid") && !s.includes("unpaid")) return "paid";
  if (
    s.includes("pending") ||
    s.includes("unpaid") ||
    s.includes("due") ||
    s === "unpaid"
  ) {
    return "pending";
  }
  return "neutral";
}

function formatPaymentStatusLabel(
  status: string | null | undefined,
  tr: (k: string) => string,
): string {
  const raw = (status ?? "").trim();
  if (!raw) return "—";
  const s = raw.toLowerCase();
  if (s === "paid" || s === "fully_paid") return tr("tripsHubPayPaid");
  if (s === "pending" || s === "unpaid") return tr("tripsHubPayPending");
  if (s === "partial" || s.includes("partial")) return tr("tripsHubPayPartial");
  return raw.replace(/_/g, " ").toUpperCase();
}

export type TripsHubTableColumnId =
  | "party"
  | "driver"
  | "vehicle"
  | "pickupDate"
  | "distance"
  | "loadType"
  | "payment"
  | "billed"
  | "cost"
  | "received"
  | "due"
  | "margin"
  | "ledgerMeta";

export const DEFAULT_TRIPS_HUB_TABLE_COLUMNS: Record<TripsHubTableColumnId, boolean> =
  {
    party: true,
    driver: true,
    vehicle: true,
    pickupDate: true,
    distance: false,
    loadType: false,
    payment: false,
    billed: true,
    cost: true,
    received: true,
    due: true,
    margin: true,
    ledgerMeta: true,
  };

/** Ledger rollups for hub card + table (received = sum amount_in on trip). */
export function summarizeTripLedgerForHub(entries: LedgerRow[]): {
  receivedTotal: number;
  paidTotal: number;
  count: number;
  lastAtIso: string | null;
} {
  let receivedTotal = 0;
  let paidTotal = 0;
  for (const r of entries) {
    receivedTotal += Number(r.amount_in ?? 0);
    paidTotal += Number(r.amount_out ?? 0);
  }
  const sorted = sortedTripLedger(entries);
  const head = sorted[0];
  const lastAtIso = head
    ? String(head.transaction_date || head.created_at || "")
    : null;
  return { receivedTotal, paidTotal, count: entries.length, lastAtIso };
}

const HUB_TABLE_AVATAR = 26;

type HubPartyAvatarSize = "default" | "compact";

/** Hub card / table: linked org → contact photo → seed (DiceBear); drivers use driver preset seeds. */
function HubPartyAvatar({
  avatarUrl,
  avatarSeed,
  fallbackSeed,
  entityType = "client",
  partyLabel,
  organizationImageUrl,
  organizationAvatarSeed,
  size = "default",
}: {
  avatarUrl: string | null | undefined;
  avatarSeed: string | null | undefined;
  fallbackSeed: string;
  entityType?: "client" | "supplier" | "driver";
  /** When empty or placeholder-only, no synthetic DiceBear avatar is shown (unless driver with fallbackSeed). */
  partyLabel: string;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  size?: HubPartyAvatarSize;
}) {
  const ringStyle =
    size === "compact" ? styles.hubTableAvatarRing : styles.hubPartyAvatarRing;
  const imgStyle =
    size === "compact" ? styles.hubTableAvatarImg : styles.hubPartyAvatarImg;
  const resolved =
    resolvePartyDisplayUri({
      organizationImageUrl,
      organizationAvatarSeed,
      avatarUrl,
      avatarSeed,
      entityType,
    }) ?? null;
  if (resolved) {
    return (
      <View style={ringStyle}>
        <Image
          source={{ uri: resolved }}
          style={imgStyle}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  const seedKey = (fallbackSeed ?? "").trim() || partyLabel.trim();
  if (isBlankOrPlaceholderPartyName(partyLabel)) {
    if (entityType === "driver" && seedKey) {
      const displayUri = getAvatarUriForSeed(seedKey || "driver");
      return (
        <View style={ringStyle}>
          <Image
            source={{ uri: displayUri }}
            style={imgStyle}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
      );
    }
    return null;
  }
  const displayUri =
    entityType === "driver"
      ? getAvatarUriForSeed(seedKey || "driver")
      : getUser2DAvatarUriForSeed(seedKey || "party");
  return (
    <View style={ringStyle}>
      <Image
        source={{ uri: displayUri }}
        style={imgStyle}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

function linkedOrgAvatarFields(
  linkedOrgId: string | null | undefined,
  linkedMap: Record<string, LinkedOrgDisplay> | undefined,
): { organizationImageUrl?: string | null; organizationAvatarSeed?: string | null } {
  const id = (linkedOrgId ?? "").trim();
  if (!id || !linkedMap) return {};
  const o = linkedMap[id];
  if (!o) return {};
  return {
    organizationImageUrl: o.avatarUrl ?? null,
    organizationAvatarSeed: o.avatarSeed ?? null,
  };
}

export type TripsHubTripCardProps = {
  trip: TripRow;
  currentOrganizationId: string | null | undefined;
  displayClientName: string;
  /** Resolved supplier / partner label (may be empty until sync). */
  displaySupplierName?: string;
  /** When set and starts with http(s), shown as client photo; else seed / fallback. */
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  clientAvatarFallbackSeed?: string;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  supplierAvatarFallbackSeed?: string;
  cardDate: string;
  stageLabel: string;
  onPress: () => void;
  tr: (key: string) => string;
  rowWebStyle?: ViewStyle;
  /** Optional: same ledger rows as hub table for cash-in total / counts. */
  ledgerReceivedTotal?: number;
  ledgerTxnCount?: number;
  lastLedgerDateLabel?: string;
  /**
   * When set, revenue/cost/margin/due use trip finance adjustments (Alignment with trip detail).
   * Omitted or `undefined` = use raw `client_price` / `supplier_rate` (e.g. while map loads).
   */
  financeAdjustments?: TripAdjustment[] | null;
};

export function TripsHubTripCard({
  trip,
  currentOrganizationId,
  displayClientName,
  displaySupplierName = "",
  clientAvatarUrl,
  clientAvatarSeed,
  clientAvatarFallbackSeed,
  supplierAvatarUrl,
  supplierAvatarSeed,
  supplierAvatarFallbackSeed,
  cardDate: _cardDate,
  stageLabel,
  onPress,
  tr,
  rowWebStyle,
  ledgerReceivedTotal,
  ledgerTxnCount,
  lastLedgerDateLabel,
  financeAdjustments,
}: TripsHubTripCardProps) {
  const aggregate = isAggregateTrip(trip);
  // Keep Trips hub labels aligned with Trip Detail header semantics:
  // aggregate is determined by supplier linkage, not by assignment completeness.
  const showAssetTripIcon = !aggregate;
  const typeLabel = showAssetTripIcon ? tr("tripAsset") : tr("tripAggregate");
  const subTypeLabel = aggregate ? tr("integrated") : tr("manual");
  /** `undefined` while adjustment map loads — hub uses raw rates. */
  const adj = financeAdjustments;
  const revenue = tripHubRevenue(trip, currentOrganizationId, adj);
  const cost = tripHubCost(trip, currentOrganizationId, adj);
  const pnl = tripHubPnl(trip, currentOrganizationId, adj);
  const due = tripHubDue(trip, currentOrganizationId, adj);
  const marginPct = marginPercentLabel(trip, currentOrganizationId, adj);
  const stageUpper = (stageLabel || "").toUpperCase();
  const trackingStep = trackingStepForTrip(trip, stageUpper);
  const missionStatus = missionStatusForTrip(trip);
  const origin = trip.pickup_area ?? "—";
  const dest = trip.drop_location ?? "—";
  const tripNo = getTripDisplayNumber(trip);
  const aging = agingLine(trip, tr);

  const supplierNameResolved = (displaySupplierName ?? "").trim();
  const showSupplierParty =
    !!supplierNameResolved ||
    aggregate ||
    isLoadBasedTrip(trip);
  const supplierLine =
    supplierNameResolved || (showSupplierParty ? tr("tripsHubAwaitingData") : "");
  const clientFb =
    (clientAvatarFallbackSeed ?? "").trim() ||
    (trip.client_id ? `client-entity:${String(trip.client_id).trim()}` : `client-trip:${trip.id}`);
  const supplierFb =
    (supplierAvatarFallbackSeed ?? "").trim() ||
    (trip.supplier_id
      ? `supplier-entity:${String(trip.supplier_id).trim()}`
      : supplierNameResolved
        ? `supplier-name:${trip.id}:${supplierNameResolved}`
        : `supplier-trip:${trip.id}`);

  const missionTone = stageUpper.includes("UNASSIGNED")
    ? "unassigned"
    : stageUpper.includes("COMPLET") ||
        stageUpper.includes("DELIVER") ||
        stageUpper.includes("DONE")
      ? "emerald"
      : stageUpper.includes("IN_PROGRESS") ||
          stageUpper.includes("TRANSIT") ||
          stageUpper.includes("AT_DROP")
        ? "rose"
        : "emerald";

  const missionPillStyle =
    missionTone === "unassigned"
      ? styles.fleetMissionPillUnassigned
      : missionTone === "rose"
        ? styles.fleetMissionPillRose
        : styles.fleetMissionPillEmerald;
  const missionPillTextStyle =
    missionTone === "unassigned"
      ? styles.fleetMissionPillTextUnassigned
      : missionTone === "rose"
        ? styles.fleetMissionPillTextRose
        : styles.fleetMissionPillTextEmerald;

  return (
    <Pressable
      style={[styles.fleetCardOuter, rowWebStyle]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tripNo} ${displayClientName}${
        showSupplierParty ? `, ${tr("tripsHubSupplierShort")} ${supplierLine}` : ""
      }`}
    >
      <View style={styles.fleetCard}>
        <View style={[styles.fleetOrb, { pointerEvents: 'none' }]} />
        <View style={styles.fleetHead}>
          <View style={styles.fleetHeadLeft}>
            <View style={styles.fleetTruckWrap}>
              <HubIconPulse>
                <FontAwesome
                  name={showAssetTripIcon ? "truck" : "link"}
                  size={18}
                  color={
                    showAssetTripIcon
                      ? Theme.textPrimaryDark
                      : Theme.aggregatePillText
                  }
                />
              </HubIconPulse>
            </View>
            <View style={styles.fleetHeadText}>
              <View style={styles.fleetBadgeRow}>
                <View style={styles.fleetBadgeBlue}>
                  <Text style={styles.fleetBadgeBlueText}>{typeLabel}</Text>
                </View>
                <View style={styles.fleetBadgeViolet}>
                  <Text style={styles.fleetBadgeVioletText}>{subTypeLabel}</Text>
                </View>
              </View>
              <Text style={styles.fleetTripId}>{tripNo}</Text>
            </View>
          </View>
          <View style={styles.fleetHeadRight}>
            <View style={[styles.fleetMissionPill, missionPillStyle]}>
              <Text style={[styles.fleetMissionPillText, missionPillTextStyle]}>
                {stageUpper}
              </Text>
            </View>
            {aging ? (
              <Text style={styles.fleetAging}>{aging}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.fleetManifest}>
          <View style={styles.fleetManifestRow}>
            <View style={styles.fleetManifestCol}>
              <Text style={styles.fleetManifestOrigin} numberOfLines={1}>
                {origin}
              </Text>
            </View>
            <FleetManifestRouteArrow />
            <View style={[styles.fleetManifestCol, styles.fleetManifestColEnd]}>
              <Text style={styles.fleetManifestDest} numberOfLines={1}>
                {dest}
              </Text>
            </View>
          </View>
          <View style={styles.fleetProgHead}>
            <Text style={styles.fleetProgHeadMuted}>
              {tr("tripsHubMissionStatus")}
            </Text>
            <Text style={styles.fleetProgHeadIndigo}>
              {missionStatus}
            </Text>
          </View>
          <View style={styles.fleetProgSegmentRow}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.fleetProgSegment,
                  trackingStep >= i + 1
                    ? styles.fleetProgSegmentFilled
                    : styles.fleetProgSegmentEmpty,
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.fleetPartyBlock}>
          {showSupplierParty ? (
            <View style={styles.fleetPartyRow}>
              <View style={[styles.fleetPartyCol, styles.fleetPartyColWithAvatar]}>
                <View style={styles.fleetPartyAvatarRow}>
                  <HubPartyAvatar
                    avatarUrl={clientAvatarUrl}
                    avatarSeed={clientAvatarSeed}
                    fallbackSeed={clientFb}
                    partyLabel={displayClientName}
                  />
                  <View style={styles.fleetPartyTextStack}>
                    <Text style={styles.fleetPartyLabel}>{tr("tripsHubColClient")}</Text>
                    <Text style={styles.fleetPartyName} numberOfLines={1}>
                      {displayClientName}
                    </Text>
                  </View>
                </View>
              </View>
              <View
                style={[
                  styles.fleetPartyCol,
                  styles.fleetPartyColEnd,
                  styles.fleetPartyColWithAvatar,
                ]}
              >
                <View style={[styles.fleetPartyAvatarRow, styles.fleetPartyAvatarRowEnd]}>
                  <HubPartyAvatar
                    avatarUrl={supplierAvatarUrl}
                    avatarSeed={supplierAvatarSeed}
                    fallbackSeed={supplierFb}
                    entityType="supplier"
                    partyLabel={supplierNameResolved}
                  />
                  <View style={styles.fleetPartyTextStackEnd}>
                    <Text style={[styles.fleetPartyLabel, styles.fleetPartyLabelAlignEnd]}>
                      {tr("tripsHubSupplierShort")}
                    </Text>
                    <Text
                      style={[
                        supplierNameResolved
                          ? styles.fleetPartyName
                          : styles.fleetPartySub,
                        styles.fleetPartySubAlignEnd,
                      ]}
                      numberOfLines={1}
                    >
                      {supplierLine}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.fleetPartyAvatarRow}>
              <HubPartyAvatar
                avatarUrl={clientAvatarUrl}
                avatarSeed={clientAvatarSeed}
                fallbackSeed={clientFb}
                partyLabel={displayClientName}
              />
              <View style={styles.fleetPartyTextStack}>
                <Text style={styles.fleetPartyLabel}>{tr("tripsHubColClient")}</Text>
                <Text style={styles.fleetPartyName} numberOfLines={1}>
                  {displayClientName}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.fleetMetricsRow}>
          <View style={styles.fleetMetricCell}>
            <Text style={styles.fleetMetricLabel}>{tr("tripsHubColCost")}</Text>
            <Text style={styles.fleetMetricVal}>{formatINR(cost)}</Text>
          </View>
          <View style={styles.fleetMetricCell}>
            <Text style={styles.fleetMetricLabel}>{tr("tripsHubColMargin")}</Text>
            <Text style={styles.fleetMetricVal}>{formatINR(pnl)}</Text>
            <Text style={styles.fleetMetricPct}>{marginPct}</Text>
          </View>
          <View style={styles.fleetMetricCell}>
            <Text style={styles.fleetMetricLabel}>{tr("tripsHubColReceived")}</Text>
            <Text style={styles.fleetMetricVal}>
              {ledgerReceivedTotal != null ? formatINR(ledgerReceivedTotal) : "—"}
            </Text>
            <Text style={styles.fleetMetricMeta}>
              {tr("tripsHubAmountPaidBook")}: {formatINR(Number(trip.amount_paid ?? 0))}
            </Text>
          </View>
          <View style={styles.fleetMetricCell}>
            <Text style={styles.fleetMetricLabel}>{tr("tripsHubColDue")}</Text>
            <Text style={styles.fleetMetricVal}>{formatINR(due)}</Text>
            <Text style={styles.fleetMetricMeta}>
              {ledgerTxnCount != null ? `${ledgerTxnCount} · ${tr("tripsHubColTxns")}` : "—"}
              {lastLedgerDateLabel ? ` · ${lastLedgerDateLabel}` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.fleetFooter}>
          <View style={styles.fleetFooterLeft}>
            <View style={styles.fleetTrendWrap}>
              <HubIconPulse>
                <FontAwesome name="line-chart" size={12} color={Theme.teslaRed} />
              </HubIconPulse>
            </View>
            <View>
              <Text style={styles.fleetRevSnapLabel}>
                {tr("tripsHubRevSnapshot")}
              </Text>
              <Text style={styles.fleetRevSnapVal}>{formatINR(revenue)}</Text>
            </View>
          </View>
          <FontAwesome name="chevron-right" size={14} color={Theme.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

export type TripsHubTableViewProps = {
  trips: TripRow[];
  currentOrganizationId: string | null | undefined;
  getStageLabel: (t: TripRow) => string;
  /** Ledger rows keyed by trip_id (same source as trip detail). */
  transactionsByTripId: Map<string, LedgerRow[]>;
  onOpenTripDetails: (trip: TripRow) => void;
  /** Optional: e.g. open Finance / export flow. */
  onExportLedger?: () => void;
  tr: (key: string) => string;
  /** Optional client-name override by trip id (used when supplier should see shipper as client). */
  clientNameByTripId?: Record<string, string>;
  /** From `useLinkedOrgProfileMap(clients, suppliers)` — org logo before contact avatar in Partner column. */
  linkedOrgByOrganizationId?: Record<string, LinkedOrgDisplay>;
  /** Per-trip client/supplier/driver avatar fields (see `buildTripHubPartyMetaByTripId`). */
  partyMetaByTripId?: Map<string, TripHubPartyMeta>;
  /**
   * Trip finance adjustments keyed by normalized trip id; `undefined` while loading (table uses raw rates until then).
   */
  financeAdjustmentsByTripId?: Record<string, TripAdjustment[]>;
};

function txnAmount(row: LedgerRow): number {
  return Math.max(Number(row.amount_in ?? 0), Number(row.amount_out ?? 0));
}

const HUB_COLUMN_ORDER: TripsHubTableColumnId[] = [
  "party",
  "driver",
  "vehicle",
  "pickupDate",
  "distance",
  "loadType",
  "payment",
  "billed",
  "cost",
  "received",
  "due",
  "margin",
  "ledgerMeta",
];

const HUB_COLUMN_LABEL: Record<TripsHubTableColumnId, string> = {
  party: "tripsHubColPartner",
  driver: "tripsHubColDriver",
  vehicle: "tripsHubColVehicle",
  pickupDate: "tripsHubColPickupDate",
  distance: "tripsHubColDistance",
  loadType: "tripsHubColLoadType",
  payment: "tripsHubColPayment",
  billed: "tripsHubColBilledCompare",
  cost: "tripsHubColCost",
  received: "tripsHubColReceived",
  due: "tripsHubColDue",
  margin: "tripsHubColMargin",
  ledgerMeta: "tripsHubColLedgerShort",
};

/** Table header text alignment matches body column alignment. */
const HUB_TH_LEFT = new Set<TripsHubTableColumnId>([
  "party",
  "driver",
  "vehicle",
  "pickupDate",
  "loadType",
]);

export function TripsHubTableView({
  trips,
  currentOrganizationId,
  getStageLabel,
  transactionsByTripId,
  onOpenTripDetails,
  onExportLedger,
  tr,
  clientNameByTripId,
  linkedOrgByOrganizationId,
  partyMetaByTripId,
  financeAdjustmentsByTripId,
}: TripsHubTableViewProps) {
  const insets = useSafeAreaInsets();
  const { width: layoutWidth } = useWindowDimensions();
  /** Narrow viewports: shorter settlement cards (no bar, tighter padding, single-line name). */
  const compactSettlement = layoutWidth > 0 && layoutWidth < 520;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [visibleCols, setVisibleCols] = useState<
    Record<TripsHubTableColumnId, boolean>
  >(() => ({ ...DEFAULT_TRIPS_HUB_TABLE_COLUMNS }));
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [tableQuery, setTableQuery] = useState("");
  const [sortKey, setSortKey] = useState<"recent" | "due_desc" | "sales_desc">(
    "recent",
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | "verified" | "pending" | "attention"
  >("all");
  const [showColSettings, setShowColSettings] = useState(false);
  const [receiptTx, setReceiptTx] = useState<{
    trip: TripRow;
    row: LedgerRow | null;
  } | null>(null);
  const [cols, setCols] = useState({
    telemetry: true,
    earnings: true,
    supplier: true,
    driver: true,
    audit: true,
  });

  const toggleExpanded = (tripId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  };

  const setCol = (id: TripsHubTableColumnId, on: boolean) => {
    setVisibleCols((prev) => ({ ...prev, [id]: on }));
  };

  const rowWebCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : undefined;

  const displayedTrips = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    let rows = trips;
    if (q) {
      rows = rows.filter((t) => {
        const meta = partyMetaByTripId?.get(t.id);
        const clientName = (clientNameByTripId?.[t.id] ?? t.client_name ?? "")
          .trim()
          .toLowerCase();
        const supplierName = (
          meta?.displaySupplierName ??
          t.supplier_name ??
          ""
        )
          .trim()
          .toLowerCase();
        const driverName = (t.driver_display_name ?? "").trim().toLowerCase();
        const route = `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`
          .trim()
          .toLowerCase();
        const tripNo = getTripDisplayNumber(t).toLowerCase();
        return (
          tripNo.includes(q) ||
          clientName.includes(q) ||
          supplierName.includes(q) ||
          driverName.includes(q) ||
          route.includes(q)
        );
      });
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const adjA = tripFinanceAdjForHubLookup(financeAdjustmentsByTripId, a.id);
      const adjB = tripFinanceAdjForHubLookup(financeAdjustmentsByTripId, b.id);
      if (sortKey === "due_desc") {
        return (
          tripHubDue(b, currentOrganizationId, adjB) -
          tripHubDue(a, currentOrganizationId, adjA)
        );
      }
      if (sortKey === "sales_desc") {
        return (
          tripHubRevenue(b, currentOrganizationId, adjB) -
          tripHubRevenue(a, currentOrganizationId, adjA)
        );
      }
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    return sorted;
  }, [
    trips,
    tableQuery,
    sortKey,
    partyMetaByTripId,
    clientNameByTripId,
    currentOrganizationId,
    financeAdjustmentsByTripId,
  ]);

  const sortLabel =
    sortKey === "recent"
      ? "Recent"
      : sortKey === "due_desc"
        ? "Due"
        : "Sales";

  const statusLabel =
    statusFilter === "all"
      ? "All status"
      : statusFilter === "verified"
        ? "Verified"
        : statusFilter === "pending"
          ? "Pending"
          : "Needs review";

  const cycleSortKey = () => {
    setSortKey((prev) =>
      prev === "recent" ? "due_desc" : prev === "due_desc" ? "sales_desc" : "recent",
    );
  };

  const cycleStatusFilter = () => {
    setStatusFilter((prev) =>
      prev === "all"
        ? "verified"
        : prev === "verified"
          ? "pending"
          : prev === "pending"
            ? "attention"
            : "all",
    );
  };

  const classifyTripFilter = (trip: TripRow): "verified" | "pending" | "attention" => {
    const entries = transactionsByTripId.get(trip.id) ?? [];
    const hasMismatch = entries.some((r) => r.reconciliation_status === "mismatch");
    if (hasMismatch) return "attention";
    const stageUpper = getStageLabel(trip).toUpperCase();
    if (
      stageUpper.includes("COMPLET") ||
      stageUpper.includes("DELIVER") ||
      stageUpper.includes("DONE")
    ) {
      return "verified";
    }
    return "pending";
  };

  const templateTrips = useMemo(() => {
    if (statusFilter === "all") return displayedTrips;
    return displayedTrips.filter((trip) => classifyTripFilter(trip) === statusFilter);
  }, [displayedTrips, statusFilter]);

  const toggleTemplateCol = (key: keyof typeof cols) => {
    setCols((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <View style={styles.auditTableWrap}>
      <View style={styles.auditToolbar}>
        <Text style={styles.auditToolbarCount}>
          Showing {templateTrips.length} of {trips.length} trips
        </Text>
        <View style={styles.auditToolbarControls}>
          <View style={styles.auditSearchWrap}>
            <FontAwesome name="search" size={12} color={Theme.textSecondary} />
            <TextInput
              value={tableQuery}
              onChangeText={setTableQuery}
              placeholder="Search trip / client / supplier"
              placeholderTextColor={Theme.textMuted}
              style={styles.auditSearchInput}
            />
            {tableQuery ? (
              <Pressable
                onPress={() => setTableQuery("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear table search"
              >
                <FontAwesome name="times-circle" size={14} color={Theme.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.auditToolbarBtn}
            onPress={cycleStatusFilter}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Cycle status filter"
          >
            <FontAwesome name="check-circle-o" size={13} color={Theme.textSecondary} />
            <Text style={styles.auditToolbarText}>{statusLabel}</Text>
            <FontAwesome name="chevron-down" size={10} color={Theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.auditToolbarBtn}
            onPress={cycleSortKey}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Cycle table sort"
          >
            <FontAwesome name="sort" size={13} color={Theme.textSecondary} />
            <Text style={styles.auditToolbarText}>Sort: {sortLabel}</Text>
            <FontAwesome name="chevron-down" size={10} color={Theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.auditToolbarBtn}
            onPress={() => setShowColSettings((v) => !v)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Toggle table column settings"
          >
            <FontAwesome name="sliders" size={13} color={Theme.textSecondary} />
            <Text style={styles.auditToolbarText}>Filters</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.manifestFilterRow}>
        <TouchableOpacity
          style={[styles.manifestFilterPill, statusFilter === "all" && styles.manifestFilterPillOn]}
          onPress={() => setStatusFilter("all")}
          activeOpacity={0.85}
        >
          <Text style={[styles.manifestFilterPillText, statusFilter === "all" && styles.manifestFilterPillTextOn]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.manifestFilterPill, statusFilter === "verified" && styles.manifestFilterPillOn]}
          onPress={() => setStatusFilter("verified")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.manifestFilterPillText,
              statusFilter === "verified" && styles.manifestFilterPillTextOn,
            ]}
          >
            Verified
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.manifestFilterPill, statusFilter === "pending" && styles.manifestFilterPillOn]}
          onPress={() => setStatusFilter("pending")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.manifestFilterPillText,
              statusFilter === "pending" && styles.manifestFilterPillTextOn,
            ]}
          >
            Pending
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.manifestFilterPill, statusFilter === "attention" && styles.manifestFilterPillOn]}
          onPress={() => setStatusFilter("attention")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.manifestFilterPillText,
              statusFilter === "attention" && styles.manifestFilterPillTextOn,
            ]}
          >
            Needs Review
          </Text>
        </TouchableOpacity>
      </View>

      {showColSettings ? (
        <View style={styles.manifestColPanel}>
          {(Object.keys(cols) as Array<keyof typeof cols>).map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.manifestColChip, cols[key] && styles.manifestColChipOn]}
              onPress={() => toggleTemplateCol(key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.manifestColChipText, cols[key] && styles.manifestColChipTextOn]}>
                {key.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.manifestHeaderRow}>
        <View style={[styles.manifestTh, styles.manifestColIdentity]}>
          <Text style={styles.manifestThText}>Trip identity</Text>
        </View>
        <View style={[styles.manifestTh, styles.manifestColTelemetry, styles.manifestThDivider]}>
          <Text style={styles.manifestThText}>Telemetry path</Text>
        </View>
        <View
          style={[
            styles.manifestTh,
            styles.manifestColEarnings,
            styles.manifestThDivider,
            styles.manifestThAlignEnd,
          ]}
        >
          <Text style={[styles.manifestThText, styles.manifestThTextRight]}>
            Audit ledger
          </Text>
        </View>
        <View
          style={[
            styles.manifestTh,
            styles.manifestColReceivable,
            styles.manifestThDivider,
            styles.manifestThAlignEnd,
          ]}
        >
          <Text style={[styles.manifestThText, styles.manifestThTextRight]}>
            {tr("tripsHubMetricGroupReceivable")}
          </Text>
        </View>
        <View
          style={[
            styles.manifestTh,
            styles.manifestColPayable,
            styles.manifestThDivider,
            styles.manifestThAlignEnd,
          ]}
        >
          <Text style={[styles.manifestThText, styles.manifestThTextRight]}>
            {tr("tripsHubMetricGroupPayable")}
          </Text>
        </View>
        <View style={[styles.manifestTh, styles.manifestColActions, styles.manifestThDivider]}>
          <Text style={[styles.manifestThText, styles.manifestThTextCenter]}>Health</Text>
        </View>
      </View>

      {templateTrips.map((t) => {
        const entries = transactionsByTripId.get(t.id) ?? [];
        const rowAdj = tripFinanceAdjForHubLookup(financeAdjustmentsByTripId, t.id);
        const mySales = tripHubRevenue(t, currentOrganizationId, rowAdj);
        const cost = tripHubCost(t, currentOrganizationId, rowAdj);
        const ledgerRoll = summarizeTripLedgerForHub(entries);
        const hasLedgerMismatch = entries.some(
          (r) => r.reconciliation_status === "mismatch",
        );
        const hasSalesConflict = hasLedgerMismatch;
        const aggregate = isAggregateTrip(t);
        // Keep Trips hub labels aligned with Trip Detail header semantics:
        // aggregate is determined by supplier linkage, not by assignment completeness.
        const showAssetTripIcon = !aggregate;
        const typeLabel = showAssetTripIcon ? tr("tripAsset") : tr("tripAggregate");
        const subTypeLabel = aggregate ? tr("integrated") : tr("manual");
        const routeShort = `${t.pickup_area ?? "—"} → ${t.drop_location ?? "—"}`;
        const routeDisplay = routeShort.toUpperCase();
        const pnl = tripHubPnl(t, currentOrganizationId, rowAdj);
        const marginPct = marginPercentLabel(t, currentOrganizationId, rowAdj);
        const displayClient = (clientNameByTripId?.[t.id] ?? t.client_name ?? "").trim();
        const meta = partyMetaByTripId?.get(t.id);
        const supplierLine = (meta?.displaySupplierName ?? "").trim() || "—";
        const clientOrgFields = linkedOrgAvatarFields(
          meta?.clientLinkedOrgId,
          linkedOrgByOrganizationId,
        );
        const supplierOrgFields = linkedOrgAvatarFields(
          meta?.supplierLinkedOrgId,
          linkedOrgByOrganizationId,
        );
        const showSupplierParty =
          (supplierLine !== "—" && supplierLine.trim() !== "") ||
          aggregate ||
          isLoadBasedTrip(t);
        const driverFb = t.driver_id
          ? `driver-entity:${String(t.driver_id).trim()}`
          : `driver-trip:${t.id}`;
        /** Payable leg = supplier; show resolved supplier name for column header. */
        const payablePartyName =
          supplierLine !== "—"
            ? supplierLine
            : showSupplierParty
              ? tr("tripsHubAwaitingData")
              : "—";
        const expanded = expandedIds.has(t.id);
        const sortedEntries = sortedTripLedger(entries);
        const filterKind = classifyTripFilter(t);
        const stageTag = getStageLabel(t).toUpperCase();
        const receivableTarget = Math.max(mySales, 0);
        const payableTarget = Math.max(cost, 0);
        const receivedActual = Math.max(ledgerRoll.receivedTotal, 0);
        const paidActual = Math.max(ledgerRoll.paidTotal, 0);
        const pendingReceivable = Math.max(receivableTarget - receivedActual, 0);
        const pendingPayable = Math.max(payableTarget - paidActual, 0);
        const recvBarPct =
          receivableTarget > 0
            ? Math.min(100, (receivedActual / receivableTarget) * 100)
            : 0;
        const payBarPct =
          payableTarget > 0
            ? Math.min(100, (paidActual / payableTarget) * 100)
            : 0;
        const clientRecvLabel = (displayClient || tr("tripsHubAwaitingData")).trim();
        const clientRecvRenderable = partyAvatarHasRenderableOutput({
          name: clientRecvLabel,
          organizationImageUrl: clientOrgFields.organizationImageUrl,
          organizationAvatarSeed: clientOrgFields.organizationAvatarSeed,
          avatarUrl: meta?.clientAvatarUrl,
          avatarSeed: meta?.clientAvatarSeed,
          entityType: "client",
        });
        const supplierPayLabel =
          payablePartyName === "—" ? "" : payablePartyName.trim();
        const supplierPayRenderable = partyAvatarHasRenderableOutput({
          name: supplierPayLabel || tr("tripsHubAwaitingData"),
          organizationImageUrl: supplierOrgFields.organizationImageUrl,
          organizationAvatarSeed: supplierOrgFields.organizationAvatarSeed,
          avatarUrl: meta?.supplierAvatarUrl,
          avatarSeed: meta?.supplierAvatarSeed,
          entityType: "supplier",
        });
        const vehicleLine = (t.vehicle_display_number ?? "").trim();
        const payableKindLabel = !aggregate
          ? tr("tripsHubColVehicle")
          : tr("tripsHubSupplierShort");
        const payableNameDisplay = !aggregate
          ? (vehicleLine || tr("tripsHubAwaitingData"))
          : payablePartyName === "—"
            ? "—"
            : payablePartyName.toUpperCase();
        const payableStatusLine = !aggregate
          ? payableTarget > 0
            ? `${tr("tripsHubColCost").toUpperCase()} ${formatINR(payableTarget)}`
            : "NO VEHICLE EXPENSE"
          : pendingPayable > 0
            ? `${tr("tripsHubColDue")} ${formatINR(pendingPayable)}`
            : tr("tripsHubSettlementSettled").toUpperCase();

        return (
          <View key={t.id} style={styles.auditRowGroup}>
            <Pressable
              style={({ pressed }) => [
                styles.auditTr,
                pressed && styles.auditTrPressed,
                rowWebCursor,
              ]}
              onPress={() => toggleExpanded(t.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${getTripDisplayNumber(t)} ${expanded ? tr("tripsHubCollapseRow") : tr("tripsHubExpandRow")}`}
            >
              {hasSalesConflict ? <View style={styles.mismatchStripe} /> : null}
              <View style={[styles.manifestTd, styles.manifestColIdentity]}>
                <View style={styles.manifestIdentityRow}>
                  <View
                    style={[
                      styles.auditTruckWrap,
                      hasSalesConflict ? styles.auditTruckWrapWarn : styles.auditTruckWrapOk,
                    ]}
                  >
                    <HubIconPulse>
                      <FontAwesome
                        name={showAssetTripIcon ? "truck" : "link"}
                        size={13}
                        color={
                          hasSalesConflict
                            ? Theme.teslaRed
                            : showAssetTripIcon
                              ? Theme.textSecondary
                              : Theme.textMuted
                        }
                      />
                    </HubIconPulse>
                  </View>
                  <View style={styles.auditIdentityText}>
                    <Text style={[styles.auditTripId, styles.auditTripIdEmphasis]} numberOfLines={1}>
                      {getTripDisplayNumber(t)}
                    </Text>
                    <Text style={styles.manifestDateMeta} numberOfLines={1}>
                      {formatTripPickupCell(t.pickup_date)}
                    </Text>
                    <View style={[styles.tableBadgeRowLeft, styles.manifestIdentityBadges]}>
                      <View style={styles.tableBadgeBlue}>
                        <Text style={styles.tableBadgeBlueText}>{typeLabel}</Text>
                      </View>
                      <View style={styles.tableBadgeViolet}>
                        <Text style={styles.tableBadgeVioletText}>{subTypeLabel}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View style={[styles.manifestTd, styles.manifestColTelemetry]}>
                <Text style={styles.manifestRouteOnly} numberOfLines={2}>
                  {routeDisplay}
                </Text>
                <View
                  style={[
                    styles.manifestTelemetryStatusTag,
                    filterKind === "verified"
                      ? styles.manifestTelemetryStatusTagVerified
                      : filterKind === "attention"
                        ? styles.manifestTelemetryStatusTagAttention
                        : styles.manifestTelemetryStatusTagPending,
                  ]}
                >
                  <Text style={styles.manifestTelemetryStatusTagText} numberOfLines={1}>
                    {stageTag}
                  </Text>
                </View>
                <View style={styles.manifestTelemetryOperatorRow}>
                  <HubPartyAvatar
                    size="compact"
                    entityType="driver"
                    avatarUrl={meta?.driverAvatarUrl}
                    avatarSeed={meta?.driverAvatarSeed}
                    fallbackSeed={driverFb}
                    partyLabel={(t.driver_display_name ?? "").trim()}
                  />
                  <View style={styles.manifestOperatorTextCol}>
                    <Text style={styles.manifestOperatorName} numberOfLines={1}>
                      {(t.driver_display_name ?? "—").trim().toUpperCase() || "—"}
                    </Text>
                    <Text style={styles.manifestDateMeta} numberOfLines={1}>
                      {(t.vehicle_display_number ?? "—").trim().toUpperCase() || "—"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.manifestTd, styles.manifestColEarnings, styles.manifestTdRight]}>
                <Text style={styles.manifestMoneyMain}>{formatINR(mySales)}</Text>
                <Text style={styles.manifestLedgerSubLine}>
                  <Text style={styles.manifestLedgerSubLabel}>
                    {tr("tripsHubColCost").toUpperCase()}{" "}
                  </Text>
                  {formatINR(cost)}
                </Text>
                <Text style={styles.manifestLedgerSubLine} numberOfLines={1}>
                  <Text style={styles.manifestLedgerSubLabel}>
                    {tr("tripsHubMarginSuffix").toUpperCase()}{" "}
                  </Text>
                  {formatINR(pnl)} · {marginPct}
                </Text>
              </View>

              <View
                style={[
                  styles.manifestTd,
                  styles.manifestColReceivable,
                  styles.manifestSettlementCell,
                ]}
              >
                <View
                  style={[
                    styles.manifestSettlementCard,
                    compactSettlement && styles.manifestSettlementCardCompact,
                  ]}
                >
                  <View style={styles.manifestSettlementHeaderRow}>
                    <View style={styles.manifestSettlementHeaderTextCol}>
                      <Text style={styles.manifestSettlementPartyKindCard}>
                        {tr("tripsHubColClient")}
                      </Text>
                      <Text
                        style={styles.manifestSettlementPartyNameCard}
                        numberOfLines={compactSettlement ? 1 : 2}
                      >
                        {clientRecvLabel.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.manifestSettlementIconChipRecv}>
                      <View style={[styles.manifestSettlementChipOrb, styles.manifestSettlementChipOrbRecvA]} />
                      <View style={[styles.manifestSettlementChipOrb, styles.manifestSettlementChipOrbRecvB]} />
                      {clientRecvRenderable ? (
                        <View style={styles.manifestSettlementAvatarRingRecv}>
                          <HubPartyAvatar
                            size="compact"
                            entityType="client"
                            avatarUrl={meta?.clientAvatarUrl}
                            avatarSeed={meta?.clientAvatarSeed}
                            fallbackSeed={
                              meta?.clientFallbackSeed ?? `client-trip:${t.id}`
                            }
                            partyLabel={clientRecvLabel}
                            organizationImageUrl={clientOrgFields.organizationImageUrl}
                            organizationAvatarSeed={clientOrgFields.organizationAvatarSeed}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.manifestSettlementAvatarPh,
                            styles.manifestSettlementPhRecv,
                          ]}
                        >
                          <FontAwesome
                            name="user"
                            size={11}
                            color={Theme.textMuted}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                  {receivableTarget > 0 && !compactSettlement ? (
                    <View style={styles.manifestSettlementFiscalBarTrack}>
                      <View
                        style={[
                          styles.manifestSettlementFiscalBarFill,
                          styles.manifestSettlementFiscalBarFillRecv,
                          { width: `${recvBarPct}%` },
                        ]}
                      />
                    </View>
                  ) : null}
                  <Text
                    style={[
                      styles.manifestMoneyMain,
                      styles.manifestMoneyMainInSettlementCard,
                      compactSettlement && styles.manifestSettlementTargetCompact,
                      pendingReceivable <= 0 && styles.manifestSettlementAmount,
                    ]}
                  >
                    {formatINR(receivableTarget)}
                  </Text>
                  <View style={styles.manifestSettlementDuoRow}>
                    <Text
                      style={styles.manifestSettlementDuoLeft}
                      numberOfLines={1}
                    >
                      {tr("tripsHubTableRecvPrefix")}: {formatINR(receivedActual)}
                    </Text>
                    <Text
                      style={[
                        styles.manifestSettlementDuoRight,
                        pendingReceivable > 0
                          ? styles.manifestSettlementDuoRightRecvDue
                          : styles.manifestSettlementDuoRightOk,
                      ]}
                      numberOfLines={1}
                    >
                      {pendingReceivable > 0
                        ? `${tr("tripsHubColDue")} ${formatINR(pendingReceivable)}`
                        : tr("tripsHubSettlementCleared").toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.manifestTd,
                  styles.manifestColPayable,
                  styles.manifestSettlementCell,
                ]}
              >
                <View
                  style={[
                    styles.manifestSettlementCard,
                    compactSettlement && styles.manifestSettlementCardCompact,
                  ]}
                >
                  <View style={styles.manifestSettlementHeaderRow}>
                    <View style={styles.manifestSettlementHeaderTextCol}>
                      <Text style={styles.manifestSettlementPartyKindCard}>
                        {payableKindLabel}
                      </Text>
                      <Text
                        style={styles.manifestSettlementPartyNameCard}
                        numberOfLines={compactSettlement ? 1 : 2}
                      >
                        {payableNameDisplay}
                      </Text>
                    </View>
                    <View style={styles.manifestSettlementIconChipPay}>
                      <View style={[styles.manifestSettlementChipOrb, styles.manifestSettlementChipOrbPayA]} />
                      <View style={[styles.manifestSettlementChipOrb, styles.manifestSettlementChipOrbPayB]} />
                      {aggregate && supplierPayRenderable && showSupplierParty ? (
                        <View style={styles.manifestSettlementAvatarRingPay}>
                          <HubPartyAvatar
                            size="compact"
                            entityType="supplier"
                            avatarUrl={meta?.supplierAvatarUrl}
                            avatarSeed={meta?.supplierAvatarSeed}
                            fallbackSeed={
                              meta?.supplierFallbackSeed ?? `supplier-trip:${t.id}`
                            }
                            partyLabel={
                              supplierPayLabel || tr("tripsHubAwaitingData")
                            }
                            organizationImageUrl={supplierOrgFields.organizationImageUrl}
                            organizationAvatarSeed={supplierOrgFields.organizationAvatarSeed}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.manifestSettlementAvatarPh,
                            styles.manifestSettlementPhPay,
                          ]}
                        >
                          <FontAwesome
                            name="truck"
                            size={11}
                            color={Theme.textMuted}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                  {payableTarget > 0 && !compactSettlement ? (
                    <View style={styles.manifestSettlementFiscalBarTrack}>
                      <View
                        style={[
                          styles.manifestSettlementFiscalBarFill,
                          styles.manifestSettlementFiscalBarFillPay,
                          { width: `${payBarPct}%` },
                        ]}
                      />
                    </View>
                  ) : null}
                  <Text
                    style={[
                      styles.manifestMoneyMain,
                      styles.manifestMoneyMainInSettlementCard,
                      compactSettlement && styles.manifestSettlementTargetCompact,
                      pendingPayable <= 0 && styles.manifestSettlementAmount,
                    ]}
                  >
                    {formatINR(payableTarget)}
                  </Text>
                  <View style={styles.manifestSettlementDuoRow}>
                    <Text
                      style={styles.manifestSettlementDuoLeft}
                      numberOfLines={1}
                    >
                      {tr("tripsHubTablePayPrefix")}: {formatINR(paidActual)}
                    </Text>
                    <Text
                      style={[
                        styles.manifestSettlementDuoRight,
                        pendingPayable > 0
                          ? styles.manifestSettlementDuoRightPayDue
                          : styles.manifestSettlementDuoRightOk,
                      ]}
                      numberOfLines={1}
                    >
                      {payableStatusLine}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.manifestTd, styles.manifestColActions]}>
                <View style={styles.auditCellIconRow}>
                  <View
                    style={[
                      styles.manifestHealthDot,
                      filterKind === "verified"
                        ? styles.manifestHealthDotGood
                        : filterKind === "attention"
                          ? styles.manifestHealthDotBad
                          : styles.manifestHealthDotWarn,
                    ]}
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.auditIconAction,
                      styles.auditIconActionTxn,
                      pressed && styles.auditCtaPressed,
                    ]}
                    onPress={() => toggleExpanded(t.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={
                      expanded
                        ? tr("tripsHubHideTransactions")
                        : tr("tripsHubShowTransactions")
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <FontAwesome
                      name={expanded ? "chevron-up" : "list-ul"}
                      size={8}
                      color={Theme.textPrimaryDark}
                    />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.auditIconAction,
                      expanded
                        ? styles.auditIconActionTxnExpanded
                        : styles.auditIconActionTrip,
                      pressed && styles.auditCtaPressed,
                    ]}
                    onPress={() => onOpenTripDetails(t)}
                    accessibilityRole="button"
                    accessibilityLabel={tr("tripsHubViewTripDetails")}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <FontAwesome
                      name="external-link"
                      size={8}
                      color={Theme.textPrimaryDark}
                    />
                  </Pressable>
                </View>
              </View>
            </Pressable>

            {expanded ? (
              <View style={styles.expandPanel}>
                {sortedEntries.length === 0 ? (
                  <Text style={styles.expandEmpty}>{tr("tripsHubNoTransactions")}</Text>
                ) : (
                  <>
                    <View style={styles.txnSectionHead}>
                      <View style={styles.txnSectionHeadLeft}>
                        <FontAwesome
                          name="exchange"
                          size={12}
                          color={Theme.primary}
                        />
                        <Text style={styles.txnSectionTitle} numberOfLines={2}>
                          {tr("tripsHubLedgerStripTitle")} ({sortedEntries.length})
                        </Text>
                      </View>
                      <View style={styles.txnSectionHeadRight}>
                        <View style={styles.txnVerifiedBadge}>
                          <Text style={styles.txnVerifiedBadgeText}>
                            {tr("tripsHubTableSync")}
                          </Text>
                        </View>
                        <Pressable
                          style={({ pressed }) => [
                            styles.txnStripClose,
                            pressed && styles.auditCtaPressed,
                          ]}
                          onPress={() => toggleExpanded(t.id)}
                          accessibilityRole="button"
                          accessibilityLabel={tr("tripsHubLedgerStripClose")}
                          hitSlop={10}
                        >
                          <FontAwesome
                            name="times"
                            size={12}
                            color={Theme.textMuted}
                          />
                        </Pressable>
                      </View>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.txnHorizontalList}
                    >
                      {sortedEntries.map((row) => {
                        const when = formatLedgerDateTime(
                          row.transaction_date || row.created_at,
                        );
                        const amt = txnAmount(row);
                        const inFlow = (row.amount_in ?? 0) > 0;
                        const counterparty =
                          (row.party_name ?? row.driver_name ?? row.contact_type ?? "Party")
                            .trim()
                            .slice(0, 26) || "Party";
                        return (
                          <Pressable
                            key={row.id}
                            style={[
                              styles.txnVaultCard,
                              inFlow ? styles.txnVaultCardIn : styles.txnVaultCardOut,
                            ]}
                            onPress={() => setReceiptTx({ trip: t, row })}
                            accessibilityRole="button"
                            accessibilityLabel="Open transaction receipt"
                          >
                            <View style={styles.txnVaultLeft}>
                              <View
                                style={[
                                  styles.txnVaultIcon,
                                  inFlow ? styles.txnVaultIconIn : styles.txnVaultIconOut,
                                ]}
                              >
                                <FontAwesome
                                  name={inFlow ? "arrow-down" : "arrow-up"}
                                  size={14}
                                  color={inFlow ? Theme.darkGreen : Theme.teslaRed}
                                />
                              </View>
                              <View style={styles.txnLineLeft}>
                                <View style={styles.txnFlowRow}>
                                  <Text
                                    style={[styles.txnFlow, inFlow ? styles.txnFlowIn : styles.txnFlowOut]}
                                    numberOfLines={1}
                                  >
                                    {inFlow ? "RECEIVED" : "PAID"}
                                  </Text>
                                  <Text style={styles.txnFlowSep}>/</Text>
                                  <Text style={styles.txnCounterparty} numberOfLines={1}>
                                    {counterparty}
                                  </Text>
                                </View>
                                <Text style={styles.txnWhen} numberOfLines={1}>
                                  {when}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.txnAmtWrap}>
                              <Text style={[styles.txnAmt, inFlow ? styles.txnAmtIn : styles.txnAmtOut]}>
                                {inFlow ? "+" : "-"}
                                {formatINR(Math.abs(amt))}
                              </Text>
                              <Text style={styles.txnReceiptLink}>View Receipt</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                      <View
                        style={styles.txnPostTxnStub}
                        accessibilityLabel={tr("tripsHubPostTxnSync")}
                      >
                        <FontAwesome
                          name="plus-circle"
                          size={20}
                          color={Theme.textSection}
                        />
                        <Text style={styles.txnPostTxnStubText}>
                          {tr("tripsHubPostTxnSync")}
                        </Text>
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.auditFooter}>
        <View style={styles.auditFooterLeft}>
          <View style={styles.auditFooterIcon}>
            <FontAwesome name="line-chart" size={16} color={Theme.positive} />
          </View>
          <View>
            <Text style={styles.auditFooterTitle}>{tr("tripsHubFleetConfidence")}</Text>
            <Text style={styles.auditFooterSub}>{tr("tripsHubNetworkMirror")}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.auditExportBtn,
            !onExportLedger && styles.auditExportBtnDisabled,
          ]}
          onPress={() => onExportLedger?.()}
          disabled={!onExportLedger}
          activeOpacity={0.85}
        >
          <Text style={styles.auditExportBtnText}>{tr("tripsHubExportLedger")}</Text>
          <FontAwesome name="cloud-download" size={14} color={Theme.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={receiptTx != null}
        animationType="fade"
        transparent
        onRequestClose={() => setReceiptTx(null)}
      >
        <View style={styles.receiptBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setReceiptTx(null)}
            accessibilityRole="button"
            accessibilityLabel="Close receipt popup"
          />
          {receiptTx ? (
            <View
              style={[
                styles.receiptSheet,
                { paddingBottom: Math.max(insets.bottom, 12) + 10 },
              ]}
            >
              {(() => {
                const receiptTrip = receiptTx.trip;
                const txRow = receiptTx.row;
                const txAmount = Number(txRow?.amount_in ?? txRow?.amount_out ?? 0);
                const txDate = formatLedgerDateTime(
                  txRow?.transaction_date || txRow?.created_at || receiptTrip.pickup_date,
                );
                const txMode = (txRow?.payment_mode ?? "Bank").trim() || "Bank";
                const settledTo =
                  (txRow?.party_name ?? clientNameByTripId?.[receiptTrip.id] ?? receiptTrip.client_name ?? "—")
                    .trim() || "—";
                const txRef = (txRow?.payment_reference ?? "—").trim() || "—";
                return (
                  <>
              <View style={styles.receiptHead}>
                <View style={styles.receiptHeadLeft}>
                  <Text style={styles.receiptParty} numberOfLines={1}>
                    {(
                      clientNameByTripId?.[receiptTrip.id] ??
                      receiptTrip.client_name ??
                      "—"
                    )
                      .trim()
                      .toUpperCase()}
                  </Text>
                  <Text style={styles.receiptSub}>
                    {getTripDisplayNumber(receiptTrip)} •{" "}
                    {formatTripPickupCell(receiptTrip.pickup_date).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.receiptAmount}>
                  {txAmount >= 0 ? "+" : "-"}
                  {formatINR(Math.abs(txAmount))}
                </Text>
              </View>

              <View style={styles.receiptCenter}>
                <View style={styles.receiptSuccessDot}>
                  <FontAwesome name="check" size={22} color={Theme.driverEmerald} />
                </View>
                <Text style={styles.receiptSuccessLabel}>SETTLEMENT RECEIVED</Text>
                <Text style={styles.receiptCenterAmount}>
                  {formatINR(Math.abs(txAmount))}
                </Text>
              </View>

              <View style={styles.receiptMetaList}>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaLabel}>Transaction ID</Text>
                  <Text style={styles.receiptMetaValue}>{txRow?.id ?? receiptTrip.id}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaLabel}>UTR / Reference</Text>
                  <Text style={styles.receiptMetaValue}>{txRef}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaLabel}>Payment Mode</Text>
                  <Text style={styles.receiptMetaValue}>{txMode}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaLabel}>Captured At</Text>
                  <Text style={styles.receiptMetaValue}>{txDate}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaLabel}>Reference</Text>
                  <Text style={styles.receiptMetaValue}>
                    {getTripDisplayNumber(receiptTrip)}
                  </Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaLabel}>Settled To</Text>
                  <Text style={styles.receiptMetaValue}>{settledTo}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaLabel}>Route</Text>
                  <Text style={styles.receiptMetaValue}>
                    {(receiptTrip.pickup_area ?? "—").trim()} →{" "}
                    {(receiptTrip.drop_location ?? "—").trim()}
                  </Text>
                </View>
              </View>

              <View style={styles.receiptActions}>
                <TouchableOpacity
                  style={[styles.receiptBtn, styles.receiptBtnSecondary]}
                  onPress={() => {
                    setReceiptTx(null);
                    onOpenTripDetails(receiptTrip);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.receiptBtnSecondaryText}>VIEW TRIP DETAIL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.receiptBtn, styles.receiptBtnPrimary]}
                  onPress={async () => {
                    setReceiptTx(null);
                    try {
                      const routeLabel = `${(receiptTrip.pickup_area ?? "—").trim()} -> ${(receiptTrip.drop_location ?? "—").trim()}`;
                      const receiptTextPayload = [
                        "Settlement Receipt",
                        `Trip: ${getTripDisplayNumber(receiptTrip)}`,
                        `Amount: ${formatINR(Math.abs(txAmount))}`,
                        `Date: ${txDate}`,
                        `Transaction ID: ${txRow?.id ?? receiptTrip.id}`,
                        `UTR / Reference: ${txRef}`,
                        `Payment Mode: ${txMode}`,
                        `Settled To: ${settledTo}`,
                        `Route: ${routeLabel}`,
                      ].join("\n");

                      if (Platform.OS === "web" && typeof window !== "undefined") {
                        const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Settlement Receipt</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; padding: 24px; color: #0f172a; }
      h2 { margin: 0 0 8px 0; }
      .sub { margin: 0 0 16px 0; color: #64748b; }
      h1 { margin: 0 0 20px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 8px 0; vertical-align: top; }
      td:first-child { color: #64748b; width: 45%; }
      td:last-child { text-align: right; }
    </style>
  </head>
  <body>
    <h2>Settlement Receipt</h2>
    <p class="sub">${getTripDisplayNumber(receiptTrip)} • ${txDate}</p>
    <h1>${formatINR(Math.abs(txAmount))}</h1>
    <table>
      <tr><td>Transaction ID</td><td>${txRow?.id ?? receiptTrip.id}</td></tr>
      <tr><td>UTR / Reference</td><td>${txRef}</td></tr>
      <tr><td>Payment Mode</td><td>${txMode}</td></tr>
      <tr><td>Settled To</td><td>${settledTo}</td></tr>
      <tr><td>Route</td><td>${routeLabel}</td></tr>
    </table>
  </body>
</html>`;
                        const previewWindow = window.open("", "_blank");
                        if (previewWindow) {
                          previewWindow.document.open();
                          previewWindow.document.write(html);
                          previewWindow.document.close();
                          previewWindow.focus();
                          previewWindow.print();
                        } else {
                          await Share.share({ message: receiptTextPayload });
                        }
                      } else {
                        await Share.share({ message: receiptTextPayload });
                      }
                    } catch {
                      // no-op
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.receiptBtnPrimaryText}>PDF PREVIEW</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.receiptBtn, styles.receiptBtnSecondary, styles.receiptBtnShare]}
                  onPress={async () => {
                    try {
                      await Share.share({
                        message: `Settlement ${formatINR(Math.abs(txAmount))}\nReference: ${getTripDisplayNumber(receiptTrip)}`,
                      });
                    } catch {
                      // no-op
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <FontAwesome name="share-alt" size={12} color={Theme.textSecondary} />
                </TouchableOpacity>
              </View>
                  </>
                );
              })()}
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={columnPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setColumnPickerOpen(false)}
      >
        <View style={styles.colPickerBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setColumnPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={tr("tripsHubColumnPickerDone")}
          />
          <View
            style={[
              styles.colPickerSheet,
              { paddingBottom: Math.max(insets.bottom, 12) + 12 },
            ]}
          >
            <Text style={styles.colPickerTitle}>{tr("tripsHubColumnPickerTitle")}</Text>
            <Text style={styles.colPickerHint}>{tr("tripsHubColumnPickerHint")}</Text>
            <ScrollView
              style={styles.colPickerScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {HUB_COLUMN_ORDER.map((id) => (
                <View key={id} style={styles.colPickerRow}>
                  <Text style={styles.colPickerRowLabel}>{tr(HUB_COLUMN_LABEL[id])}</Text>
                  <Switch
                    value={visibleCols[id]}
                    onValueChange={(v) => setCol(id, v)}
                    trackColor={{
                      false: Theme.borderMedium,
                      true: Theme.textPrimaryDark,
                    }}
                    thumbColor={
                      visibleCols[id] ? Theme.screenBackground : Theme.surface
                    }
                  />
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.colPickerDone}
              onPress={() => setColumnPickerOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.colPickerDoneText}>{tr("tripsHubColumnPickerDone")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fleetCardOuter: {
    marginBottom: 10,
  },
  fleetCard: {
    backgroundColor: Theme.surface,
    borderRadius: 22,
    padding: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
  },
  fleetOrb: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.04,
  },
  fleetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    zIndex: 1,
  },
  fleetHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  fleetTruckWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  fleetHeadText: { flex: 1, minWidth: 0 },
  fleetBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 3 },
  fleetBadgeBlue: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  fleetBadgeBlueText: {
    fontSize: FS_CAPTION,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fleetBadgeViolet: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  fleetBadgeVioletText: {
    fontSize: FS_CAPTION,
    fontWeight: "900",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fleetTripId: {
    fontSize: FS_AMOUNT,
    fontWeight: "900",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
    textTransform: "uppercase",
  },
  fleetHeadRight: { alignItems: "flex-end", gap: 4 },
  fleetMissionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  fleetMissionPillUnassigned: {
    backgroundColor: Theme.tripHubUnassignedPillBg,
    borderColor: Theme.textPrimaryDark,
  },
  fleetMissionPillRose: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.teslaRed,
  },
  fleetMissionPillEmerald: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  fleetMissionPillText: {
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fleetMissionPillTextUnassigned: {
    color: Theme.textPrimaryDark,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  fleetMissionPillTextRose: { color: Theme.teslaRed },
  fleetMissionPillTextEmerald: { color: Theme.darkGreen },
  fleetAging: {
    fontSize: FS_CAPTION,
    fontWeight: "900",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fleetManifest: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 8,
    zIndex: 1,
  },
  fleetManifestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    marginBottom: 8,
  },
  fleetManifestCol: { flex: 1, minWidth: 0 },
  fleetManifestColEnd: { alignItems: "flex-end" },
  fleetManifestOrigin: {
    fontSize: FS_ROUTE_HERO,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textRouteCard,
    letterSpacing: -0.2,
    lineHeight: 15,
  },
  fleetManifestDest: {
    fontSize: FS_ROUTE_HERO,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textRouteCard,
    textAlign: "right",
    letterSpacing: -0.2,
    lineHeight: 15,
  },
  fleetProgHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  fleetProgHeadMuted: {
    fontSize: FS_CAPTION,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fleetProgHeadIndigo: {
    fontSize: FS_CAPTION,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fleetProgSegmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fleetProgSegment: {
    flex: 1,
    height: 5 ,
    borderRadius: 5,
  },
  fleetProgSegmentFilled: {
    backgroundColor: Theme.darkGreen,
  },
  fleetProgSegmentEmpty: {
    backgroundColor: Theme.surfaceBorder,
  },
  fleetFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 8,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    zIndex: 1,
  },
  fleetFooterLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  fleetTrendWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  fleetRevSnapLabel: {
    fontSize: FS_CAPTION,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  fleetRevSnapVal: {
    marginTop: 0,
    fontSize: FS_AMOUNT,
    fontWeight: "900",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
  },
  fleetPartyBlock: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    zIndex: 1,
  },
  fleetPartyLabel: {
    fontSize: FS_CAPTION,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fleetPartyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  fleetPartyCol: { flex: 1, minWidth: 0 },
  fleetPartyColEnd: { alignItems: "flex-end" },
  fleetPartyName: {
    marginTop: 2,
    fontSize: FS_LABEL,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  fleetPartySub: {
    marginTop: 2,
    fontSize: FS_CAPTION,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  fleetPartySubAlignEnd: { textAlign: "right", alignSelf: "stretch" },
  fleetPartyLabelAlignEnd: { textAlign: "right", alignSelf: "stretch" },
  hubPartyAvatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
  },
  hubPartyAvatarImg: {
    width: 34,
    height: 34,
  },
  hubTableAvatarRing: {
    width: HUB_TABLE_AVATAR,
    height: HUB_TABLE_AVATAR,
    borderRadius: HUB_TABLE_AVATAR / 2,
    overflow: "hidden",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexShrink: 0,
  },
  hubTableAvatarImg: {
    width: HUB_TABLE_AVATAR,
    height: HUB_TABLE_AVATAR,
  },
  manifestOperatorTextCol: {
    flex: 1,
    minWidth: 0,
  },
  manifestTelemetryOperatorRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  manifestIdentityBadges: {
    marginTop: 2,
  },
  manifestTelemetryStatusTag: {
    marginTop: 3,
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  manifestTelemetryStatusTagVerified: {
    backgroundColor: Theme.positiveMuted,
    borderColor: "rgba(21, 128, 61, 0.32)",
  },
  manifestTelemetryStatusTagPending: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.3)",
  },
  manifestTelemetryStatusTagAttention: {
    backgroundColor: "rgba(232, 33, 39, 0.12)",
    borderColor: "rgba(232, 33, 39, 0.32)",
  },
  manifestTelemetryStatusTagText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  fleetPartyAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  fleetPartyAvatarRowEnd: {
    justifyContent: "flex-end",
  },
  fleetPartyTextStack: {
    flex: 1,
    minWidth: 0,
  },
  fleetPartyTextStackEnd: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  fleetPartyColWithAvatar: {
    minWidth: 0,
  },
  fleetMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
    zIndex: 1,
  },
  fleetMetricCell: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 64,
    backgroundColor: Theme.screenBackground,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  fleetMetricLabel: {
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fleetMetricVal: {
    marginTop: 2,
    fontSize: FS_BODY,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.25,
  },
  fleetMetricPct: {
    marginTop: 1,
    fontSize: FS_CAPTION,
    fontWeight: "900",
    color: Theme.textSecondary,
  },
  fleetMetricMeta: {
    marginTop: 2,
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "800",
    color: Theme.textMuted,
    lineHeight: 11,
  },
  auditTableWrap: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  auditToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    rowGap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  auditToolbarCount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  auditToolbarControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  auditSearchWrap: {
    height: 36,
    minWidth: 260,
    maxWidth: 380,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  auditSearchInput: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 0,
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "600",
  },
  auditToolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  auditToolbarText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },
  manifestFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: Theme.screenBackground,
  },
  manifestFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  manifestFilterPillOn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  manifestFilterPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  manifestFilterPillTextOn: {
    color: Theme.textOnDark,
  },
  manifestColPanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  manifestColChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  manifestColChipOn: {
    backgroundColor: Theme.fiscalTabActiveBg,
    borderColor: Theme.borderMedium,
  },
  manifestColChipText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.3,
  },
  manifestColChipTextOn: {
    color: Theme.primary,
  },
  manifestHeaderRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.textPrimaryDark,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderOnDark,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 4,
  },
  manifestTh: {
    minWidth: 0,
    justifyContent: "center",
  },
  manifestThText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.65,
  },
  manifestThTextCenter: {
    textAlign: "center",
  },
  manifestThTextRight: {
    textAlign: "right",
  },
  manifestThDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth * 2,
    borderLeftColor: "rgba(255,255,255,0.12)",
  },
  manifestThAlignEnd: {
    alignItems: "flex-end",
  },
  manifestTd: {
    minWidth: 0,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingVertical: 1,
  },
  manifestTdCenter: {
    alignItems: "center",
  },
  manifestTdRight: {
    alignItems: "flex-end",
  },
  manifestColIdentity: {
    width: "22%",
    minWidth: 208,
  },
  manifestColTelemetry: {
    width: "20%",
    minWidth: 190,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 6,
  },
  manifestColEarnings: {
    width: "12%",
    minWidth: 116,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 6,
  },
  manifestColReceivable: {
    width: "20%",
    minWidth: 170,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 6,
  },
  manifestColPayable: {
    width: "20%",
    minWidth: 170,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 6,
  },
  manifestColActions: {
    width: "6%",
    minWidth: 72,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    alignItems: "center",
    paddingLeft: 0,
  },
  manifestIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  manifestDateMeta: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  manifestOperatorName: {
    fontSize: 10.5,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    width: "100%",
  },
  manifestLedgerSubLine: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "right",
    width: "100%",
  },
  manifestLedgerSubLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  /** Settlement column: full-width card (reference: justify-between party vs chip). */
  manifestSettlementCell: {
    alignItems: "stretch",
    alignSelf: "stretch",
  },
  /** Fiscal “node” card — white panel, light shadow, party left / avatar or icon right. */
  manifestSettlementCard: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  manifestSettlementCardCompact: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    gap: 3,
    borderRadius: 12,
  },
  manifestSettlementHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
  },
  manifestSettlementHeaderTextCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  manifestSettlementPartyKindCard: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    textAlign: "left",
    width: "100%",
  },
  manifestSettlementIconChipRecv: {
    backgroundColor: Theme.surface,
    borderRadius: 8,
    padding: 2,
    position: "relative",
    overflow: "hidden",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  manifestSettlementIconChipPay: {
    backgroundColor: Theme.surface,
    borderRadius: 8,
    padding: 2,
    position: "relative",
    overflow: "hidden",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  /** Abstract chip background orbs (inspired by network cards). */
  manifestSettlementChipOrb: {
    position: "absolute",
    borderRadius: 999,
  },
  manifestSettlementChipOrbRecvA: {
    width: 18,
    height: 18,
    right: -5,
    top: -4,
    backgroundColor: "rgba(148, 163, 184, 0.22)",
  },
  manifestSettlementChipOrbRecvB: {
    width: 13,
    height: 13,
    left: -4,
    bottom: -3,
    backgroundColor: "rgba(203, 213, 225, 0.32)",
  },
  manifestSettlementChipOrbPayA: {
    width: 18,
    height: 18,
    right: -5,
    top: -4,
    backgroundColor: "rgba(148, 163, 184, 0.22)",
  },
  manifestSettlementChipOrbPayB: {
    width: 13,
    height: 13,
    left: -4,
    bottom: -3,
    backgroundColor: "rgba(203, 213, 225, 0.32)",
  },
  manifestSettlementAvatarRingRecv: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    padding: 1,
    backgroundColor: Theme.cardWhite,
  },
  manifestSettlementAvatarRingPay: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    padding: 1,
    backgroundColor: Theme.cardWhite,
  },
  manifestSettlementAvatarPh: {
    width: HUB_TABLE_AVATAR,
    height: HUB_TABLE_AVATAR,
    borderRadius: HUB_TABLE_AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  manifestSettlementPhRecv: {
    backgroundColor: Theme.cardWhite,
  },
  manifestSettlementPhPay: {
    backgroundColor: Theme.cardWhite,
  },
  manifestSettlementFiscalBarTrack: {
    marginTop: 0,
    height: 3,
    width: "100%",
    borderRadius: 2,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    overflow: "hidden",
  },
  manifestSettlementFiscalBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  manifestSettlementFiscalBarFillRecv: {
    backgroundColor: Theme.darkGreen,
  },
  manifestSettlementFiscalBarFillPay: {
    backgroundColor: Theme.teslaRed,
  },
  manifestMoneyMainInSettlementCard: {
    marginTop: 1,
  },
  manifestSettlementTargetCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  manifestSettlementPartyNameCard: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    textAlign: "left",
    width: "100%",
  },
  manifestSettlementDuoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    width: "100%",
    marginTop: 1,
  },
  manifestSettlementDuoLeft: {
    flex: 1,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  manifestSettlementDuoRight: {
    flexShrink: 0,
    maxWidth: "52%",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "right",
  },
  manifestSettlementDuoRightOk: {
    color: Theme.darkGreen,
  },
  manifestSettlementDuoRightRecvDue: {
    color: Theme.warning,
  },
  manifestSettlementDuoRightPayDue: {
    color: Theme.teslaRed,
  },
  tableBadgeRowLeft: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
    justifyContent: "flex-start",
    width: "100%",
  },
  tableStatusPillNarrow: {
    marginTop: 2,
    alignSelf: "flex-end",
  },
  /** Pending + INR amount needs a bit more room than CLEARED-only. */
  tableStatusPillWithAmount: {
    minWidth: 0,
    maxWidth: "100%",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  tableStatusPillTextAmount: {
    fontSize: 6.5,
    lineHeight: 9,
    letterSpacing: 0.2,
  },
  manifestProgressTrack: {
    marginTop: 4,
    width: "100%",
    height: 5,
    borderRadius: 999,
    backgroundColor: Theme.surfaceBorder,
    overflow: "hidden",
  },
  manifestProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Theme.darkGreen,
  },
  manifestMoneyMain: {
    fontSize: 14,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    width: "100%",
  },
  manifestMoneySub: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "right",
    width: "100%",
  },
  manifestMoneyGood: {
    color: Theme.darkGreen,
  },
  manifestMoneyBad: {
    color: Theme.teslaRed,
  },
  manifestSettlementAmount: {
    color: Theme.darkGreen,
    marginBottom: 2,
  },
  /** Route-only telemetry cell (no progress / sync lines). */
  manifestRouteOnly: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textRouteCard,
    letterSpacing: 0.2,
    lineHeight: 13,
    textTransform: "uppercase",
    width: "100%",
  },
  manifestHealthDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  manifestHealthDotGood: {
    backgroundColor: Theme.darkGreen,
  },
  manifestHealthDotWarn: {
    backgroundColor: Theme.warning,
  },
  manifestHealthDotBad: {
    backgroundColor: Theme.teslaRed,
  },
  auditHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  auditTh: {
    fontSize: FS_CAPTION,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  auditThCenter: { textAlign: "center", width: "100%" },
  auditThLeft: { textAlign: "left", width: "100%", alignSelf: "stretch" },
  auditThCell: {
    minWidth: 0,
    justifyContent: "center",
    alignItems: "stretch",
  },
  auditThCellStart: {
    justifyContent: "flex-start",
    alignItems: "center",
  },
  auditColIdentity: { flex: 1.25, minWidth: 200, flexDirection: "row", alignItems: "center", gap: 10 },
  auditColStatusType: {
    flex: 0.85,
    minWidth: 128,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditPartyLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    width: "100%",
  },
  auditPartyLineRowSecond: {
    marginTop: 4,
  },
  auditPartyLineText: {
    flex: 1,
    minWidth: 0,
  },
  auditColParty: {
    flex: 0.95,
    minWidth: 132,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColDriver: {
    flex: 0.72,
    minWidth: 100,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColVehicle: {
    flex: 0.55,
    minWidth: 86,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColPickupDate: {
    flex: 0.58,
    minWidth: 88,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColDistance: {
    flex: 0.42,
    minWidth: 72,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColLoadType: {
    flex: 0.58,
    minWidth: 92,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColPayment: {
    flex: 0.62,
    minWidth: 96,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditTdHubStack: {
    alignItems: "stretch",
    justifyContent: "center",
    paddingTop: 0,
    minWidth: 0,
    width: "100%",
  },
  auditTdHubCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 0,
    minWidth: 0,
    width: "100%",
  },
  hubStackValue: {
    fontSize: FS_LABEL,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    width: "100%",
  },
  hubStackValueMono: {
    fontSize: FS_LABEL,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.5,
    width: "100%",
  },
  hubStackSub: {
    marginTop: 4,
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "600",
    color: Theme.textMuted,
    width: "100%",
  },
  hubMetricSingle: {
    fontSize: FS_BODY,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    width: "100%",
  },
  hubPayPill: {
    alignSelf: "center",
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  hubPayPillPaid: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  hubPayPillPartial: {
    backgroundColor: Theme.tripHubUnassignedPillBg,
    borderColor: Theme.textPrimaryDark,
  },
  hubPayPillPending: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
  },
  hubPayPillNeutral: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderMedium,
  },
  hubPayPillText: {
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    textAlign: "center",
  },
  hubPayPillTextPaid: { color: Theme.darkGreen },
  hubPayPillTextPartial: { color: Theme.textPrimaryDark },
  hubPayPillTextPending: { color: Theme.teslaRed },
  hubPayPillTextNeutral: { color: Theme.textSecondary },
  auditColBilled: {
    flex: 1,
    minWidth: 132,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColCost: {
    flex: 0.5,
    minWidth: 84,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColReceived: {
    flex: 0.58,
    minWidth: 96,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColDue: {
    flex: 0.48,
    minWidth: 78,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColMargin: {
    flex: 0.62,
    minWidth: 96,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColLedgerMeta: {
    flex: 0.52,
    minWidth: 88,
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
  },
  auditColAudit: {
    flex: 0.58,
    minWidth: 120,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: Theme.surfaceBorder,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 4,
  },
  auditCellIconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: "100%",
    paddingVertical: 1,
  },
  auditIconAction: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  auditIconActionTxn: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.surfaceBorder,
  },
  auditIconActionTxnExpanded: {
    backgroundColor: Theme.fiscalTabActiveBg,
    borderColor: Theme.borderMedium,
  },
  auditIconActionTrip: {
    backgroundColor: Theme.fiscalTabActiveBg,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  receiptBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    padding: 14,
  },
  receiptSheet: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    overflow: "hidden",
  },
  receiptHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  receiptHeadLeft: {
    flex: 1,
    minWidth: 0,
  },
  receiptParty: {
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  receiptSub: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 1.2,
  },
  receiptAmount: {
    fontSize: 24,
    fontWeight: "900",
    color: Theme.driverEmerald,
    letterSpacing: -0.4,
  },
  receiptCenter: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  receiptSuccessDot: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16,185,129,0.12)",
  },
  receiptSuccessLabel: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: "900",
    color: Theme.driverEmerald,
    letterSpacing: 2,
  },
  receiptCenterAmount: {
    marginTop: 2,
    fontSize: 40,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.8,
  },
  receiptMetaList: {
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  receiptMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 7,
  },
  receiptMetaLabel: {
    width: 104,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  receiptMetaValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 18,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  receiptActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  receiptBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptBtnSecondary: {
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.screenBackground,
  },
  receiptBtnPrimary: {
    backgroundColor: Theme.driverEmerald,
  },
  receiptBtnSecondaryText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 1.5,
  },
  receiptBtnPrimaryText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: 1.5,
  },
  receiptBtnShare: {
    flex: 0,
    width: 44,
    minWidth: 44,
    paddingHorizontal: 0,
  },
  auditRowGroup: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    backgroundColor: Theme.screenBackground,
  },
  auditTr: {
    position: "relative" as const,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 4,
    overflow: "hidden",
  },
  auditTrPressed: { backgroundColor: Theme.surface },
  mismatchStripe: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: Theme.teslaRed,
  },
  auditTd: {
    justifyContent: "center",
    alignItems: "flex-start",
  },
  auditTdCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  auditTdParty: {
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 0,
  },
  auditPartyLine1: {
    fontSize: FS_LABEL,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  auditPartyLine2: {
    marginTop: 4,
    fontSize: FS_CAPTION,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  auditLedgerCount: {
    fontSize: FS_BODY,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  auditLedgerSub: {
    marginTop: 4,
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
  auditTruckWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  auditTruckWrapOk: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderMedium,
  },
  auditTruckWrapWarn: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
  },
  auditIdentityText: { flex: 1, minWidth: 0 },
  auditTripId: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  auditTripIdEmphasis: {
    color: Theme.primary,
    fontWeight: "800",
    fontStyle: "normal",
  },
  auditRouteHint: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textRouteCard,
    letterSpacing: 0.25,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  auditRowChevron: { marginLeft: 4 },
  tableStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 74,
    alignItems: "center",
  },
  tableStatusPillUnassigned: {
    backgroundColor: Theme.tripHubUnassignedPillBg,
    borderColor: Theme.textPrimaryDark,
  },
  tableStatusPillRose: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.teslaRed,
  },
  /** Receivable still due — distinct from payable (red). */
  tableStatusPillReceivable: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.warning,
  },
  tableStatusPillEmerald: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  tableStatusPillText: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  tableStatusPillTextUnassigned: {
    color: Theme.textPrimaryDark,
    fontWeight: "600",
    letterSpacing: 0.45,
  },
  tableStatusPillTextPositive: {
    color: Theme.darkGreen,
    fontWeight: "700",
  },
  tableStatusPillTextNegative: {
    color: Theme.teslaRed,
    fontWeight: "700",
  },
  tableStatusPillTextReceivable: {
    color: Theme.warning,
    fontWeight: "700",
  },
  tableBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "center",
  },
  tableBadgeBlue: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.fiscalTabActiveBg,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  tableBadgeBlueText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  tableBadgeViolet: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  tableBadgeVioletText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  auditBilledCell: {
    alignSelf: "center",
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Theme.surface,
    maxWidth: "100%",
  },
  auditBilledCellWarn: { backgroundColor: Theme.warningMuted },
  auditYouLine: {
    fontSize: FS_AMOUNT,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.35,
    textAlign: "center",
  },
  auditThemPill: {
    marginTop: 4,
    alignSelf: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  auditThemPillOk: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  auditThemPillWarn: {
    backgroundColor: Theme.warningMuted,
    borderWidth: 1,
    borderColor: Theme.teslaRed,
  },
  auditThemPillText: {
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  auditThemPillTextWarn: { color: Theme.teslaRed },
  auditMarginVal: {
    fontSize: FS_AMOUNT,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.35,
    textAlign: "center",
    alignSelf: "center",
  },
  auditMarginPct: {
    marginTop: 4,
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "center",
  },
  auditOrb: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  auditOrbOk: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  auditOrbWarn: {
    backgroundColor: Theme.teslaRed,
    borderColor: Theme.teslaRed,
  },
  auditCtaPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  auditFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 12,
  },
  auditFooterLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  auditFooterIcon: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  auditFooterTitle: {
    fontSize: FS_BODY,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  auditFooterSub: {
    marginTop: 2,
    fontSize: FS_CAPTION,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  auditExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  auditExportBtnDisabled: { opacity: 0.45 },
  auditExportBtnText: {
    fontSize: FS_CAPTION,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  expandPanel: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
  },
  txnSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  txnSectionHeadLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  txnSectionHeadRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  txnStripClose: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  txnSectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  txnVerifiedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.fiscalTabActiveBg,
  },
  txnVerifiedBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  txnHorizontalList: {
    paddingBottom: 2,
    gap: 10,
    paddingRight: 4,
  },
  txnPostTxnStub: {
    minWidth: 200,
    maxWidth: 220,
    minHeight: 88,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    gap: 6,
    backgroundColor: Theme.screenBackground,
  },
  txnPostTxnStubText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  expandEmpty: {
    fontSize: FS_BODY,
    fontWeight: "600",
    color: Theme.textSecondary,
    paddingVertical: 8,
  },
  txnGrid: {
    gap: 8,
  },
  txnGridWeb: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
  },
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    gap: 12,
  },
  txnCardPositive: {
    borderColor: Theme.positiveMuted,
  },
  txnCardNegative: {
    borderColor: Theme.warningMuted,
  },
  txnCardWeb: {
    width: "32.3%",
    minWidth: 210,
  },
  txnCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  txnAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.fiscalTabActiveBg,
  },
  txnAvatarText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  txnLineLeft: { flex: 1, minWidth: 0 },
  txnFlow: {
    fontSize: FS_CAPTION,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  txnCounterparty: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  txnWhen: {
    marginTop: 2,
    fontSize: FS_CAPTION,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  txnAmtWrap: {
    alignItems: "flex-end",
    paddingLeft: 6,
  },
  txnAmt: {
    fontSize: FS_AMOUNT,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.35,
  },
  txnAmtIn: {
    color: Theme.darkGreen,
  },
  txnAmtOut: {
    color: Theme.teslaRed,
  },
  txnAmtSub: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  txnReceiptLink: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  txnVaultCard: {
    minWidth: 280,
    maxWidth: 340,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 18,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 10,
  },
  txnVaultCardIn: {
    borderColor: Theme.positiveMuted,
  },
  txnVaultCardOut: {
    borderColor: Theme.warningMuted,
  },
  txnVaultLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  txnVaultIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  txnVaultIconIn: {
    borderColor: Theme.positiveMuted,
    backgroundColor: Theme.positiveMuted,
  },
  txnVaultIconOut: {
    borderColor: Theme.warningMuted,
    backgroundColor: Theme.warningMuted,
  },
  txnFlowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  txnFlowIn: {
    color: Theme.darkGreen,
  },
  txnFlowOut: {
    color: Theme.teslaRed,
  },
  txnFlowSep: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  colPickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  colPickerSheet: {
    backgroundColor: Theme.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: Theme.borderLight,
  },
  colPickerTitle: {
    fontSize: FS_BODY,
    fontWeight: "800",
    color: Theme.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  colPickerHint: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: FS_CAPTION,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  colPickerScroll: { maxHeight: 360 },
  colPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  colPickerRowLabel: {
    flex: 1,
    fontSize: FS_LABEL,
    fontWeight: "600",
    color: Theme.textPrimary,
    paddingRight: 12,
  },
  colPickerDone: {
    marginTop: 12,
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  colPickerDoneText: {
    fontSize: FS_CAPTION,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
});

const HUB_COL_STYLES: Record<TripsHubTableColumnId, ViewStyle> = {
  party: styles.auditColParty,
  driver: styles.auditColDriver,
  vehicle: styles.auditColVehicle,
  pickupDate: styles.auditColPickupDate,
  distance: styles.auditColDistance,
  loadType: styles.auditColLoadType,
  payment: styles.auditColPayment,
  billed: styles.auditColBilled,
  cost: styles.auditColCost,
  received: styles.auditColReceived,
  due: styles.auditColDue,
  margin: styles.auditColMargin,
  ledgerMeta: styles.auditColLedgerMeta,
};
