/**
 * Ledger entries in a compact transaction list: grouped by day/month,
 * with cumulative Paid/Received per section and tappable trip association.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import {
    getLedgerFlowForRow,
    LedgerFlowChip,
} from "@/features/finance/components/LedgerFlowChip";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { LedgerDayDivider } from "@/features/finance/components/LedgerDayDivider";
import { type LedgerRow } from "@/features/finance/services/finance.service";
import { formatIndianVehicleNumber, formatINRChip, formatLedgerAmount } from "@/lib/format";
import { EMPTY_STATE_LOTTIE } from "@/lib/emptyStateLottieAssets";
import { partyAvatarHasRenderableOutput, partyAvatarInitialsTextColor } from "@/lib/partyAvatarDisplay";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    FinanceAnalyticsView,
    type AnalyticsTripDetailMap,
} from "./FinanceAnalyticsView";
import {
    LedgerExpandedCardFromData,
    type FinancialRowData,
} from "./FinancialRow";
import { TripPickerModal, type TripPickerOption } from "./TripPickerModal";

/** Shared layout: timeline left anchor width and separator alignment. */
const TIMELINE_ANCHOR_WIDTH = 80;

/** Minimum font size for readable labels (accessibility). */
const FONT_SIZE_CAPTION = 8;
const FONT_SIZE_LABEL = 9;
const FONT_SIZE_BODY = 10;
const FONT_SIZE_BODY_STRONG = 11;

const MONTHS_SHORT = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(
  " ",
);
const MONTHS_FULL =
  "January February March April May June July August September October November December".split(
    " ",
  );

/** When no `renderPartyAvatar`, show driver photo / seed / initials from optional fleet rows + URL map. */
function defaultDriverPartyAvatar(
  row: LedgerRow,
  driverById: Map<string, { avatar_url?: string | null; avatar_seed?: string | null }>,
  driverProfileImageUrls: Record<string, string> | undefined,
): ReactNode | null {
  const isDriver =
    row.contact_type === "driver" ||
    (row.driver_name ?? "").trim() !== "";
  if (!isDriver) return null;

  const contactId = (row.contact_id ?? "").trim();
  const d = contactId ? driverById.get(contactId) : undefined;
  const name =
    (row.party_name ?? "").trim() ||
    (row.driver_name ?? "").trim() ||
    "—";
  const avatarUrl =
    (row.profileImageUrl ?? "").trim() ||
    (d?.avatar_url ?? "").trim() ||
    (contactId ? (driverProfileImageUrls?.[contactId] ?? "").trim() : "") ||
    null;
  const avatarSeed = (d?.avatar_seed ?? "").trim() || null;

  if (
    !partyAvatarHasRenderableOutput({
      name,
      avatarUrl,
      avatarSeed,
      entityType: "driver",
    })
  ) {
    return null;
  }

  return (
    <PartyAvatar
      name={name}
      initialsColorSeed={contactId || name}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      entityType="driver"
      size={40}
    />
  );
}

function formatTxDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (iso ?? "").slice(0, 10);
  if (!s) return "—";
  const [y, m, day] = s.split("-");
  return `${day} ${MONTHS_SHORT[Number(m) - 1] ?? m} ${y}`;
}

/** Date key YYYY-MM-DD for grouping; null if no date. */
function dateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = (iso ?? "").slice(0, 10);
  return s || null;
}

