/**
 * Trips hub — compact card grid and audit-style table for the main Trips tab.
 * Styling aligns with fleet hub / reference; data bindings mirror TripExpandableCard.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { isAggregateTrip } from "@/lib/driverUtils";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import {
  isBlankOrPlaceholderPartyName,
  resolvePartyDisplayUri,
} from "@/lib/partyAvatarDisplay";
import {
  formatINR,
  formatLedgerDate,
  formatLedgerDateTime,
} from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState, type ReactNode } from "react";
import {
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
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

function tripHubRevenue(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
): number {
  const isOwner =
    currentOrganizationId != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganizationId;
  const useSupplierRate = trip.indent_id != null && !isOwner;
  return useSupplierRate
    ? Number(trip.supplier_rate ?? 0)
    : Number(trip.client_price ?? 0);
}

function rosterFromLoadHub(trip: TripRow): boolean {
  return (
    trip?.source === "direct_quote" &&
    trip?.driver_id != null &&
    trip?.vehicle_id != null
  );
}

function deployPercentForTrip(trip: TripRow, stageUpper: string): number {
  const completedLike =
    stageUpper === "COMPLETED" ||
    stageUpper === "DELIVERED" ||
    stageUpper === "DONE";
  if (completedLike) return 100;
  const s = (trip.status ?? "").toLowerCase();
  if (s === "completed" || s === "delivered") return 100;
  if (s === "in_progress" || s === "in transit") return 85;
  if (trip.started_at) return 60;
  if (trip.driver_id || s === "assigned") return 50;
  return 25;
}

function tripHubCost(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
): number {
  const isOwner =
    currentOrganizationId != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganizationId;
  if (trip.indent_id != null && isOwner) {
    return Number(trip.supplier_rate ?? 0);
  }
  return Number(trip.supplier_rate ?? 0);
}

function tripHubPnl(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
): number {
  return (
    tripHubRevenue(trip, currentOrganizationId) -
    tripHubCost(trip, currentOrganizationId)
  );
}

function marginPercentLabel(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
): string {
  const sales = tripHubRevenue(trip, currentOrganizationId);
  if (!sales) return "—";
  const pnl = tripHubPnl(trip, currentOrganizationId);
  const pct = (pnl / sales) * 100;
  return `${pct.toFixed(1)}%`;
}

function tripHubDue(
  trip: TripRow,
  currentOrganizationId: string | null | undefined,
): number {
  const sales = tripHubRevenue(trip, currentOrganizationId);
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
  count: number;
  lastAtIso: string | null;
} {
  let receivedTotal = 0;
  for (const r of entries) {
    receivedTotal += Number(r.amount_in ?? 0);
  }
  const sorted = sortedTripLedger(entries);
  const head = sorted[0];
  const lastAtIso = head
    ? String(head.transaction_date || head.created_at || "")
    : null;
  return { receivedTotal, count: entries.length, lastAtIso };
}

const HUB_TABLE_PARTY_AVATAR = 22;

/** Hub card: storage/http URL + seed via `resolvePartyDisplayUri`, else DiceBear from `fallbackSeed`. */
function HubPartyAvatar({
  avatarUrl,
  avatarSeed,
  fallbackSeed,
  entityType = "client",
  partyLabel,
}: {
  avatarUrl: string | null | undefined;
  avatarSeed: string | null | undefined;
  fallbackSeed: string;
  entityType?: "client" | "supplier";
  /** When empty or placeholder-only, no synthetic DiceBear avatar is shown. */
  partyLabel: string;
}) {
  const resolved =
    resolvePartyDisplayUri({
      avatarUrl,
      avatarSeed,
      entityType,
    }) ?? null;
  if (resolved) {
    return (
      <View style={styles.hubPartyAvatarRing}>
        <Image
          source={{ uri: resolved }}
          style={styles.hubPartyAvatarImg}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  if (isBlankOrPlaceholderPartyName(partyLabel)) {
    return null;
  }
  const displayUri = getUser2DAvatarUriForSeed(
    (fallbackSeed ?? "").trim() || partyLabel.trim() || "party",
  );
  return (
    <View style={styles.hubPartyAvatarRing}>
      <Image
        source={{ uri: displayUri }}
        style={styles.hubPartyAvatarImg}
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
}: TripsHubTripCardProps) {
  const aggregate = isAggregateTrip(trip);
  const rosterHub = rosterFromLoadHub(trip);
  const showAssetTripIcon = !aggregate || rosterHub;
  const typeLabel = showAssetTripIcon ? tr("tripAsset") : tr("tripAggregate");
  const subTypeLabel = aggregate ? tr("integrated") : tr("manual");
  const revenue = tripHubRevenue(trip, currentOrganizationId);
  const cost = tripHubCost(trip, currentOrganizationId);
  const pnl = tripHubPnl(trip, currentOrganizationId);
  const due = tripHubDue(trip, currentOrganizationId);
  const marginPct = marginPercentLabel(trip, currentOrganizationId);
  const stageUpper = (stageLabel || "").toUpperCase();
  const deployPct = deployPercentForTrip(trip, stageUpper);
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
        <View style={styles.fleetOrb} pointerEvents="none" />
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
              {deployPct}% {tr("tripsHubDeployed")}
            </Text>
          </View>
          <View style={styles.fleetProgTrack}>
            <View style={[styles.fleetProgFill, { width: `${deployPct}%` }]} />
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
  /** From `useLinkedOrgProfileMap(clients, suppliers)` — org logo before contact avatar in Partner column. */
  linkedOrgByOrganizationId?: Record<string, LinkedOrgDisplay>;
  /** Per-trip client/supplier/driver avatar fields (see `buildTripHubPartyMetaByTripId`). */
  partyMetaByTripId?: Map<string, TripHubPartyMeta>;
};

function txnFlowLabel(row: LedgerRow, tr: (k: string) => string): string {
  const amountIn = Number(row.amount_in ?? 0);
  const out = Number(row.amount_out ?? 0);
  if (amountIn > 0) return tr("tripsHubTxnReceived");
  if (out > 0) return tr("tripsHubTxnPaid");
  return row.primary_category?.split("|")[0]?.trim() || tr("entry");
}

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
  linkedOrgByOrganizationId,
  partyMetaByTripId,
}: TripsHubTableViewProps) {
  const insets = useSafeAreaInsets();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [visibleCols, setVisibleCols] = useState<
    Record<TripsHubTableColumnId, boolean>
  >(() => ({ ...DEFAULT_TRIPS_HUB_TABLE_COLUMNS }));
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);

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

  return (
    <View style={styles.auditTableWrap}>
      <View style={styles.auditToolbar}>
        <TouchableOpacity
          style={styles.auditToolbarBtn}
          onPress={() => setColumnPickerOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={tr("tripsHubTableColumns")}
        >
          <FontAwesome name="cog" size={14} color={Theme.textSecondary} />
          <Text style={styles.auditToolbarText}>{tr("tripsHubTableColumns")}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.auditHeaderRow}>
        <View
          style={[styles.auditThCell, styles.auditThCellStart, styles.auditColIdentity]}
        >
          <Text style={styles.auditTh}>{tr("tripsHubColTripIdentity")}</Text>
        </View>
        <View style={[styles.auditThCell, styles.auditColStatusType]}>
          <Text style={styles.auditTh}>{tr("tripsHubColStatusType")}</Text>
        </View>
        {HUB_COLUMN_ORDER.filter((id) => visibleCols[id]).map((id) => (
          <View key={id} style={[styles.auditThCell, HUB_COL_STYLES[id]]}>
            <Text
              style={[
                styles.auditTh,
                HUB_TH_LEFT.has(id) ? styles.auditThLeft : styles.auditThCenter,
              ]}
              numberOfLines={2}
            >
              {tr(HUB_COLUMN_LABEL[id])}
            </Text>
          </View>
        ))}
        <View style={[styles.auditThCell, styles.auditColAudit]}>
          <Text style={styles.auditTh}>{tr("tripsHubColAudit")}</Text>
        </View>
      </View>

      {trips.map((t) => {
        const entries = transactionsByTripId.get(t.id) ?? [];
        const mySales = tripHubRevenue(t, currentOrganizationId);
        const cost = tripHubCost(t, currentOrganizationId);
        const pnl = tripHubPnl(t, currentOrganizationId);
        const marginPct = marginPercentLabel(t, currentOrganizationId);
        const due = tripHubDue(t, currentOrganizationId);
        const ledgerRoll = summarizeTripLedgerForHub(entries);
        const hasLedgerMismatch = entries.some(
          (r) => r.reconciliation_status === "mismatch",
        );
        const hasSalesConflict = hasLedgerMismatch;
        const aggregate = isAggregateTrip(t);
        const rosterHub = rosterFromLoadHub(t);
        const showAssetTripIcon = !aggregate || rosterHub;
        const typeLabel = showAssetTripIcon ? tr("tripAsset") : tr("tripAggregate");
        const subTypeLabel = aggregate ? tr("integrated") : tr("manual");
        const stageUpper = getStageLabel(t).toUpperCase();
        const isDelayed =
          stageUpper.includes("IN_PROGRESS") ||
          stageUpper.includes("TRANSIT") ||
          stageUpper.includes("AT_DROP");
        const isUnassigned = stageUpper.includes("UNASSIGNED");
        const routeShort = `${t.pickup_area ?? "—"} → ${t.drop_location ?? "—"}`;
        const expanded = expandedIds.has(t.id);
        const sortedEntries = sortedTripLedger(entries);
        const lastTxnShort = ledgerRoll.lastAtIso
          ? formatLedgerDate(ledgerRoll.lastAtIso)
          : "—";

        const statusPillStyle = isUnassigned
          ? styles.tableStatusPillUnassigned
          : isDelayed
            ? styles.tableStatusPillRose
            : styles.tableStatusPillEmerald;

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
              <View style={[styles.auditTd, styles.auditColIdentity]}>
                <View
                  style={[
                    styles.auditTruckWrap,
                    hasSalesConflict
                      ? styles.auditTruckWrapWarn
                      : styles.auditTruckWrapOk,
                  ]}
                >
                  <HubIconPulse>
                    <FontAwesome
                      name={showAssetTripIcon ? "truck" : "link"}
                      size={18}
                      color={
                        hasSalesConflict
                          ? Theme.teslaRed
                          : showAssetTripIcon
                            ? Theme.textPrimaryDark
                            : Theme.aggregatePillText
                      }
                    />
                  </HubIconPulse>
                </View>
                <View style={styles.auditIdentityText}>
                  <Text style={styles.auditTripId} numberOfLines={1}>
                    {getTripDisplayNumber(t)}
                  </Text>
                  <Text style={styles.auditRouteHint} numberOfLines={2}>
                    {routeShort}
                  </Text>
                </View>
                <FontAwesome
                  name={expanded ? "chevron-down" : "chevron-right"}
                  size={10}
                  color={Theme.textSecondary}
                  style={styles.auditRowChevron}
                />
              </View>

              <View style={[styles.auditTd, styles.auditColStatusType]}>
                <View style={[styles.tableStatusPill, statusPillStyle]}>
                  <Text
                    style={[
                      styles.tableStatusPillText,
                      isUnassigned && styles.tableStatusPillTextUnassigned,
                      isDelayed &&
                        !isUnassigned && { color: Theme.teslaRed },
                      !isUnassigned &&
                        !isDelayed && { color: Theme.darkGreen },
                    ]}
                  >
                    {stageUpper}
                  </Text>
                </View>
                <View style={styles.tableBadgeRow}>
                  <View style={styles.tableBadgeBlue}>
                    <Text style={styles.tableBadgeBlueText}>{typeLabel}</Text>
                  </View>
                  <View style={styles.tableBadgeViolet}>
                    <Text style={styles.tableBadgeVioletText}>{subTypeLabel}</Text>
                  </View>
                </View>
              </View>

              {HUB_COLUMN_ORDER.filter((id) => visibleCols[id]).map((id) => {
                if (id === "party") {
                  const meta = partyMetaByTripId?.get(t.id);
                  const clientLine = (t.client_name ?? "").trim();
                  const supplierLine =
                    (meta?.displaySupplierName ?? "").trim() ||
                    (t.supplier_name ?? "").trim();
                  const clientOrg = linkedOrgAvatarFields(
                    meta?.clientLinkedOrgId,
                    linkedOrgByOrganizationId,
                  );
                  const supplierOrg = linkedOrgAvatarFields(
                    meta?.supplierLinkedOrgId,
                    linkedOrgByOrganizationId,
                  );
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdParty, HUB_COL_STYLES[id]]}
                    >
                      <View style={styles.auditPartyLineRow}>
                        {meta ? (
                          <PartyAvatar
                            name={clientLine}
                            {...clientOrg}
                            avatarUrl={meta.clientAvatarUrl}
                            avatarSeed={meta.clientAvatarSeed}
                            entityType="client"
                            size={HUB_TABLE_PARTY_AVATAR}
                          />
                        ) : null}
                        <Text
                          style={[styles.auditPartyLine1, styles.auditPartyLineText]}
                          numberOfLines={1}
                        >
                          {clientLine}
                        </Text>
                      </View>
                      <View style={[styles.auditPartyLineRow, styles.auditPartyLineRowSecond]}>
                        {meta ? (
                          <PartyAvatar
                            name={supplierLine}
                            {...supplierOrg}
                            avatarUrl={meta.supplierAvatarUrl}
                            avatarSeed={meta.supplierAvatarSeed}
                            entityType="supplier"
                            size={HUB_TABLE_PARTY_AVATAR}
                          />
                        ) : null}
                        <Text
                          style={[styles.auditPartyLine2, styles.auditPartyLineText]}
                          numberOfLines={1}
                        >
                          {supplierLine}
                        </Text>
                      </View>
                    </View>
                  );
                }
                if (id === "driver") {
                  const meta = partyMetaByTripId?.get(t.id);
                  const name = (t.driver_display_name ?? "").trim();
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdHubStack, HUB_COL_STYLES[id]]}
                    >
                      <View style={styles.auditPartyLineRow}>
                        {meta ? (
                          <PartyAvatar
                            name={name}
                            avatarUrl={meta.driverAvatarUrl}
                            avatarSeed={meta.driverAvatarSeed}
                            entityType="driver"
                            size={HUB_TABLE_PARTY_AVATAR}
                          />
                        ) : null}
                        <Text
                          style={[styles.hubStackValue, styles.auditPartyLineText]}
                          numberOfLines={2}
                        >
                          {name}
                        </Text>
                      </View>
                    </View>
                  );
                }
                if (id === "vehicle") {
                  const reg = (t.vehicle_display_number ?? "").trim();
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdHubStack, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.hubStackValueMono} numberOfLines={1}>
                        {reg || "—"}
                      </Text>
                    </View>
                  );
                }
                if (id === "pickupDate") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdHubStack, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.hubStackValue} numberOfLines={2}>
                        {formatTripPickupCell(t.pickup_date)}
                      </Text>
                      {t.started_at ? (
                        <Text style={styles.hubStackSub} numberOfLines={1}>
                          {tr("tripsHubStartedShort")}:{" "}
                          {formatTripPickupCell(t.started_at)}
                        </Text>
                      ) : null}
                    </View>
                  );
                }
                if (id === "distance") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdHubCenter, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.hubMetricSingle} numberOfLines={1}>
                        {formatTripDistanceKm(t.distance)}
                      </Text>
                    </View>
                  );
                }
                if (id === "loadType") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdHubStack, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.hubStackValue} numberOfLines={2}>
                        {formatLoadTypeCell(t.load_type)}
                      </Text>
                    </View>
                  );
                }
                if (id === "payment") {
                  const tone = hubPaymentTone(t.payment_status);
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdHubCenter, HUB_COL_STYLES[id]]}
                    >
                      <View
                        style={[
                          styles.hubPayPill,
                          tone === "paid" && styles.hubPayPillPaid,
                          tone === "partial" && styles.hubPayPillPartial,
                          tone === "pending" && styles.hubPayPillPending,
                          tone === "neutral" && styles.hubPayPillNeutral,
                        ]}
                      >
                        <Text
                          style={[
                            styles.hubPayPillText,
                            tone === "paid" && styles.hubPayPillTextPaid,
                            tone === "partial" && styles.hubPayPillTextPartial,
                            tone === "pending" && styles.hubPayPillTextPending,
                            tone === "neutral" && styles.hubPayPillTextNeutral,
                          ]}
                          numberOfLines={1}
                        >
                          {formatPaymentStatusLabel(t.payment_status, tr)}
                        </Text>
                      </View>
                    </View>
                  );
                }
                if (id === "billed") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdCenter, HUB_COL_STYLES[id]]}
                    >
                      <View
                        style={[
                          styles.auditBilledCell,
                          hasSalesConflict && styles.auditBilledCellWarn,
                        ]}
                      >
                        <Text style={styles.auditYouLine}>
                          {tr("tripsHubYou")}: {formatINR(mySales)}
                        </Text>
                        <View
                          style={[
                            styles.auditThemPill,
                            hasSalesConflict
                              ? styles.auditThemPillWarn
                              : styles.auditThemPillOk,
                          ]}
                        >
                          <Text
                            style={[
                              styles.auditThemPillText,
                              hasSalesConflict && styles.auditThemPillTextWarn,
                            ]}
                          >
                            {tr("tripsHubAwaitingData")}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }
                if (id === "cost") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdCenter, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.auditMarginVal}>{formatINR(cost)}</Text>
                    </View>
                  );
                }
                if (id === "received") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdCenter, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.auditMarginVal}>
                        {formatINR(ledgerRoll.receivedTotal)}
                      </Text>
                      <Text style={styles.auditLedgerSub}>
                        {tr("tripsHubAmountPaidBook")}:{" "}
                        {formatINR(Number(t.amount_paid ?? 0))}
                      </Text>
                    </View>
                  );
                }
                if (id === "due") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdCenter, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.auditMarginVal}>{formatINR(due)}</Text>
                    </View>
                  );
                }
                if (id === "margin") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdCenter, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.auditMarginVal}>{formatINR(pnl)}</Text>
                      <Text style={styles.auditMarginPct}>
                        {marginPct} {tr("tripsHubMarginSuffix")}
                      </Text>
                    </View>
                  );
                }
                if (id === "ledgerMeta") {
                  return (
                    <View
                      key={id}
                      style={[styles.auditTd, styles.auditTdCenter, HUB_COL_STYLES[id]]}
                    >
                      <Text style={styles.auditLedgerCount}>{ledgerRoll.count}</Text>
                      <Text style={styles.auditLedgerSub} numberOfLines={1}>
                        {lastTxnShort}
                      </Text>
                    </View>
                  );
                }
                return null;
              })}

              <View style={[styles.auditTd, styles.auditColAudit]}>
                <View style={styles.auditCellIconRow}>
                  <View
                    accessible
                    accessibilityLabel={
                      hasSalesConflict
                        ? tr("tripsHubFixGap")
                        : tr("tripsHubSafeAudit")
                    }
                    style={[
                      styles.auditOrb,
                      hasSalesConflict ? styles.auditOrbWarn : styles.auditOrbOk,
                    ]}
                  >
                    <HubIconPulse>
                      <FontAwesome
                        name={hasSalesConflict ? "bolt" : "check"}
                        size={10}
                        color={Theme.textOnDark}
                      />
                    </HubIconPulse>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.auditIconAction,
                      expanded
                        ? styles.auditIconActionTxnExpanded
                        : styles.auditIconActionTxn,
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
                      name="list-ul"
                      size={9}
                      color={Theme.textOnDark}
                    />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.auditIconAction,
                      styles.auditIconActionTrip,
                      pressed && styles.auditCtaPressed,
                    ]}
                    onPress={() => onOpenTripDetails(t)}
                    accessibilityRole="button"
                    accessibilityLabel={tr("tripsHubAuditViewTripDetail")}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <FontAwesome
                      name="external-link"
                      size={9}
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
                  sortedEntries.map((row) => {
                    const when = formatLedgerDateTime(
                      row.transaction_date || row.created_at,
                    );
                    const flow = txnFlowLabel(row, tr);
                    const amt = txnAmount(row);
                    return (
                      <View key={row.id} style={styles.txnLine}>
                        <View style={styles.txnLineLeft}>
                          <Text style={styles.txnFlow}>{flow}</Text>
                          <Text style={styles.txnWhen} numberOfLines={1}>
                            {when}
                          </Text>
                        </View>
                        <Text style={styles.txnAmt}>{formatINR(amt)}</Text>
                      </View>
                    );
                  })
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
    fontWeight: "600",
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
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fleetTripId: {
    fontSize: FS_AMOUNT,
    fontWeight: "600",
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
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fleetMissionPillTextUnassigned: {
    color: Theme.textPrimaryDark,
    fontWeight: "600",
    letterSpacing: 0.55,
  },
  fleetMissionPillTextRose: { color: Theme.teslaRed },
  fleetMissionPillTextEmerald: { color: Theme.darkGreen },
  fleetAging: {
    fontSize: FS_CAPTION,
    fontWeight: "600",
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
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 15,
  },
  fleetManifestDest: {
    fontSize: FS_ROUTE_HERO,
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.teslaRed,
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
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fleetProgHeadIndigo: {
    fontSize: FS_CAPTION,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fleetProgTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
  },
  fleetProgFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Theme.textPrimaryDark,
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
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  fleetRevSnapVal: {
    marginTop: 0,
    fontSize: FS_AMOUNT,
    fontWeight: "600",
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
    fontWeight: "700",
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
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  fleetPartySub: {
    marginTop: 2,
    fontSize: FS_CAPTION,
    fontWeight: "600",
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
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fleetMetricVal: {
    marginTop: 2,
    fontSize: FS_BODY,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.25,
  },
  fleetMetricPct: {
    marginTop: 1,
    fontSize: FS_CAPTION,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  fleetMetricMeta: {
    marginTop: 2,
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 11,
  },
  auditTableWrap: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 4,
  },
  auditToolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  auditToolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  auditToolbarText: {
    fontSize: FS_CAPTION,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  auditHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  auditTh: {
    fontSize: FS_CAPTION,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
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
    borderLeftColor: Theme.borderOnDark,
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
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColDriver: {
    flex: 0.72,
    minWidth: 100,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColVehicle: {
    flex: 0.55,
    minWidth: 86,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColPickupDate: {
    flex: 0.58,
    minWidth: 88,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColDistance: {
    flex: 0.42,
    minWidth: 72,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColLoadType: {
    flex: 0.58,
    minWidth: 92,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColPayment: {
    flex: 0.62,
    minWidth: 96,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
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
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColCost: {
    flex: 0.5,
    minWidth: 84,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColReceived: {
    flex: 0.58,
    minWidth: 96,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColDue: {
    flex: 0.48,
    minWidth: 78,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColMargin: {
    flex: 0.62,
    minWidth: 96,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColLedgerMeta: {
    flex: 0.52,
    minWidth: 88,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
  },
  auditColAudit: {
    flex: 0.58,
    minWidth: 120,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderOnDark,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 4,
  },
  auditCellIconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: "100%",
    paddingVertical: 2,
  },
  auditIconAction: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  auditIconActionTxn: {
    backgroundColor: Theme.teslaRed,
    borderColor: Theme.teslaRed,
  },
  auditIconActionTxnExpanded: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  auditIconActionTrip: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1.5,
    borderColor: Theme.textPrimaryDark,
  },
  auditRowGroup: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  auditTr: {
    position: "relative" as const,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
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
    width: 44,
    height: 44,
    borderRadius: 12,
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
    fontSize: FS_LABEL,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  auditRouteHint: {
    marginTop: 2,
    fontSize: FS_CAPTION,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  auditRowChevron: { marginLeft: 4 },
  tableStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  tableStatusPillUnassigned: {
    backgroundColor: Theme.tripHubUnassignedPillBg,
    borderColor: Theme.textPrimaryDark,
  },
  tableStatusPillRose: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.teslaRed,
  },
  tableStatusPillEmerald: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  tableStatusPillText: {
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "center",
  },
  tableStatusPillTextUnassigned: {
    color: Theme.textPrimaryDark,
    fontWeight: "600",
    letterSpacing: 0.45,
  },
  tableBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "center" },
  tableBadgeBlue: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  tableBadgeBlueText: {
    fontSize: 6,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tableBadgeViolet: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tableBadgeVioletText: {
    fontSize: 6,
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
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
    paddingTop: 2,
    paddingBottom: 10,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
  },
  expandEmpty: {
    fontSize: FS_BODY,
    fontWeight: "600",
    color: Theme.textSecondary,
    paddingVertical: 8,
  },
  txnLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    gap: 12,
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
  txnWhen: {
    marginTop: 2,
    fontSize: FS_CAPTION,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  txnAmt: {
    fontSize: FS_AMOUNT,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.35,
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