/** Section title: Today, Yesterday, or "15 August 2024" (reference style). */
function sectionTitleForKey(key: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${d} ${MONTHS_FULL[m - 1]} ${y}`;
}

function ledgerDividerDateIso(key: string): string | undefined {
  if (key === "—" || key === "_all") return undefined;
  return `${key}T12:00:00`;
}

/** Initials from party/name (max 2 chars, uppercase). */
function initials(name: string): string {
  const t = (name ?? "").trim();
  if (!t) return "—";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2)
    return (words[0][0] + words[words.length - 1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

/** Avatar background colors aligned with Theme (primary blue, slate, semantic accents). */
const AVATAR_COLORS = [
  Theme.primary,
  Theme.primaryLight,
  Theme.aggregatePillText,
  Theme.darkGreen,
  Theme.teslaRed,
  Theme.textPrimary,
  Theme.buttonSecondary,
  Theme.integratedIcon,
  Theme.iconSlate,
  Theme.primaryText,
];
function avatarColor(str: string): string {
  let n = 0;
  for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function formatTxDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (iso ?? "").slice(0, 10);
  if (!s) return "—";
  const [y, m, day] = s.split("-");
  return `${day} ${MONTHS_SHORT[Number(m) - 1] ?? m} ${y}`;
}

/** Relative aging for expanded card (e.g. "Today", "Yesterday", "3 days ago"). */
function getAgingLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(String(iso).slice(0, 10));
  if (isNaN(d.getTime())) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatTxDateLong(iso);
}

function partyDetailLine(row: LedgerRow): string {
  const party = (row.party_name ?? "").trim();
  const trip = getTripOperationalDisplay({
    trip_operational_code: row.trips?.trip_operational_code ?? null,
    trip_code: row.trips?.trip_code ?? null,
    display_trip_id: row.trips?.["display_trip_id"] ?? null,
    trip_number: row["trip_number"] ?? null,
  });
  const desc = (row.description ?? "").trim();
  const parts: string[] = [];
  if (party) parts.push(party);
  if (trip && trip !== "—") parts.push(`Trip ${trip}`);
  if (desc && desc !== "GENERAL" && !parts.includes(desc)) parts.push(desc);
  return parts.join(" · ") || "—";
}

export type TripDetailMap = Record<
  string,
  {
    trip_number: string;
    drop_location?: string;
    pickup_area?: string;
    client_name?: string;
    pickup_date?: string | null;
    vehicle_number?: string | null;
    vehicle_type?: string | null;
    vehicle_body_type?: string | null;
  }
>;

function tripDetailLine(
  row: LedgerRow,
  tripDetailsMap: TripDetailMap | undefined,
): string | null {
  if (!row.trip_id || !tripDetailsMap?.[row.trip_id]) return null;
  const d = tripDetailsMap[row.trip_id];
  const num = getTripOperationalDisplay({
    trip_number: d["trip_number"] ?? row["trip_number"] ?? null,
  });
  const route = [d.pickup_area, d.drop_location].filter(Boolean).join(" → ");
  if ((!num || num === "—") && !route) return null;
  return route ? `${num} · ${route}` : num;
}

/** Route only (e.g. "Pondy → Madurai") for display below date. */
function tripRouteOnly(
  row: LedgerRow,
  tripDetailsMap: TripDetailMap | undefined,
): string | null {
  if (!row.trip_id || !tripDetailsMap?.[row.trip_id]) return null;
  const d = tripDetailsMap[row.trip_id];
  const route = [d.pickup_area, d.drop_location].filter(Boolean).join(" → ");
  return route || null;
}

/** Trip ID/number only for pill display (e.g. "TRP034"). */
function tripNumberForPill(
  row: LedgerRow,
  tripDetailsMap: TripDetailMap | undefined,
): string | null {
  if (!row.trip_id) return null;
  const d = tripDetailsMap?.[row.trip_id];
  const num = getTripOperationalDisplay({
    trip_number: d?.["trip_number"] ?? row["trip_number"] ?? null,
  });
  return num === "—" ? null : num;
}

/** Compact expandable detail for a single transaction row (Type, Date, Amount, Party, Note). */
function TransactionRowDetail({ row }: { row: LedgerRow }) {
  const typeLabel =
    getDoubleEntryDisplayLabel(row) ?? row.description ?? row.party_name ?? "—";
  const dateStr = formatTxDateLong(row.transaction_date ?? row.created_at);
  const party = (row.party_name ?? "").trim() || "—";
  const note = (row.description ?? "").trim();
  const inAmt = Number(row.amount_in ?? 0);
  const outAmt = Number(row.amount_out ?? 0);
  const hasNote = note && note !== "GENERAL";
  const hasReconciliation = !!row.reconciliation_label;

  return (
    <View style={styles.detailCard}>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Type</Text>
        <Text style={styles.detailValue} numberOfLines={1}>
          {typeLabel}
        </Text>
      </View>
      {getLedgerFlowForRow(row) ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Flow</Text>
          <View style={styles.detailValue}>
            <LedgerFlowChip row={row} />
          </View>
        </View>
      ) : null}
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Entry date</Text>
        <Text style={styles.detailValue}>{dateStr}</Text>
      </View>
      {inAmt > 0 && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Amount received</Text>
          <Text style={[styles.detailValue, styles.detailValueGreen]}>
            ₹{formatLedgerAmount(inAmt)}
          </Text>
        </View>
      )}
      {outAmt > 0 && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Amount paid</Text>
          <Text style={[styles.detailValue, styles.detailValueRed]}>
            ₹{formatLedgerAmount(outAmt)}
          </Text>
        </View>
      )}
      <View style={[styles.detailRow, !hasNote && styles.detailRowLast]}>
        <Text style={styles.detailLabel}>Party</Text>
        <Text style={styles.detailValue} numberOfLines={2}>
          {party}
        </Text>
      </View>
      {(row.payment_mode || row.payment_reference) && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Payment</Text>
          <Text style={styles.detailValue} numberOfLines={2}>
            {[row.payment_mode, row.payment_reference && `Ref ${row.payment_reference}`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      )}
      {hasReconciliation && (
        <View style={[styles.detailRow, !hasNote && styles.detailRowLast]}>
          <Text style={styles.detailLabel}>Reconcile</Text>
          <View style={styles.detailReconValueWrap}>
            <Text style={styles.detailReconBadge}>{row.reconciliation_label}</Text>
            {row.reconciliation_action_label ? (
              <Text style={styles.detailReconAction}>
                {row.reconciliation_action_label}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      {hasNote && (
        <View style={[styles.detailRow, styles.detailRowLast]}>
          <Text style={styles.detailLabel}>Note</Text>
          <Text style={styles.detailValue} numberOfLines={2}>
            {note}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Expanded card: Associated Trip detail only + same-trip transactions list (no Ledger Details block). */
function TimelineExpandedDetail({
  row,
  tripDetailsMap,
  allTransactions,
  onDownloadPress,
}: {
  row: LedgerRow;
  tripDetailsMap?: TripDetailMap;
  /** All ledger rows; same-trip entries are shown in Transaction History. */
  allTransactions?: LedgerRow[];
  onDownloadPress?: () => void;
}) {
  const tripId = tripNumberForPill(row, tripDetailsMap);
  const routeStr = tripRouteOnly(row, tripDetailsMap);
  const vehicleStr =
    row.trip_id && tripDetailsMap?.[row.trip_id]
      ? (tripDetailsMap[row.trip_id].vehicle_number ?? "").trim()
      : "";
  const tripDateStr =
    row.trip_id && tripDetailsMap?.[row.trip_id]
      ? formatTxDateLong(tripDetailsMap[row.trip_id].pickup_date ?? undefined)
      : formatTxDateLong(row.transaction_date ?? row.created_at);

  const sameTripRows = useMemo(() => {
    if (!row.trip_id || !allTransactions?.length) return [];
    return allTransactions.filter((r) => r.trip_id === row.trip_id);
  }, [row.trip_id, allTransactions]);

  return (
    <View style={styles.timelineExpandedWrap}>
      <View style={styles.timelineExpandedMissionBlock}>
        <View style={styles.timelineExpandedMissionHeader}>
          <Text style={styles.timelineExpandedMissionHeaderText}>
            Associated Trip
          </Text>
        </View>
        <View style={styles.timelineExpandedMissionInner}>
          <View style={styles.timelineExpandedMissionRow}>
            <View style={styles.timelineExpandedHalf}>
              <Text style={styles.timelineExpandedMissionLabel}>Trip ID</Text>
              <Text
                style={styles.timelineExpandedMissionValue}
                numberOfLines={1}
              >
                {tripId ?? "—"}
              </Text>
            </View>
            <View
              style={[
                styles.timelineExpandedHalf,
                styles.timelineExpandedHalfRight,
              ]}
            >
              <Text style={styles.timelineExpandedMissionLabel}>
                Registry Date
              </Text>
              <Text style={styles.timelineExpandedValue}>{tripDateStr}</Text>
            </View>
          </View>
          <View style={styles.timelineExpandedMissionRow}>
            <View style={styles.timelineExpandedHalf}>
              <Text style={styles.timelineExpandedMissionLabel}>
                Route Corridor
              </Text>
              <Text
                style={[
                  styles.timelineExpandedValue,
                  styles.timelineExpandedValueItalic,
                ]}
                numberOfLines={1}
              >
                {routeStr ?? "—"}
              </Text>
            </View>
            <View
              style={[
                styles.timelineExpandedHalf,
                styles.timelineExpandedHalfRight,
              ]}
            >
              <Text style={styles.timelineExpandedMissionLabel}>
                Asset Type
              </Text>
              <Text
                style={[
                  styles.timelineExpandedValue,
                  styles.timelineExpandedValueItalic,
                ]}
                numberOfLines={1}
              >
                {vehicleStr || "—"}
              </Text>
            </View>
          </View>
          {sameTripRows.length > 0 && (
            <>
              <View style={styles.timelineExpandedTxDivider} />
              <Text style={styles.timelineExpandedTxTitle}>
                Transaction History
              </Text>
              <View style={styles.timelineExpandedTxList}>
                {sameTripRows.map((r, idx) => {
                  const typeLabel =
                    getDoubleEntryDisplayLabel(r) ??
                    r.description ??
                    r.party_name ??
                    "—";
                  const party = (r.party_name ?? "").trim() || "—";
                  const dateStr = formatTxDate(
                    r.transaction_date ?? r.created_at,
                  );
                  const inAmt = Number(r.amount_in ?? 0);
                  const outAmt = Number(r.amount_out ?? 0);
                  const isIn = inAmt > 0;
                  const amount = isIn ? inAmt : outAmt;
                  const isHighlighted = r.id === row.id;
                  return (
                    <View
                      key={r.id}
                      style={[
                        styles.timelineExpandedTxRow,
                        idx === sameTripRows.length - 1 &&
                          styles.timelineExpandedTxRowLast,
                        isHighlighted &&
                          styles.timelineExpandedTxRowHighlighted,
                      ]}
                    >
                      <View
                        style={[
                          styles.timelineExpandedTxIcon,
                          isIn
                            ? styles.timelineExpandedTxIconIn
                            : styles.timelineExpandedTxIconOut,
                        ]}
                      >
                        <FontAwesome
                          name={isIn ? "arrow-down" : "arrow-up"}
                          size={8}
                          color={isIn ? Theme.darkGreen : Theme.teslaRed}
                        />
                      </View>
                      <View style={styles.timelineExpandedTxBody}>
                        <Text
                          style={styles.timelineExpandedTxLabel}
                          numberOfLines={1}
                        >
                          {typeLabel}
                        </Text>
                        <Text
                          style={styles.timelineExpandedTxSub}
                          numberOfLines={1}
                        >
                          {dateStr} · {party}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.timelineExpandedTxAmount,
                          isIn
                            ? styles.timelineExpandedTxAmountIn
                            : styles.timelineExpandedTxAmountOut,
                        ]}
                        numberOfLines={1}
                      >
                        {isIn ? "+" : "−"} ₹{formatLedgerAmount(amount)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
          <TouchableOpacity
            style={styles.timelineExpandedExportBtn}
            onPress={onDownloadPress}
            activeOpacity={0.8}
          >
            <FontAwesome
              name="cloud-download"
              size={10}
              color={Theme.textOnPrimary}
            />
            <Text style={styles.timelineExpandedExportText}>
              Export Protocol Node
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export interface LedgerTransactionListViewProps {
  transactions: LedgerRow[];
  /** When set, tapping a row calls this with the row id (expand/collapse). */
  onRowPress?: (id: string) => void;
  /** Row id that is currently expanded; show detail view below it. */
  expandedRowId?: string | null;
  /** Precomputed FinancialRowData for the expanded row (table-style detail: trip + same-trip transactions). */
  expandedRowData?: FinancialRowData | null;
  /**
   * Web desktop (≥1024): render expanded row as three columns (Ledger | Trip | Settlement/history).
   * Enable only on party-detail transaction surfaces — leave false for main Finance Cash ledger.
   */
  expandedDesktopThreeColumn?: boolean;
  /** Optional row id to highlight. */
  highlightId?: string | null;
  /** Show section title above the list. Default true. */
  showTitle?: boolean;
  /** Map trip_id -> detail; used to show trip number/route on row and in expand. */
  tripDetailsMap?: TripDetailMap;
  /** Resolve vehicle registration when row/trip map omit vehicle_number. */
  getVehicleNumberForTripId?: (tripId: string | null) => string | null;
  /** Trip options for "Link to trip" (when onMissionChange provided). */
  tripOptions?: TripPickerOption[];
  /** Called when user links an entry to a trip. */
  onMissionChange?: (entryId: string, tripId: string) => void;
  /** Optional: show "History" header with Search/Scan buttons (Tesla minimal style). */
  showHistoryHeader?: boolean;
  onSearchPress?: () => void;
  onScanPress?: () => void;
  /** Optional: show "Grid Protocol Secured" footer. */
  showGridFooter?: boolean;
  /** Optional: when set, header shows Plus button that calls this (Fiscal / Timeline layout). */
  onAddTransactionPress?: () => void;
  /** When false, hide TRANSACTION | TABLE | ANALYTICS sub-tabs (e.g. Cash page shows transaction list only). */
  showFiscalSubTabs?: boolean;
  /** Use FISCAL + Timeline Neural Gauge layout (date gauge with Paid/Received cards, card-style rows). */
  useTimelineLayout?: boolean;
  /** When useTimelineLayout: 'card' (default) or 'table' view. */
  fiscalViewMode?: "card" | "table";
  onFiscalViewModeChange?: (mode: "card" | "table") => void;
  /** When true, show a single flat list (one group, no date gauge). Used e.g. for Customers ledger view. */
  useFlatList?: boolean;
  /** When true, render content in a View instead of ScrollView so a parent ScrollView can scroll (e.g. client detail Cash Flow). */
  embedInParentScroll?: boolean;
  /** When true, content stretches to screen edges (e.g. Cash tab aligned with other finance tabs). */
  fullWidth?: boolean;
  /** Called when user taps Export/Download on a row (Table expanded card or Timeline expanded). Pass rowId for table export. */
  onExportPress?: (rowId?: string) => void;
  /** Optional: custom avatar renderer for party; when provided, used instead of initials circle (e.g. contact profile picture). */
  renderPartyAvatar?: (row: LedgerRow) => ReactNode;
  /** Fleet drivers (avatar_url / avatar_seed) for default driver avatars when `renderPartyAvatar` is unset or returns null. */
  driverRows?: DriverRow[];
  /** Optional signed/public image URLs by driver id (e.g. FinanceScreen `getProfileImage`). */
  driverProfileImageUrls?: Record<string, string>;
  /** Called when user taps "Load more" — signals the parent to fetch the next page. */
  onLoadMore?: () => void;
  /** When true, shows a loading spinner instead of the "Load more" button. */
  loadingMore?: boolean;
}

export function LedgerTransactionListView({
  transactions,
  onRowPress,
  expandedRowId,
  expandedRowData,
  expandedDesktopThreeColumn = false,
  highlightId,
  showTitle = true,
  tripDetailsMap,
  getVehicleNumberForTripId,
  tripOptions = [],
  onMissionChange,
  showHistoryHeader = false,
  onSearchPress,
  onScanPress,
  showGridFooter = false,
  onAddTransactionPress,
  showFiscalSubTabs = true,
  useTimelineLayout = false,
  fiscalViewMode: fiscalViewModeProp,
  onFiscalViewModeChange,
  useFlatList = false,
  embedInParentScroll = false,
  fullWidth = false,
  onExportPress,
  renderPartyAvatar,
  driverRows = [],
  driverProfileImageUrls,
  onLoadMore,
  loadingMore = false,
}: LedgerTransactionListViewProps) {
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const { t } = useLanguage();
  const [tripPickerRowId, setTripPickerRowId] = useState<string | null>(null);
  const [fiscalViewModeInternal, setFiscalViewModeInternal] = useState<
    "card" | "table"
  >("card");
  const fiscalViewMode = fiscalViewModeProp ?? fiscalViewModeInternal;
  const setFiscalViewMode = onFiscalViewModeChange ?? setFiscalViewModeInternal;

  const driverByIdForAvatar = useMemo(() => {
    const m = new Map<
      string,
      { avatar_url?: string | null; avatar_seed?: string | null }
    >();
    for (const d of driverRows) {
      m.set(d.id, {
        avatar_url: d.avatar_url ?? null,
        avatar_seed: d.avatar_seed ?? null,
      });
    }
    return m;
  }, [driverRows]);

  const resolvePartyAvatarForRow = useCallback(
    (row: LedgerRow) =>
      renderPartyAvatar?.(row) ??
      defaultDriverPartyAvatar(row, driverByIdForAvatar, driverProfileImageUrls),
    [renderPartyAvatar, driverByIdForAvatar, driverProfileImageUrls],
  );

  const { groups, cumulativeByKey } = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const da = a.transaction_date ?? a.created_at ?? "";
      const db = b.transaction_date ?? b.created_at ?? "";
      return db.localeCompare(da);
    });
    if (useFlatList) {
      let paid = 0;
      let received = 0;
      for (const r of sorted) {
        received += Number(r.amount_in ?? 0);
        paid += Number(r.amount_out ?? 0);
      }
      return {
        groups: [{ key: "_all", rows: sorted }],
        cumulativeByKey: { _all: { paid, received } } as Record<
          string,
          { paid: number; received: number }
        >,
      };
    }
    const keyToRows = new Map<string, LedgerRow[]>();
    for (const row of sorted) {
      const key = dateKey(row.transaction_date ?? row.created_at) ?? "—";
      if (!keyToRows.has(key)) keyToRows.set(key, []);
      keyToRows.get(key)!.push(row);
    }
    const keys = Array.from(keyToRows.keys()).filter((k) => k !== "—");
    if (keyToRows.has("—")) keys.push("—");
    let runPaid = 0;
    let runReceived = 0;
    const cumulativeByKey: Record<string, { paid: number; received: number }> =
      {};
    for (const key of keys) {
      const rows = keyToRows.get(key) ?? [];
      for (const r of rows) {
        runReceived += Number(r.amount_in ?? 0);
        runPaid += Number(r.amount_out ?? 0);
      }
      cumulativeByKey[key] = { paid: runPaid, received: runReceived };
    }
    return {
      groups: keys.map((key) => ({ key, rows: keyToRows.get(key) ?? [] })),
      cumulativeByKey,
    };
  }, [transactions, useFlatList]);

  if (transactions.length === 0) {
    return (
      <View style={styles.wrap}>
        <View
          style={[styles.emptyState, fullWidth && { paddingHorizontal: 0 }]}
        >
          <TinyEmptyLottie source={EMPTY_STATE_LOTTIE.transactions} size={64} />
          <Text style={styles.emptyStateTitle}>No transactions yet</Text>
          <Text style={styles.emptyStateSubtext}>
            Transactions will appear here when added.
          </Text>
        </View>
      </View>
    );
  }

  const tripOptionIds = new Set(tripOptions.map((o) => o.id));
  const [fiscalSubTab, setFiscalSubTab] = useState<
    "transaction" | "table" | "analytics"
  >("transaction");
  const effectiveFiscalSubTab = showFiscalSubTabs
    ? fiscalSubTab
    : "transaction";

  /** Render "Secured" inside scroll so it does not sit fixed over the list on mobile */
  const showSecuredFooterInScroll =
    showGridFooter &&
    !(
      showHistoryHeader &&
      useTimelineLayout &&
      (effectiveFiscalSubTab === "analytics" ||
        effectiveFiscalSubTab === "table")
    );

  /** Timeline: which date sections are expanded. When undefined, all sections are expanded (opened) by default. */
  const [expandedSectionsByKey, setExpandedSectionsByKey] = useState<
    Record<string, boolean>
  >({});
  /** Timeline: per-section flow filter for daily data. */
  const [sectionFlowFilterByKey, setSectionFlowFilterByKey] = useState<
    Record<string, "all" | "out" | "in">
  >({});

  /** All date-section dropdowns are open by default (undefined => expanded). User can collapse via toggle. */
  const isSectionExpanded = (key: string) =>
    expandedSectionsByKey[key] !== false;
  const toggleSectionExpanded = (key: string) => {
    setExpandedSectionsByKey((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  };
  const getSectionFlowFilter = (key: string): "all" | "out" | "in" =>
    sectionFlowFilterByKey[key] ?? "all";
  const setSectionFlowFilter = (key: string, filter: "all" | "out" | "in") => {
    setSectionFlowFilterByKey((prev) => ({ ...prev, [key]: filter }));
  };

  const getVehicleForRow = useCallback(
    (row: LedgerRow): string => {
      const fromRow = (row.vehicle_number ?? "").trim();
      if (fromRow) return formatIndianVehicleNumber(fromRow);
      if (row.trip_id && tripDetailsMap?.[row.trip_id]) {
        const fromTrip = (tripDetailsMap[row.trip_id].vehicle_number ?? "").trim();
        if (fromTrip) return formatIndianVehicleNumber(fromTrip);
      }
      const fromLookup = getVehicleNumberForTripId?.(row.trip_id ?? null);
      if (fromLookup) return formatIndianVehicleNumber(fromLookup);
      return "";
    },
    [getVehicleNumberForTripId, tripDetailsMap],
  );

  /** Vehicle type for display (e.g. "40 ft container", from vehicle_body_type or vehicle_type). */
  const getVehicleTypeForRow = (row: LedgerRow): string => {
    if (!row.trip_id || !tripDetailsMap?.[row.trip_id]) return "";
    const d = tripDetailsMap[row.trip_id];
    const body = (d.vehicle_body_type ?? "").trim();
    const type = (d.vehicle_type ?? "").trim();
    return body || type || "";
  };

  return (
    <View style={[styles.wrap, embedInParentScroll && styles.wrapEmbedded]}>
      {showHistoryHeader && useTimelineLayout && showFiscalSubTabs ? (
        <View
          style={[styles.streamHeader, fullWidth && { paddingHorizontal: 16 }]}
        >
          <View style={styles.streamHeaderTop}>
            <View style={styles.streamHeaderTopLeft}>
              <Text style={styles.streamHeaderHistoryTitle}>History</Text>
              <View style={styles.streamHeaderDivider} />
              <Text style={styles.streamHeaderSubtitle}>Grid Stream</Text>
            </View>
            <View style={styles.streamHeaderActions}>
              {onSearchPress != null && (
                <TouchableOpacity
                  onPress={onSearchPress}
                  style={styles.headerIconBtn}
                  hitSlop={12}
                >
                  <FontAwesome
                    name="search"
                    size={16}
                    color={Theme.textMuted}
                  />
                </TouchableOpacity>
              )}
              {onScanPress != null && (
                <TouchableOpacity
                  onPress={onScanPress}
                  style={styles.headerIconBtn}
                  hitSlop={12}
                >
                  <FontAwesome
                    name="qrcode"
                    size={16}
                    color={Theme.textMuted}
                  />
                </TouchableOpacity>
              )}
              {onAddTransactionPress != null && (
                <TouchableOpacity
                  onPress={onAddTransactionPress}
                  style={styles.streamHeaderAddBtn}
                  activeOpacity={0.8}
                >
                  <FontAwesome
                    name="plus"
                    size={18}
                    color={Theme.textOnPrimary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.streamTabs}>
            <TouchableOpacity
              style={[
                styles.streamTab,
                fiscalSubTab === "transaction" && styles.streamTabActive,
              ]}
              onPress={() => setFiscalSubTab("transaction")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.streamTabText,
                  fiscalSubTab === "transaction" && styles.streamTabTextActive,
                ]}
              >
                Transaction
              </Text>
              {fiscalSubTab === "transaction" && (
                <View style={styles.streamTabUnderline} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.streamTab,
                fiscalSubTab === "table" && styles.streamTabActive,
              ]}
              onPress={() => setFiscalSubTab("table")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.streamTabText,
                  fiscalSubTab === "table" && styles.streamTabTextActive,
                ]}
              >
                Table
              </Text>
              {fiscalSubTab === "table" && (
                <View style={styles.streamTabUnderline} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.streamTab,
                fiscalSubTab === "analytics" && styles.streamTabActive,
              ]}
              onPress={() => setFiscalSubTab("analytics")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.streamTabText,
                  fiscalSubTab === "analytics" && styles.streamTabTextActive,
                ]}
              >
                Analytics
              </Text>
              {fiscalSubTab === "analytics" && (
                <View style={styles.streamTabUnderline} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : showHistoryHeader && !useTimelineLayout ? (
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>History</Text>
          <View style={styles.historyActions}>
            {onSearchPress != null && (
              <TouchableOpacity
                onPress={onSearchPress}
                style={styles.headerIconBtn}
                hitSlop={12}
              >
                <FontAwesome name="search" size={18} color={Theme.textMuted} />
              </TouchableOpacity>
            )}
            {onScanPress != null && (
              <TouchableOpacity
                onPress={onScanPress}
                style={styles.headerIconBtn}
                hitSlop={12}
              >
                <FontAwesome name="qrcode" size={18} color={Theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : null}
      {showTitle && !showHistoryHeader && (
        <Text style={styles.title}>
          {t("transactionHistory") || "Transaction history"}
        </Text>
      )}
      <View style={styles.list}>
        {showHistoryHeader &&
        useTimelineLayout &&
        effectiveFiscalSubTab === "analytics" ? (
          <FinanceAnalyticsView
            transactions={transactions}
            tripDetailsMap={
              (tripDetailsMap ?? undefined) as
                | AnalyticsTripDetailMap
                | undefined
            }
          />
        ) : showHistoryHeader &&
          useTimelineLayout &&
          effectiveFiscalSubTab === "table" ? (
          <ScrollView
            style={styles.tableViewScroll}
            contentContainerStyle={styles.tableViewScrollContent}
            showsVerticalScrollIndicator={false}
            {...tabBarScrollProps}
          >
            {groups.map(({ key, rows: sectionRows }) => {
              const dayIn = sectionRows.reduce(
                (s, r) => s + Number(r.amount_in ?? 0),
                0,
              );
              const dayOut = sectionRows.reduce(
                (s, r) => s + Number(r.amount_out ?? 0),
                0,
              );
              const flowFilter = getSectionFlowFilter(key);
              const filteredRows =
                flowFilter === "out"
                  ? sectionRows.filter((r) => Number(r.amount_out ?? 0) > 0)
                  : flowFilter === "in"
                    ? sectionRows.filter((r) => Number(r.amount_in ?? 0) > 0)
                    : sectionRows;
              return (
                <View key={key} style={styles.tableViewSection}>
                  <LedgerDayDivider
                    dateStr={ledgerDividerDateIso(key)}
                    label={key === "—" ? "Other" : undefined}
                    paidLabel={formatINRChip(dayOut)}
                    receivedLabel={formatINRChip(dayIn)}
                    flowFilter={flowFilter}
                    onToggleExpand={() => toggleSectionExpanded(key)}
                    onFlowFilter={(filter) => setSectionFlowFilter(key, filter)}
                  />
                  {isSectionExpanded(key) ? (
                    <View style={styles.tableViewMetaRow}>
                      <Text style={styles.tableViewDateBarCount}>
                        {sectionRows.length} transactions
                      </Text>
                    </View>
                  ) : null}
                  {isSectionExpanded(key) && (
                    <View style={styles.tableViewTable}>
                      <View style={styles.tableViewHeader}>
                        <View
                          style={[
                            styles.tableViewHeaderCell,
                            styles.tableViewCol1,
                          ]}
                        >
                          <Text style={styles.tableViewTh} numberOfLines={1}>
                            Party / Date · Type
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.tableViewHeaderCell,
                            styles.tableViewCol2,
                          ]}
                        >
                          <Text style={styles.tableViewTh} numberOfLines={1}>
                            Date / Route
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.tableViewHeaderCell,
                            styles.tableViewCol3,
                          ]}
                        >
                          <Text
                            style={[styles.tableViewTh, styles.tableViewThIn]}
                            numberOfLines={1}
                          >
                            In
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.tableViewHeaderCell,
                            styles.tableViewCol4,
                          ]}
                        >
                          <Text
                            style={[styles.tableViewTh, styles.tableViewThOut]}
                            numberOfLines={1}
                          >
                            Out
                          </Text>
                        </View>
                      </View>
                      {filteredRows.map((row) => {
                        const dateStr = formatTxDate(
                          row.transaction_date ?? row.created_at,
                        );
                        const typeLabel =
                          getDoubleEntryDisplayLabel(row) ??
                          row.description ??
                          row.party_name ??
                          "—";
                        const partyName =
                          (row.party_name ?? "").trim() || typeLabel || "—";
                        const inAmt = Number(row.amount_in ?? 0);
                        const outAmt = Number(row.amount_out ?? 0);
                        const isIn = inAmt > 0;
                        const tripIdOnly = tripNumberForPill(
                          row,
                          tripDetailsMap,
                        );
                        const routeStr = tripRouteOnly(row, tripDetailsMap);
                        const tripDateStr =
                          row.trip_id && tripDetailsMap?.[row.trip_id]
                            ? formatTxDate(
                                tripDetailsMap[row.trip_id].pickup_date ??
                                  undefined,
                              )
                            : dateStr;
                        const isExpanded =
                          expandedRowId != null && row.id === expandedRowId;
                        return (
                          <View key={row.id}>
                            <TouchableOpacity
                              style={[
                                styles.tableViewRow,
                                isExpanded && styles.tableViewRowExpanded,
                              ]}
                              onPress={() => onRowPress?.(row.id)}
                              activeOpacity={0.7}
                            >
                              <View
                                style={[
                                  styles.tableViewCell,
                                  styles.tableViewCol1,
                                ]}
                              >
                                <Text
                                  style={styles.tableViewCellParty}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {partyName}
                                </Text>
                                <Text
                                  style={[
                                    styles.tableViewCellMetaText,
                                    styles.tableViewCellMetaRow,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {dateStr}
                                </Text>
                                <Text
                                  style={[
                                    styles.tableViewCellMetaText,
                                    styles.tableViewCellMetaRow,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {typeLabel}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.tableViewCell,
                                  styles.tableViewCol2,
                                ]}
                              >
                                <Text
                                  style={styles.tableViewCellRoute}
                                  numberOfLines={2}
                                >
                                  {routeStr ?? "—"}
                                </Text>
                                <Text
                                  style={[
                                    styles.tableViewCellMetaText,
                                    styles.tableViewCellMetaRow,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {tripDateStr}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.tableViewCell,
                                  styles.tableViewCol3,
                                ]}
                              >
                                {isIn ? (
                                  <View style={styles.tableViewCellAmountWrap}>
                                    <Text
                                      style={[
                                        styles.tableViewCellAmount,
                                        styles.tableViewCellAmountIn,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      ₹{formatLedgerAmount(inAmt)}
                                    </Text>
                                    <Text
                                      style={styles.tableViewCellAmountLabel}
                                      numberOfLines={1}
                                    >
                                      Received
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.tableViewCellDashWrap}>
                                    <Text style={styles.tableViewCellDash}>
                                      —
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View
                                style={[
                                  styles.tableViewCell,
                                  styles.tableViewCol4,
                                ]}
                              >
                                {!isIn ? (
                                  <View style={styles.tableViewCellAmountWrap}>
                                    <Text
                                      style={[
                                        styles.tableViewCellAmount,
                                        styles.tableViewCellAmountOut,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      ₹{formatLedgerAmount(outAmt)}
                                    </Text>
                                    <Text
                                      style={styles.tableViewCellAmountLabelOut}
                                      numberOfLines={1}
                                    >
                                      Paid
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.tableViewCellDashWrap}>
                                    <Text style={styles.tableViewCellDash}>
                                      —
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                            {isExpanded && (
                              <View style={styles.tableViewExpanded}>
                                <View style={styles.tableViewExpandedCard}>
                                  <View style={styles.tableViewExpandedTop}>
                                    <View
                                      style={styles.tableViewExpandedNarrative}
                                    >
                                      <Text
                                        style={
                                          styles.tableViewExpandedNarrativeLabel
                                        }
                                      >
                                        Note
                                      </Text>
                                      <Text
                                        style={
                                          styles.tableViewExpandedNarrativeText
                                        }
                                        numberOfLines={3}
                                      >
                                        {(row.description ?? "").trim() || "—"}
                                      </Text>
                                    </View>
                                    <TouchableOpacity
                                      style={styles.tableViewExpandedExportBtn}
                                      onPress={() => onExportPress?.(row.id)}
                                      activeOpacity={0.8}
                                      hitSlop={Layout.touchTargetHitSlop}
                                    >
                                      <FontAwesome
                                        name="cloud-download"
                                        size={12}
                                        color={Theme.textOnPrimary}
                                      />
                                    </TouchableOpacity>
                                  </View>
                                  <View
                                    style={styles.tableViewExpandedDivider}
                                  />
                                  <View style={styles.tableViewExpandedGrid}>
                                    <View>
                                      <Text
                                        style={
                                          styles.tableViewExpandedGridLabel
                                        }
                                      >
                                        Trip
                                      </Text>
                                      <Text
                                        style={
                                          styles.tableViewExpandedGridValue
                                        }
                                        numberOfLines={1}
                                      >
                                        {tripIdOnly ?? "—"}
                                      </Text>
                                    </View>
                                    <View>
                                      <Text
                                        style={
                                          styles.tableViewExpandedGridLabel
                                        }
                                      >
                                        Vehicle
                                      </Text>
                                      <Text
                                        style={
                                          styles.tableViewExpandedGridValue
                                        }
                                        numberOfLines={1}
                                      >
                                        {getVehicleForRow(row) || "—"}
                                      </Text>
                                    </View>
                                    <View>
                                      <Text
                                        style={
                                          styles.tableViewExpandedGridLabel
                                        }
                                      >
                                        Date
                                      </Text>
                                      <Text
                                        style={
                                          styles.tableViewExpandedGridValue
                                        }
                                        numberOfLines={1}
                                      >
                                        {formatTxDateLong(
                                          row.transaction_date ??
                                            row.created_at,
                                        )}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                                {onMissionChange && (
                                  <View style={styles.linkTripWrap}>
                                    <TouchableOpacity
                                      style={styles.linkTripBtn}
                                      onPress={() => setTripPickerRowId(row.id)}
                                      activeOpacity={0.7}
                                    >
                                      <FontAwesome
                                        name="link"
                                        size={11}
                                        color={Theme.primary}
                                      />
                                      <Text style={styles.linkTripText}>
                                        Link to trip
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
            {showSecuredFooterInScroll && (
              <View style={styles.gridFooter}>
                <FontAwesome name="shield" size={28} color={Theme.textMuted} />
                <Text style={styles.gridFooterText}>Secured</Text>
              </View>
            )}
            <View style={styles.scrollBottomSpacer} />
          </ScrollView>
        ) : (
          (() => {
            const ScrollWrapper = embedInParentScroll ? View : ScrollView;
            const scrollWrapperProps = embedInParentScroll
              ? {}
              : {
                  showsVerticalScrollIndicator: false,
                  style: styles.ledgerMainScroll,
                  contentContainerStyle: styles.ledgerMainScrollContent,
                  ...tabBarScrollProps,
                };
            return (
              <ScrollWrapper {...scrollWrapperProps}>
                {groups.map(({ key, rows: sectionRows }) => {
                  const cum = cumulativeByKey[key];
                  const sectionLabel =
                    key === "—" ? "Other" : sectionTitleForKey(key);
                  const dayOut = sectionRows.reduce(
                    (s, r) => s + Number(r.amount_out ?? 0),
                    0,
                  );
                  const dayIn = sectionRows.reduce(
                    (s, r) => s + Number(r.amount_in ?? 0),
                    0,
                  );
                  return (
                    <View
                      key={key}
                      style={[
                        styles.section,
                        useTimelineLayout && styles.sectionTimeline,
                      ]}
                    >
                      {!useFlatList &&
                        (useTimelineLayout ? (
                          <LedgerDayDivider
                            dateStr={ledgerDividerDateIso(key)}
                            label={key === "—" ? "Other" : undefined}
                            paidLabel={formatINRChip(dayOut)}
                            receivedLabel={formatINRChip(dayIn)}
                            flowFilter={getSectionFlowFilter(key)}
                            onToggleExpand={() => toggleSectionExpanded(key)}
                            onFlowFilter={(filter) =>
                              setSectionFlowFilter(key, filter)
                            }
                          />
                        ) : (
                          <View style={styles.sectionBar}>
                            <Text
                              style={styles.sectionDateLabel}
                              numberOfLines={1}
                            >
                              {sectionLabel.toUpperCase()}
                            </Text>
                            {cum != null && (
                              <View style={styles.cumulativeBlock}>
                                <Text style={styles.cumulativeHint}>
                                  To date
                                </Text>
                                <View style={styles.cumulativeRow}>
                                  <Text style={styles.cumulativePaid}>
                                    Paid ₹{formatLedgerAmount(cum.paid)}
                                  </Text>
                                  <Text style={styles.cumulativeDot}> </Text>
                                  <Text style={styles.cumulativeReceived}>
                                    Received ₹{formatLedgerAmount(cum.received)}
                                  </Text>
                                </View>
                              </View>
                            )}
                          </View>
                        ))}
                      {useTimelineLayout ? (
                        isSectionExpanded(key) &&
                        effectiveFiscalSubTab === "transaction" ? (
                          <View
                            style={[
                              styles.fiscalTransactionRows,
                              fullWidth && { paddingHorizontal: 0 },
                            ]}
                          >
                            {(() => {
                              const flowFilter = getSectionFlowFilter(key);
                              const filteredRows =
                                flowFilter === "all"
                                  ? sectionRows
                                  : flowFilter === "out"
                                    ? sectionRows.filter(
                                        (r) => Number(r.amount_out ?? 0) > 0,
                                      )
                                    : sectionRows.filter(
                                        (r) => Number(r.amount_in ?? 0) > 0,
                                      );
                              const txRows =
                                expandedRowId != null
                                  ? [...filteredRows].sort((a, b) =>
                                      a.id === expandedRowId
                                        ? -1
                                        : b.id === expandedRowId
                                          ? 1
                                          : 0,
                                    )
                                  : filteredRows;
                              return txRows.map((row, rowIndex) => {
                                const typeLabel =
                                  getDoubleEntryDisplayLabel(row) ??
                                  row.description ??
                                  row.party_name ??
                                  "—";
                                const tripIdOnly = tripNumberForPill(
                                  row,
                                  tripDetailsMap,
                                );
                                const inAmt = Number(row.amount_in ?? 0);
                                const outAmt = Number(row.amount_out ?? 0);
                                const isIn = inAmt > 0;
                                const amount = isIn ? inAmt : outAmt;
                                const isExpanded =
                                  expandedRowId != null &&
                                  row.id === expandedRowId;
                                const partyName =
                                  (row.party_name ?? "").trim() ||
                                  typeLabel ||
                                  "—";
                                const routeStr = tripRouteOnly(
                                  row,
                                  tripDetailsMap,
                                );
                                const routeWhyLine =
                                  [routeStr, typeLabel]
                                    .filter(Boolean)
                                    .join(" • ") || "—";
                                const dateDisplay = formatTxDateLong(
                                  row.transaction_date ?? row.created_at,
                                );
                                const agingStr = getAgingLabel(
                                  row.transaction_date ?? row.created_at,
                                );
                                const avatarBg = avatarColor(partyName);
                                const customAvatar = resolvePartyAvatarForRow(row);
                                const isLastRow =
                                  rowIndex === txRows.length - 1;
                                return (
                                  <View
                                    key={row.id}
                                    style={[
                                      styles.fiscalCardWrap,
                                      !isLastRow &&
                                        styles.fiscalCardWrapSeparator,
                                    ]}
                                  >
                                    <TouchableOpacity
                                      style={[
                                        styles.fiscalCard,
                                        isExpanded && styles.fiscalCardExpanded,
                                      ]}
                                      onPress={() => onRowPress?.(row.id)}
                                      activeOpacity={0.9}
                                    >
                                      <View style={styles.fiscalCardInner}>
                                        {customAvatar ? (
                                          <View
                                            style={
                                              styles.fiscalCardAvatarImageWrap
                                            }
                                          >
                                            {customAvatar}
                                          </View>
                                        ) : (
                                          <View
                                            style={[
                                              styles.fiscalCardAvatar,
                                              { backgroundColor: avatarBg },
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.fiscalCardAvatarText,
                                                {
                                                  color:
                                                    partyAvatarInitialsTextColor(
                                                      avatarBg,
                                                    ),
                                                },
                                              ]}
                                              numberOfLines={1}
                                            >
                                              {initials(partyName)}
                                            </Text>
                                          </View>
                                        )}
                                        <View style={styles.fiscalCardBody}>
                                          <Text
                                            style={styles.fiscalCardParty}
                                            numberOfLines={1}
                                          >
                                            {partyName}
                                          </Text>
                                          <Text
                                            style={styles.fiscalCardDate}
                                            numberOfLines={1}
                                          >
                                            {dateDisplay}
                                          </Text>
                                          <Text
                                            style={styles.fiscalCardRouteWhy}
                                            numberOfLines={2}
                                          >
                                            {routeWhyLine}
                                          </Text>
                                        </View>
                                        <View style={styles.fiscalCardRight}>
                                          {tripIdOnly ? (
                                            onMissionChange ? (
                                              <TouchableOpacity
                                                style={styles.fiscalCardPill}
                                                onPress={(e) => {
                                                  e?.stopPropagation?.();
                                                  setTripPickerRowId(row.id);
                                                }}
                                                activeOpacity={0.8}
                                                hitSlop={8}
                                              >
                                                <FontAwesome
                                                  name="check-circle"
                                                  size={7}
                                                  color={Theme.darkGreen}
                                                  style={
                                                    styles.fiscalCardPillIcon
                                                  }
                                                />
                                                <Text
                                                  style={
                                                    styles.fiscalCardPillText
                                                  }
                                                  numberOfLines={1}
                                                >
                                                  {tripIdOnly}
                                                </Text>
                                              </TouchableOpacity>
                                            ) : (
                                              <View style={styles.fiscalCardPill}>
                                                <FontAwesome
                                                  name="check-circle"
                                                  size={7}
                                                  color={Theme.darkGreen}
                                                  style={
                                                    styles.fiscalCardPillIcon
                                                  }
                                                />
                                                <Text
                                                  style={
                                                    styles.fiscalCardPillText
                                                  }
                                                  numberOfLines={1}
                                                >
                                                  {tripIdOnly}
                                                </Text>
                                              </View>
                                            )
                                          ) : null}
                                          <Text
                                            style={[
                                              styles.fiscalCardAmount,
                                              isIn
                                                ? styles.fiscalCardAmountIn
                                                : styles.fiscalCardAmountOut,
                                            ]}
                                            numberOfLines={1}
                                          >
                                            {isIn ? "+" : "−"} ₹
                                            {formatLedgerAmount(amount)}
                                          </Text>
                                        </View>
                                      </View>
                                    </TouchableOpacity>
                                    {isExpanded && (
                                      <View style={styles.fiscalExpanded}>
                                        {expandedRowData != null &&
                                        expandedRowId === row.id ? (
                                          <LedgerExpandedCardFromData
                                            data={expandedRowData}
                                            enableDesktopThreeColumn={
                                              expandedDesktopThreeColumn
                                            }
                                          />
                                        ) : (
                                          <TransactionRowDetail row={row} />
                                        )}
                                        {onMissionChange && (
                                          <View style={styles.linkTripWrap}>
                                            <TouchableOpacity
                                              style={styles.linkTripBtn}
                                              onPress={() =>
                                                setTripPickerRowId(row.id)
                                              }
                                              activeOpacity={0.7}
                                            >
                                              <FontAwesome
                                                name="link"
                                                size={11}
                                                color={Theme.primary}
                                              />
                                              <Text style={styles.linkTripText}>
                                                Link to trip
                                              </Text>
                                            </TouchableOpacity>
                                          </View>
                                        )}
                                      </View>
                                    )}
                                  </View>
                                );
                              });
                            })()}
                          </View>
                        ) : null
                      ) : fiscalViewMode === "table" ? (
                        <View style={styles.tableWrap}>
                          <View style={styles.tableHeader}>
                            <Text
                              style={[styles.tableHeaderCell, styles.tableCol1]}
                              numberOfLines={1}
                            >
                              Party / Date · Type
                            </Text>
                            <Text
                              style={[styles.tableHeaderCell, styles.tableCol2]}
                              numberOfLines={1}
                            >
                              Mission
                            </Text>
                            <Text
                              style={[styles.tableHeaderCell, styles.tableCol3]}
                              numberOfLines={1}
                            >
                              Paid
                            </Text>
                            <Text
                              style={[styles.tableHeaderCell, styles.tableCol4]}
                              numberOfLines={1}
                            >
                              Received
                            </Text>
                          </View>
                          {sectionRows.map((row) => {
                            const dateStr = formatTxDate(
                              row.transaction_date ?? row.created_at,
                            );
                            const typeLabel =
                              getDoubleEntryDisplayLabel(row) ??
                              row.description ??
                              row.party_name ??
                              "—";
                            const tripIdOnly = tripNumberForPill(
                              row,
                              tripDetailsMap,
                            );
                            const inAmt = Number(row.amount_in ?? 0);
                            const outAmt = Number(row.amount_out ?? 0);
                            const isIn = inAmt > 0;
                            const isExpanded =
                              expandedRowId != null && row.id === expandedRowId;
                            const partyName =
                              (row.party_name ?? "").trim() || typeLabel || "—";
                            const vehicleStr = getVehicleForRow(row);
                            const hasTrip =
                              tripIdOnly != null && tripIdOnly !== "";
                            const tableTripPill = hasTrip ? (
                              onMissionChange ? (
                                <TouchableOpacity
                                  style={styles.tableMissionPill}
                                  onPress={() => setTripPickerRowId(row.id)}
                                  activeOpacity={0.7}
                                  hitSlop={8}
                                >
                                  <Text
                                    style={styles.tableMissionPillText}
                                    numberOfLines={1}
                                  >
                                    {tripIdOnly?.slice(0, 5) ?? ""}
                                  </Text>
                                </TouchableOpacity>
                              ) : (
                                <View style={styles.tableMissionPill}>
                                  <Text
                                    style={styles.tableMissionPillText}
                                    numberOfLines={1}
                                  >
                                    {tripIdOnly ?? ""}
                                  </Text>
                                </View>
                              )
                            ) : null;
                            return (
                              <View key={row.id}>
                                <TouchableOpacity
                                  style={styles.tableRow}
                                  onPress={() => onRowPress?.(row.id)}
                                  activeOpacity={0.7}
                                >
                                  <View
                                    style={[
                                      styles.tableRowRibbon,
                                      isIn
                                        ? styles.tableRowRibbonIn
                                        : styles.tableRowRibbonOut,
                                    ]}
                                  />
                                  <View
                                    style={[styles.tableCell, styles.tableCol1]}
                                  >
                                    <Text
                                      style={styles.tableCellParty}
                                      numberOfLines={1}
                                    >
                                      {partyName}
                                    </Text>
                                    <Text
                                      style={styles.tableCellMeta}
                                      numberOfLines={1}
                                    >
                                      {(vehicleStr ? `${vehicleStr} · ` : "") +
                                        typeLabel}{" "}
                                      · {dateStr}
                                    </Text>
                                  </View>
                                  <View
                                    style={[styles.tableCell, styles.tableCol2]}
                                  >
                                    {tableTripPill}
                                  </View>
                                  <View
                                    style={[styles.tableCell, styles.tableCol3]}
                                  >
                                    <Text
                                      style={[
                                        styles.tableCellAmount,
                                        !isIn && styles.tableCellAmountOut,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {!isIn
                                        ? `₹${formatLedgerAmount(outAmt)}`
                                        : "—"}
                                    </Text>
                                  </View>
                                  <View
                                    style={[styles.tableCell, styles.tableCol4]}
                                  >
                                    <Text
                                      style={[
                                        styles.tableCellAmount,
                                        isIn && styles.tableCellAmountIn,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {isIn
                                        ? `₹${formatLedgerAmount(inAmt)}`
                                        : "—"}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                                {isExpanded && (
                                  <View style={styles.tableExpandedWrap}>
                                    {expandedRowData != null &&
                                    expandedRowId === row.id ? (
                                      <LedgerExpandedCardFromData
                                        data={expandedRowData}
                                        enableDesktopThreeColumn={
                                          expandedDesktopThreeColumn
                                        }
                                      />
                                    ) : (
                                      <TransactionRowDetail row={row} />
                                    )}
                                    {onMissionChange && (
                                      <View style={styles.linkTripWrap}>
                                        <TouchableOpacity
                                          style={styles.linkTripBtn}
                                          onPress={() =>
                                            setTripPickerRowId(row.id)
                                          }
                                          activeOpacity={0.7}
                                        >
                                          <FontAwesome
                                            name="link"
                                            size={11}
                                            color={Theme.primary}
                                          />
                                          <Text style={styles.linkTripText}>
                                            Link to trip
                                          </Text>
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        sectionRows.map((row) => {
                          const dateStr = formatTxDate(
                            row.transaction_date ?? row.created_at,
                          );
                          const typeLabel =
                            getDoubleEntryDisplayLabel(row) ??
                            row.description ??
                            row.party_name ??
                            "—";
                          const partyDetail = partyDetailLine(row);
                          const tripLine = tripDetailLine(row, tripDetailsMap);
                          const tripIdOnly = tripNumberForPill(
                            row,
                            tripDetailsMap,
                          );
                          const inAmt = Number(row.amount_in ?? 0);
                          const outAmt = Number(row.amount_out ?? 0);
                          const isIn = inAmt > 0;
                          const amount = isIn ? inAmt : outAmt;
                          const isExpanded =
                            expandedRowId != null && row.id === expandedRowId;
                          const isHighlighted =
                            highlightId != null && row.id === highlightId;
                          const partyName =
                            (row.party_name ?? "").trim() || typeLabel || "—";
                          const routeStr = tripRouteOnly(row, tripDetailsMap);
                          const belowDate =
                            [routeStr, typeLabel].filter(Boolean).join(" · ") ||
                            null;
                          const vehicleStr = getVehicleForRow(row);
                          const dateVehicleLine =
                            [dateStr, routeStr, vehicleStr]
                              .filter(Boolean)
                              .join(" · ") || dateStr;
                          const avatarBg = avatarColor(partyName);
                          const initialText = initials(partyName);
                          const customAvatar = resolvePartyAvatarForRow(row);

                          const routeWhyLine =
                            [routeStr, typeLabel].filter(Boolean).join(" • ") ||
                            null;
                          const hasTrip =
                            tripIdOnly != null && tripIdOnly !== "";
                          const tripPillContent = (
                            <View style={styles.rightMetaStack}>
                              {vehicleStr ? (
                                <View style={styles.vehiclePill}>
                                  <FontAwesome
                                    name="truck"
                                    size={9}
                                    color={Theme.primary}
                                    style={styles.vehiclePillIcon}
                                  />
                                  <Text
                                    style={styles.vehiclePillText}
                                    numberOfLines={1}
                                  >
                                    {vehicleStr}
                                  </Text>
                                </View>
                              ) : null}
                              {hasTrip ? (
                                onMissionChange ? (
                                  <TouchableOpacity
                                    style={styles.tripPillWithCheck}
                                    onPress={() => setTripPickerRowId(row.id)}
                                    activeOpacity={0.7}
                                    hitSlop={8}
                                  >
                                    <FontAwesome
                                      name="check-circle"
                                      size={8}
                                      color={Theme.darkGreen}
                                      style={styles.tripPillCheckIcon}
                                    />
                                    <Text
                                      style={styles.tripPillTextOnlyLabel}
                                      numberOfLines={1}
                                    >
                                      {tripIdOnly}
                                    </Text>
                                  </TouchableOpacity>
                                ) : (
                                  <View style={styles.tripPillWithCheck}>
                                    <FontAwesome
                                      name="check-circle"
                                      size={8}
                                      color={Theme.darkGreen}
                                      style={styles.tripPillCheckIcon}
                                    />
                                    <Text
                                      style={styles.tripPillTextOnlyLabel}
                                      numberOfLines={1}
                                    >
                                      {tripIdOnly}
                                    </Text>
                                  </View>
                                )
                              ) : onMissionChange ? (
                                <TouchableOpacity
                                  style={styles.tripPillLink}
                                  onPress={() => setTripPickerRowId(row.id)}
                                  activeOpacity={0.7}
                                  hitSlop={8}
                                >
                                  <FontAwesome
                                    name="link"
                                    size={8}
                                    color={Theme.primary}
                                  />
                                  <Text
                                    style={styles.tripPillLinkText}
                                    numberOfLines={1}
                                  >
                                    Link trip
                                  </Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          );

                          const amountEl = (
                            <Text
                              style={[
                                styles.amount,
                                styles.amountItalic,
                                isIn ? styles.amountIn : styles.amountOut,
                              ]}
                              numberOfLines={1}
                            >
                              {isIn ? "+" : "−"} ₹{formatLedgerAmount(amount)}
                            </Text>
                          );

                          const leftContent = useTimelineLayout ? (
                            <>
                              {customAvatar ? (
                                <View style={styles.timelineCardAvatarImageWrap}>
                                  {customAvatar}
                                </View>
                              ) : (
                                <View style={styles.timelineCardAvatar}>
                                  <Text
                                    style={[
                                      styles.avatarText,
                                      {
                                        color:
                                          partyAvatarInitialsTextColor(
                                            avatarBg,
                                          ),
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {initialText}
                                  </Text>
                                </View>
                              )}
                              <View style={styles.timelineCardBody}>
                                <Text
                                  style={styles.timelineCardParty}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {partyName}
                                </Text>
                                <Text
                                  style={styles.timelineCardDateVehicle}
                                  numberOfLines={1}
                                >
                                  {vehicleStr
                                    ? `${dateStr} · ${vehicleStr}`
                                    : dateStr}
                                </Text>
                                {routeWhyLine != null ? (
                                  <Text
                                    style={styles.timelineCardRouteWhy}
                                    numberOfLines={1}
                                  >
                                    {routeWhyLine}
                                  </Text>
                                ) : null}
                              </View>
                            </>
                          ) : (
                            <>
                              {customAvatar ? (
                                <View
                                  style={[
                                    styles.avatarWrap,
                                    isIn
                                      ? styles.avatarWrapIn
                                      : styles.avatarWrapOut,
                                  ]}
                                >
                                  {customAvatar}
                                </View>
                              ) : (
                                <View
                                  style={[
                                    styles.avatarWrap,
                                    { backgroundColor: avatarBg },
                                    isIn
                                      ? styles.avatarWrapIn
                                      : styles.avatarWrapOut,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.avatarText,
                                      {
                                        color:
                                          partyAvatarInitialsTextColor(
                                            avatarBg,
                                          ),
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {initialText}
                                  </Text>
                                </View>
                              )}
                              <View style={styles.body}>
                                <Text
                                  style={styles.rowTitle}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {partyName}
                                </Text>
                                <Text style={styles.rowDate} numberOfLines={1}>
                                  {dateStr}
                                </Text>
                                {belowDate != null && (
                                  <Text
                                    style={styles.rowMeta}
                                    numberOfLines={1}
                                  >
                                    {belowDate}
                                  </Text>
                                )}
                              </View>
                            </>
                          );

                          const rightBlock = (
                            <View style={styles.rightCol}>
                              {getLedgerFlowForRow(row) ? (
                                <LedgerFlowChip row={row} />
                              ) : null}
                              {tripPillContent}
                              {onRowPress ? (
                                <TouchableOpacity
                                  style={styles.amountTouchArea}
                                  onPress={() => onRowPress(row.id)}
                                  activeOpacity={0.72}
                                >
                                  {amountEl}
                                </TouchableOpacity>
                              ) : (
                                amountEl
                              )}
                            </View>
                          );

                          const cardContent = useTimelineLayout ? (
                            <>
                              {onRowPress ? (
                                <TouchableOpacity
                                  style={styles.rowTouchable}
                                  onPress={() => onRowPress(row.id)}
                                  activeOpacity={0.72}
                                >
                                  {leftContent}
                                </TouchableOpacity>
                              ) : (
                                leftContent
                              )}
                              <View style={styles.rightCol}>
                                {getLedgerFlowForRow(row) ? (
                                  <LedgerFlowChip row={row} />
                                ) : null}
                                {tripPillContent}
                                {onRowPress ? (
                                  <TouchableOpacity
                                    style={styles.amountTouchArea}
                                    onPress={() => onRowPress(row.id)}
                                    activeOpacity={0.72}
                                  >
                                    {amountEl}
                                  </TouchableOpacity>
                                ) : (
                                  amountEl
                                )}
                              </View>
                            </>
                          ) : (
                            <>
                              {onRowPress ? (
                                <TouchableOpacity
                                  style={styles.rowTouchable}
                                  onPress={() => onRowPress(row.id)}
                                  activeOpacity={0.72}
                                >
                                  {leftContent}
                                </TouchableOpacity>
                              ) : (
                                leftContent
                              )}
                              {rightBlock}
                            </>
                          );

                          return (
                            <View
                              key={row.id}
                              style={[
                                styles.rowWrapper,
                                useTimelineLayout && styles.rowWrapperTimeline,
                              ]}
                            >
                              <View
                                style={[
                                  useTimelineLayout
                                    ? styles.rowCardTimeline
                                    : styles.rowCard,
                                  (isExpanded || isHighlighted) &&
                                    (useTimelineLayout
                                      ? styles.rowCardTimelineHighlighted
                                      : styles.rowCardHighlighted),
                                ]}
                              >
                                {cardContent}
                              </View>
                              {isExpanded && (
                                <>
                                  {useTimelineLayout ? (
                                    <TimelineExpandedDetail
                                      row={row}
                                      tripDetailsMap={tripDetailsMap}
                                      allTransactions={transactions}
                                      onDownloadPress={
                                        onExportPress
                                          ? () => onExportPress(row.id)
                                          : undefined
                                      }
                                    />
                                  ) : expandedRowData != null ? (
                                    <LedgerExpandedCardFromData
                                      data={expandedRowData}
                                      enableDesktopThreeColumn={
                                        expandedDesktopThreeColumn
                                      }
                                    />
                                  ) : (
                                    <TransactionRowDetail row={row} />
                                  )}
                                  {onMissionChange && !useTimelineLayout && (
                                    <View style={styles.linkTripWrap}>
                                      <TouchableOpacity
                                        style={styles.linkTripBtn}
                                        onPress={() =>
                                          setTripPickerRowId(row.id)
                                        }
                                        activeOpacity={0.7}
                                      >
                                        <FontAwesome
                                          name="link"
                                          size={11}
                                          color={Theme.primary}
                                        />
                                        <Text style={styles.linkTripText}>
                                          Link to trip
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                  );
                })}
                {showSecuredFooterInScroll && (
                  <View style={styles.gridFooter}>
                    <FontAwesome name="shield" size={28} color={Theme.textMuted} />
                    <Text style={styles.gridFooterText}>Secured</Text>
                  </View>
                )}
                {onLoadMore ? (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={onLoadMore}
                    disabled={loadingMore}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.loadMoreText}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.scrollBottomSpacer} />
              </ScrollWrapper>
            );
          })()
        )}
      </View>
      {tripPickerRowId &&
        (() => {
          const row = transactions.find((r) => r.id === tripPickerRowId);
          if (!row || !onMissionChange) return null;
          const partyKey = (row.party_name ?? "").trim().toLowerCase();
          const recIds = [
            ...new Set(
              transactions
                .filter(
                  (r) =>
                    (r.party_name ?? "").trim().toLowerCase() === partyKey &&
                    r.trip_id != null &&
                    tripOptionIds.has(r.trip_id),
                )
                .map((r) => r.trip_id!),
            ),
          ];
          const filtered =
            recIds.length > 0 || row.trip_id != null
              ? tripOptions.filter(
                  (t) =>
                    recIds.includes(t.id) ||
                    (row.trip_id != null && t.id === row.trip_id),
                )
              : tripOptions;
          const opts = filtered.map((t) => {
            const detail = tripDetailsMap?.[t.id];
            const route =
              (t as { route?: string | null }).route ??
              (t as { route_label?: string | null }).route_label ??
              (detail
                ? [detail.pickup_area, detail.drop_location]
                    .filter(Boolean)
                    .join(" → ") || null
                : null);
            const vehicle_type =
              (t as { vehicle_type?: string | null }).vehicle_type ??
              detail?.vehicle_body_type ??
              detail?.vehicle_type ??
              null;
            return {
              ...t,
              route: route ?? undefined,
              vehicle_type: vehicle_type ?? undefined,
            };
          });
          return (
            <TripPickerModal
              visible={true}
              onClose={() => setTripPickerRowId(null)}
              tripOptions={opts}
              recommendedTripIds={recIds}
              selectedTripId={row.trip_id ?? null}
              onSelect={(tripId) => {
                onMissionChange(row.id, tripId);
                setTripPickerRowId(null);
              }}
            />
          );
        })()}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Fill parent so ScrollView gets a bounded height (required for Cash tab scroll on web). */
  wrap: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    marginBottom: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  wrapEmbedded: {
    flex: 0,
    minHeight: undefined,
  },
  /** Web: ScrollView content must stretch to viewport width (avoids centered narrow column). */
  ledgerMainScroll: {
    width: '100%',
    flex: 1,
    minHeight: 0,
  },
  /** Do not use flexGrow here — it breaks vertical scrolling on web (content fills viewport). */
  ledgerMainScrollContent: {
    width: '100%',
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Layout.sectionSpacing * 2,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 12,
  },
  emptyStateIcon: {
    opacity: 0.5,
  },
  emptyStateTitle: {
    fontSize: FONT_SIZE_BODY_STRONG + 3,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  emptyStateSubtext: {
    fontSize: FONT_SIZE_BODY,
    color: Theme.textMuted,
    textAlign: "center",
  },
  fiscalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  fiscalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fiscalHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  fiscalTitle: {
    fontSize: 18,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  fiscalViewToggle: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 4,
    gap: 0,
  },
  fiscalViewToggleBtn: {
    width: 36,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  fiscalViewToggleBtnActive: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fiscalDivider: {
    width: 1,
    height: 12,
    backgroundColor: Theme.borderMedium,
    marginHorizontal: 2,
  },
  fiscalSubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  fiscalHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fiscalAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  streamHeader: {
    paddingHorizontal: Layout.screenPaddingHorizontal + 8,
    paddingTop: Layout.sectionSpacing,
    paddingBottom: Layout.headerPaddingBelowInset,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  streamHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  streamHeaderTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  streamHeaderHistoryTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  streamHeaderDivider: {
    width: 1,
    height: 14,
    backgroundColor: Theme.borderMedium,
  },
  streamHeaderSubtitle: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  streamHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  streamHeaderAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  streamTabs: {
    flexDirection: "row",
    marginTop: 0,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  streamTab: {
    paddingBottom: 14,
    position: "relative",
  },
  streamTabActive: {},
  streamTabText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  streamTabTextActive: {
    color: Theme.primary,
  },
  streamTabUnderline: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 1,
  },
  tableViewScroll: { flex: 1, width: '100%', minHeight: 0 },
  tableViewScrollContent: {
    width: '100%',
    paddingBottom: Layout.sectionSpacing + 8,
  },
  scrollBottomSpacer: { height: Layout.sectionSpacing },
  loadMoreBtn: {
    alignSelf: "center",
    marginVertical: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.06)",
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
    letterSpacing: 0.3,
  },
  tableViewSection: { marginBottom: 16 },
  tableViewMetaRow: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 6,
  },
  tableViewDateBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
  },
  tableViewDateBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tableViewDateBarChevron: { marginLeft: 2 },
  tableViewDateBarDate: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimary,
    textTransform: "uppercase",
  },
  tableViewDateBarDivider: {
    width: 1,
    height: 14,
    backgroundColor: Theme.borderMedium,
  },
  tableViewDateBarCount: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tableViewDateBarRight: { flexDirection: "row", gap: 16 },
  tableViewDateBarFlow: {
    alignItems: "flex-end",
    minWidth: 68,
    width: 68,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tableViewDateBarFlowActiveOut: { backgroundColor: "rgba(239,68,68,0.12)" },
  tableViewDateBarFlowActiveIn: { backgroundColor: "rgba(16,185,129,0.12)" },
  tableViewDateBarFlowLabel: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tableViewDateBarFlowOut: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textAlign: "right",
  },
  tableViewDateBarFlowIn: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.darkGreen,
    textAlign: "right",
  },
  tableViewTable: { backgroundColor: Theme.screenBackground },
  tableViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  tableViewHeaderCell: {
    minWidth: 0,
    justifyContent: "center",
  },
  tableViewTh: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tableViewCol1: { flex: 2, minWidth: 0 },
  tableViewCol2: { flex: 1.15, minWidth: 0 },
  tableViewCol3: { width: 72, alignItems: "flex-end", flexShrink: 0 },
  tableViewCol4: { width: 72, alignItems: "flex-end", flexShrink: 0 },
  tableViewThIn: { color: Theme.darkGreen, textAlign: "right" },
  tableViewThOut: { color: Theme.teslaRed, textAlign: "right" },
  tableViewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableViewRowExpanded: { backgroundColor: Theme.surfaceGray },
  tableViewCell: { minWidth: 0, justifyContent: "center" },
  tableViewCellParty: {
    fontSize: 12,
    fontWeight: "300",
    fontStyle: "italic",
    letterSpacing: -0.5,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tableViewCellMetaText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  tableViewCellMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    minWidth: 0,
  },
  tableViewCellMetaDivider: {
    width: 1,
    height: 8,
    backgroundColor: Theme.textMuted,
    opacity: 0.5,
  },
  tableViewCellMetaRow: {
    marginTop: 2,
  },
  tableViewCellTrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
    flex: 1,
  },
  tableViewCellTripId: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimary,
    fontStyle: "italic",
  },
  tableViewCellRoute: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "italic",
    flex: 1,
    minWidth: 0,
  },
  tableViewCellTripArrow: {
    marginHorizontal: 4,
  },
  tableViewCellAmountWrap: {
    alignItems: "flex-end",
    minWidth: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  tableViewCellAmount: {
    fontSize: 12,
    fontWeight: "300",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  tableViewCellAmountIn: { color: Theme.darkGreen },
  tableViewCellAmountOut: { color: Theme.teslaRed },
  tableViewCellAmountLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
    marginTop: 1,
    textAlign: "right",
    alignSelf: "stretch",
  },
  tableViewCellAmountLabelOut: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
    marginTop: 1,
    textAlign: "right",
    alignSelf: "stretch",
  },
  tableViewCellDashWrap: {
    alignItems: "flex-end",
    alignSelf: "stretch",
    justifyContent: "center",
    flex: 1,
  },
  tableViewCellDash: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "right",
    width: "100%",
  },
  tableViewExpanded: { paddingHorizontal: 16, paddingBottom: 12 },
  tableViewExpandedCard: {
    backgroundColor: Theme.darkSurface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  tableViewExpandedTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  tableViewExpandedNarrative: { flex: 1, minWidth: 0 },
  tableViewExpandedNarrativeLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  tableViewExpandedNarrativeText: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textOnPrimary,
    opacity: 0.9,
  },
  tableViewExpandedExportBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.driverWhiteMutedStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  tableViewExpandedDivider: {
    height: 1,
    backgroundColor: Theme.separatorDark,
    marginBottom: 12,
  },
  tableViewExpandedGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  tableViewExpandedGridLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  tableViewExpandedGridValue: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textOnPrimary,
  },
  dateSyncBar: {
    paddingBottom: 4,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
  },
  dateSyncBarSingleRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
  },
  dateSyncBarMetricCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 0,
    borderRadius: 8,
  },
  dateSyncBarMetricCellActiveOut: {
    backgroundColor: "rgba(248,113,113,0.1)",
  },
  dateSyncBarMetricCellActiveIn: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  dateSyncBarMetricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginVertical: 8,
  },
  dateSyncBarMetricCopy: {
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
    alignItems: "flex-start",
  },
  dateSyncBarDateCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingRight: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    flexShrink: 0,
    width: 68,
    justifyContent: "center",
  },
  dateSyncBarChevron: {
    marginLeft: 2,
  },
  dateSyncBarDate: {
    flex: 1,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    lineHeight: 12,
    textTransform: "none",
  },
  dateSyncBarHandshake: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    opacity: 0.7,
  },
  dateSyncBarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  dateSyncBarHandshakeText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dateSyncBarCardsWrap: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 4,
    paddingHorizontal: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dateSyncBarCardsRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  dateSyncBarCards: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateSyncBarCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: "transparent",
    minWidth: 0,
  },
  dateSyncBarCardOut: {
    paddingRight: 4,
  },
  dateSyncBarCardIn: {
    paddingLeft: 6,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderLight,
  },
  dateSyncBarCardActiveOut: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: 8,
  },
  dateSyncBarCardActiveIn: {
    backgroundColor: "rgba(34,197,94,0.1)",
    borderRadius: 8,
  },
  dateSyncBarCardText: {
    flex: 1,
    minWidth: 0,
  },
  dateSyncBarMetricStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 1,
    paddingRight: 2,
  },
  dateSyncBarCardLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  dateSyncBarCardAmount: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  dateSyncBarCardAmountOut: {
    color: Theme.teslaRed,
  },
  dateSyncBarCardAmountIn: {
    color: Theme.darkGreen,
  },
  dateSyncBarCardIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dateSyncBarCardIconOut: { backgroundColor: "rgba(239,68,68,0.25)" },
  dateSyncBarCardIconIn: { backgroundColor: "rgba(16,185,129,0.25)" },
  fiscalTransactionRows: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: Layout.sectionSpacing / 2,
  },
  fiscalCardWrap: {},
  fiscalCardWrapSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 10,
    marginBottom: 4,
  },
  fiscalCard: {
    paddingVertical: 4,
    position: "relative",
    zIndex: 1,
  },
  fiscalCardExpanded: {
    paddingBottom: 8,
  },
  fiscalCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
    minWidth: 0,
  },
  fiscalCardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  fiscalCardAvatarImageWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  fiscalCardAvatarText: {
    fontSize: 9,
    fontWeight: "600",
  },
  fiscalCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingRight: 8,
  },
  fiscalCardParty: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  fiscalCardDate: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginTop: 2,
  },
  fiscalCardRouteWhy: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginTop: 3,
    lineHeight: 15,
  },
  fiscalCardRight: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    flexShrink: 0,
    minWidth: 88,
    maxWidth: 132,
    gap: 6,
  },
  fiscalCardPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    maxWidth: "100%",
  },
  fiscalCardPillIcon: { marginRight: 0 },
  fiscalCardPillText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: 0.15,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  fiscalCardAmount: {
    fontSize: 12,
    fontWeight: "600",
    fontStyle: "italic",
    letterSpacing: -0.3,
  },
  fiscalCardAmountIn: { color: Theme.darkGreen },
  fiscalCardAmountOut: { color: Theme.teslaRed },
  fiscalExpanded: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 4,
  },
  fiscalExpandedLedger: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    overflow: "hidden",
  },
  fiscalExpandedLedgerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: Theme.darkBackground,
  },
  fiscalExpandedLedgerBarText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  fiscalExpandedLedgerGrid: {
    padding: 20,
  },
  fiscalExpandedLedgerGridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  fiscalExpandedLedgerRow: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  fiscalExpandedLedgerRowRight: {
    alignItems: "flex-end",
  },
  fiscalExpandedLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  fiscalExpandedValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  fiscalExpandedValueItalic: { fontStyle: "italic" },
  fiscalExpandedValueIn: { color: Theme.darkGreen },
  fiscalExpandedValueOut: { color: Theme.teslaRed },
  fiscalExpandedMission: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    marginTop: 12,
    padding: 20,
    gap: 16,
  },
  fiscalExpandedMissionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  fiscalExpandedMissionHeaderRight: { alignItems: "flex-end" },
  fiscalExpandedMissionLabel: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  fiscalExpandedMissionValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: -0.3,
    textTransform: "uppercase",
  },
  fiscalExpandedMissionValueItalic: {
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  fiscalExpandedMissionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fiscalExpandedMissionRowRight: { alignItems: "flex-end" },
  fiscalExpandedMissionMargin: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.darkGreen,
  },
  fiscalExpandedExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 10,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  fiscalExpandedExportText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  streamRows: {
    flexDirection: "column",
  },
  streamRow: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    minHeight: 84,
  },
  streamRowAnchor: {
    width: TIMELINE_ANCHOR_WIDTH,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
  },
  streamAnchorTripId: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  streamAnchorTripIdIn: {
    color: Theme.darkGreen,
    opacity: 0.7,
  },
  streamAnchorTripIdOut: {
    color: Theme.teslaRed,
    opacity: 0.7,
  },
  streamAnchorVehicle: {
    fontSize: 6,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  streamAnchorVehicleType: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    textAlign: "center",
    fontStyle: "italic",
  },
  streamRowMain: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingLeft: 14,
  },
  streamRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  streamRowHeaderLeft: { flex: 1, minWidth: 0 },
  streamRowPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  streamPartyName: {
    fontSize: 12,
    fontWeight: "300",
    fontStyle: "italic",
    letterSpacing: -0.5,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    flex: 1,
    minWidth: 0,
  },
  streamRowWhyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streamWhy: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontStyle: "italic",
    flex: 1,
    minWidth: 0,
  },
  streamWhyDivider: {
    width: 1.5,
    height: 8,
    backgroundColor: Theme.borderLight,
  },
  streamVehicle: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  streamRowHeaderRight: { alignItems: "flex-end" },
  streamAmount: {
    fontSize: 16,
    fontWeight: "300",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  streamAmountIn: { color: Theme.darkGreen },
  streamAmountOut: { color: Theme.teslaRed },
  streamAging: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 3,
  },
  streamCorridor: {
    flexDirection: "column",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(249,250,251,0.6)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    gap: 8,
  },
  streamCorridorTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  streamCorridorOrigin: { flex: 1, minWidth: 0 },
  streamCorridorPlace: {
    fontSize: 6,
    fontWeight: "500",
    fontStyle: "italic",
    letterSpacing: -0.3,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  streamCorridorPlaceRight: { textAlign: "right" },
  streamCorridorLabel: {
    fontSize: 4,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 0,
  },
  streamCorridorLine: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  streamCorridorLineBar: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(99,102,241,0.3)",
  },
  streamCorridorIcons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  streamCorridorIconMuted: {
    opacity: 0.6,
  },
  streamCorridorDest: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  streamLinkTripCta: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(249,250,251,0.9)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderStyle: "dashed",
    gap: 12,
  },
  streamLinkTripCtaIcon: {
    opacity: 0.9,
  },
  streamLinkTripCtaTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  streamLinkTripCtaText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  streamLinkTripCtaSubtext: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
  },
  streamCorridorVehicleDate: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(99,102,241,0.15)",
    gap: 8,
  },
  streamCorridorVehicleDateItem: {
    flex: 1,
    minWidth: 0,
  },
  streamCorridorVehicleDateItemLeft: { alignItems: "flex-start" },
  streamCorridorVehicleDateItemRight: { alignItems: "flex-end" },
  streamCorridorVehicleDateLabel: {
    fontSize: 4,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 0,
  },
  streamCorridorVehicleDateValue: {
    fontSize: 6,
    fontWeight: "600",
    color: Theme.textPrimary,
    fontStyle: "italic",
  },
  streamCorridorVehicleDateDivider: {
    width: 1,
    height: 14,
    backgroundColor: Theme.borderLight,
  },
  streamExpanded: {
    marginTop: 20,
  },
  streamExpandedCard: {
    backgroundColor: Theme.darkSurface,
    borderRadius: 24,
    padding: 20,
    overflow: "hidden",
  },
  streamExpandedCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  streamExpandedCardLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  streamExpandedCardRoute: {
    fontSize: 13,
    fontWeight: "500",
    fontStyle: "italic",
    letterSpacing: -0.3,
    color: "rgba(255,255,255,0.95)",
    textTransform: "uppercase",
  },
  streamExpandedDownloadBtn: {
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
  },
  streamExpandedDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 12,
  },
  streamExpandedNote: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: "rgba(255,255,255,0.65)",
    lineHeight: 16,
  },
  streamSeparator: {
    height: 1,
    marginLeft: TIMELINE_ANCHOR_WIDTH,
    position: "relative",
  },
  streamSeparatorLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: Theme.borderLight,
  },
  streamSeparatorDot: {
    position: "absolute",
    left: 0,
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.screenBackground,
  },
  timelineGauge: {
    marginHorizontal: 12,
    marginBottom: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 40,
    gap: 14,
  },
  timelineGaugeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timelineGaugeDate: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  timelineGaugeSync: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timelineGaugeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.buttonPrimary,
  },
  timelineGaugeSyncText: {
    fontSize: 7,
    fontWeight: "300",
    color: Theme.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  timelineGaugeCards: {
    flexDirection: "row",
    gap: 14,
  },
  neuralGaugeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  neuralGaugeCardOut: {
    backgroundColor: "rgba(232,33,39,0.06)",
    borderColor: "rgba(232,33,39,0.15)",
  },
  neuralGaugeCardIn: {
    backgroundColor: "rgba(21,128,61,0.06)",
    borderColor: "rgba(21,128,61,0.15)",
  },
  neuralGaugeRingWrap: {
    width: 40,
    height: 40,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  neuralGaugeSvg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  neuralGaugeIconWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  neuralGaugeArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  neuralGaugeArrowUp: {
    borderBottomWidth: 8,
    borderBottomColor: Theme.teslaRed,
  },
  neuralGaugeArrowDown: {
    borderTopWidth: 8,
    borderTopColor: Theme.darkGreen,
  },
  neuralGaugeLabelWrap: {
    flex: 1,
    gap: 2,
  },
  neuralGaugeLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  neuralGaugeAmountOut: {
    fontSize: 15,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.teslaRed,
  },
  neuralGaugeAmountIn: {
    fontSize: 15,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.darkGreen,
  },
  timelineCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  timelineCardIn: {
    borderColor: Theme.borderLight,
  },
  timelineCardAccentOut: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  timelineCardAccentIn: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(16,185,129,0.15)",
  },
  timelineCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timelineCardLabel: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timelineCardAmountOut: {
    fontSize: 12,
    fontWeight: "300",
    color: Theme.teslaRed,
    fontStyle: "italic",
    marginTop: 2,
  },
  timelineCardAmountIn: {
    fontSize: 12,
    fontWeight: "300",
    color: Theme.darkGreen,
    fontStyle: "italic",
    marginTop: 2,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal + 8,
    paddingVertical: Layout.headerPaddingBelowInset,
    backgroundColor: Theme.surface,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  historyActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  headerIconBtn: {
    minWidth: Layout.minTouchTargetSize,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    padding: (Layout.minTouchTargetSize - 18) / 2,
  },
  title: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  list: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    gap: 0,
  },
  section: {
    marginBottom: 0,
  },
  sectionTimeline: {
    marginTop: 6,
    marginBottom: 4,
  },
  sectionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal + 8,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
  },
  sectionDateLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 2,
    flexWrap: "wrap",
    gap: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primaryText,
    letterSpacing: 0.2,
  },
  cumulativeBlock: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 1,
    maxWidth: "70%",
  },
  cumulativeHint: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cumulativeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    columnGap: 4,
    rowGap: 2,
  },
  cumulativePaid: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.negative,
  },
  cumulativeDot: {
    fontSize: 8,
    color: Theme.textMutedDemo,
  },
  cumulativeReceived: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.positive,
  },
  rowWrapper: {
    gap: 4,
    marginBottom: 0,
  },
  rowWrapperTimeline: {
    marginHorizontal: 12,
    marginBottom: 8,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surface,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  rowCardTimeline: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 0,
    gap: 12,
  },
  rowCardTimelineHighlighted: {
    backgroundColor: "transparent",
  },
  timelineCardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCardAvatarImageWrap: {
    width: 40,
    height: 40,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  timelineCardParty: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  timelineCardDateVehicle: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  timelineCardRouteWhy: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginTop: 3,
    lineHeight: 14,
  },
  rightMetaStack: {
    alignItems: "flex-end",
    gap: 4,
    maxWidth: 118,
  },
  vehiclePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    maxWidth: "100%",
  },
  vehiclePillIcon: {
    opacity: 0.9,
  },
  vehiclePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  tripPillWithCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
  },
  tripPillCheckIcon: {
    opacity: 0.8,
  },
  ribbonWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },
  ribbon: {
    flex: 1,
    width: 6,
  },
  ribbonDot: {
    position: "absolute",
    top: 8,
    left: 2.5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  bodyTimeline: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 4,
  },
  timelineLine1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelinePartyTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    flex: 1,
    minWidth: 0,
  },
  timelineLine2: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  timelineLine2Date: {
    flex: 1,
    minWidth: 0,
  },
  rowMetaTimeline: {
    fontSize: 9,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    flex: 1,
    minWidth: 0,
    opacity: 0.85,
  },
  tripPillTextOnly: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  tripPillTextOnlyLabel: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "500",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  rowCardHighlighted: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.primary,
    shadowOpacity: 0.06,
  },
  rowTouchable: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  avatarWrapTimeline: {
    width: 40,
    height: 40,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  avatarWrapIn: {
    borderColor: Theme.positiveMuted,
  },
  avatarWrapOut: {
    borderColor: Theme.negativeMuted,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  avatarTextTimeline: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    marginBottom: 1,
  },
  rowDate: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  rowDateTimeline: {
    fontSize: 8,
    fontStyle: "italic",
    letterSpacing: 0.3,
    marginTop: 1,
    color: Theme.textMuted,
  },
  rowMeta: {
    fontSize: 9,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 2,
  },
  rowParty: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  rowTrip: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  rightCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
  },
  amountCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 0,
  },
  amountTouchArea: {
    alignSelf: "stretch",
    justifyContent: "center",
    paddingLeft: 2,
  },
  amount: {
    fontSize: 13,
    fontWeight: "500",
  },
  amountItalic: {
    fontStyle: "italic",
  },
  amountIn: {
    color: Theme.darkGreen,
  },
  amountOut: {
    color: Theme.teslaRed,
  },
  tripAssocBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripAssocBtnLinked: {
    flexDirection: "row",
    width: "auto",
    minWidth: 30,
    maxWidth: 88,
    paddingHorizontal: 6,
    gap: 3,
    borderRadius: 15,
    borderColor: Theme.integratedIcon,
    backgroundColor: Theme.positiveMuted,
  },
  tripAssocLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.integratedIcon,
    maxWidth: 48,
  },
  tripAssocLabelOnly: {
    marginLeft: 4,
  },
  tripAssocLabelMuted: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMutedDemo,
  },
  tripPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripPillText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    maxWidth: 72,
  },
  tripPillLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripPillLinkText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.primary,
    maxWidth: 56,
  },
  gridFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingTop: 32,
    gap: 10,
    opacity: 0.45,
  },
  gridFooterText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  gridFooterSubtext: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tableCol1: { flex: 5, minWidth: 0 },
  tableCol2: { flex: 1.5, minWidth: 0 },
  tableCol3: { flex: 1.5, minWidth: 0, alignItems: "flex-end" },
  tableCol4: { flex: 1.5, minWidth: 0, alignItems: "flex-end" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingLeft: 20,
    paddingRight: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    position: "relative",
  },
  tableRowRibbon: {
    position: "absolute",
    left: 0,
    top: "50%",
    marginTop: -12,
    width: 3,
    height: 24,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  tableRowRibbonIn: { backgroundColor: Theme.darkGreen },
  tableRowRibbonOut: { backgroundColor: Theme.teslaRed },
  tableCell: {
    paddingHorizontal: 4,
    justifyContent: "center",
    minWidth: 0,
  },
  tableCellParty: {
    fontSize: 11,
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  tableCellMeta: {
    fontSize: 8,
    color: Theme.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
  },
  tableCellAmount: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  tableCellAmountOut: { color: Theme.teslaRed },
  tableCellAmountIn: { color: Theme.darkGreen },
  tableMissionPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  tableMissionPillText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.primary,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  tableExpandedWrap: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(249,250,254,0.5)",
  },
  tableWrap: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 32,
    overflow: "hidden",
    marginHorizontal: 12,
  },
  linkTripWrap: {
    marginTop: 3,
    marginLeft: 0,
  },
  linkTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Theme.surfaceLight ?? "rgba(0,0,0,0.03)",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Theme.borderLight ?? "rgba(0,0,0,0.08)",
  },
  linkTripText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.primary ?? Theme.teslaRed,
  },
  detailCard: {
    backgroundColor: Theme.surfaceLight ?? "rgba(0,0,0,0.03)",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Theme.borderLight ?? Theme.border,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: 0,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 1,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    gap: 6,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    minWidth: 60,
  },
  detailValue: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textBody,
    flex: 1,
    textAlign: "right",
  },
  detailValueGreen: {
    color: Theme.positive,
    fontWeight: "500",
  },
  detailValueRed: {
    color: Theme.negative,
    fontWeight: "500",
  },
  detailReconValueWrap: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  detailReconBadge: {
    color: Theme.primary,
    backgroundColor: Theme.primary + "14",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: "700",
  },
  detailReconAction: {
    fontSize: 9,
    color: Theme.textSecondary,
    fontWeight: "600",
    textAlign: "right",
  },
  timelineExpandedWrap: {
    paddingHorizontal: 10,
    paddingTop: 0,
    paddingBottom: 8,
  },
  timelineExpandedOuter: {
    backgroundColor: "#F8FAFC",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  timelineExpandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: Theme.darkSurface,
  },
  timelineExpandedHeaderText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timelineExpandedInner: {
    padding: 20,
    gap: 16,
  },
  timelineExpandedRow2: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    paddingBottom: 14,
  },
  timelineExpandedHalf: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  timelineExpandedHalfRight: {
    alignItems: "flex-end",
  },
  timelineExpandedLabel: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timelineExpandedValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  timelineExpandedValueItalic: {
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  timelineExpandedValueGreen: {
    color: Theme.darkGreen,
    fontWeight: "500",
  },
  timelineExpandedValueRed: {
    color: Theme.teslaRed,
    fontWeight: "500",
  },
  timelineExpandedGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  timelineExpandedNoteBlock: {
    gap: 4,
  },
  timelineExpandedMissionBlock: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginTop: 4,
    padding: 0,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineExpandedMissionInner: {
    gap: 0,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  timelineExpandedTxDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 10,
    marginHorizontal: 0,
  },
  timelineExpandedTxTitle: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  timelineExpandedTxList: {
    gap: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  timelineExpandedTxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    gap: 10,
  },
  timelineExpandedTxRowLast: {
    borderBottomWidth: 0,
  },
  timelineExpandedTxRowHighlighted: {
    backgroundColor: Theme.surfaceGray,
  },
  timelineExpandedTxIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineExpandedTxIconIn: {
    backgroundColor: Theme.positiveMuted,
  },
  timelineExpandedTxIconOut: {
    backgroundColor: "rgba(232, 33, 39, 0.15)",
  },
  timelineExpandedTxBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  timelineExpandedTxLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  timelineExpandedTxSub: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  timelineExpandedTxAmount: {
    fontSize: 12,
    fontWeight: "700",
  },
  timelineExpandedTxAmountIn: {
    color: Theme.darkGreen,
  },
  timelineExpandedTxAmountOut: {
    color: Theme.teslaRed,
  },
  timelineExpandedMissionHeader: {
    backgroundColor: Theme.darkSurface,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  timelineExpandedMissionHeaderText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timelineExpandedMissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingVertical: 10,
    marginBottom: 0,
    gap: 12,
  },
  timelineExpandedMissionLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  timelineExpandedMissionValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  timelineExpandedExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    marginTop: 12,
    backgroundColor: Theme.darkSurface,
    borderRadius: 10,
    borderWidth: 0,
  },
  timelineExpandedExportText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
