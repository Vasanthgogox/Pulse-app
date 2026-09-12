/**
 * Kanban view for Finance transactions — specifically for Web.
 * Categorizes ledger entries into Customers, Suppliers, Garage, and Drivers columns.
 * Card style matches the Timeline layout from Client Detail / Cash Flow.
 */
import { EntityIdentityAvatar } from "@/components/EntityIdentityAvatar";
import Theme from '@/constants/Theme';
import {
  FINANCE_KANBAN_COLUMN_EMPTY,
  FINANCE_KANBAN_COLUMN_PROMO_VARIANT,
  type FinanceKanbanColumnType,
} from '@/lib/financePromoAssets';
import { FinancePromoCard } from './FinancePromoCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatIndianVehicleNumber, formatLedgerAmount } from '@/lib/format';
import { getTripOperationalDisplay } from "@/features/operations/display";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import Animated, { FadeInUp, Layout } from 'react-native-reanimated';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import {
  resolveLedgerReceiptPartyAvatar,
  resolveLedgerRowPartyIdentity,
} from "@/lib/entityIdentity";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import type { LedgerRow } from '../services/finance.service';
import { getDoubleEntryDisplayLabel } from "../accounting/accountingModel";
import { LedgerTransactionPreviewModal } from "./LedgerTransactionPreviewModal";

import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { partyAvatarInitialsTextColor } from "@/lib/partyAvatarDisplay";
const COLUMN_TYPES = ['customers', 'suppliers', 'garage', 'drivers'] as const;
type ColumnType = typeof COLUMN_TYPES[number];

export interface FinanceKanbanTabProps {
  transactions: LedgerRow[];
  onRowSelect?: (data: LedgerRow) => void;
  getVehicleNumberForTripId?: (tripId: string | null) => string | null;
  tripDetailsMap?: Record<
    string,
    {
      trip_number: string;
      drop_location?: string;
      pickup_area?: string;
      client_name?: string;
      pickup_date?: string | null;
      vehicle_number?: string | null;
      client_price?: number | null;
      supplier_rate?: number | null;
      driver_commission?: number | null;
      supplier_id?: string | null;
      organization_id?: string | null;
      client_id?: string | null;
      supplier_display_name?: string | null;
    }
  >;
  clientRows?: ClientRow[];
  supplierRows?: SupplierRow[];
  driverRows?: DriverRow[];
  tripPartyMap?: Record<
    string,
    {
      client_id?: string | null;
      supplier_id?: string | null;
      driver_id?: string | null;
    }
  >;
  profileImages: Record<string, string>;
  linkedOrgDisplayMap?: Record<string, LinkedOrgDisplay>;
  /** When true, empty columns show full party promo cards (ledger empty on cash desktop). */
  showPartyPromosInColumns?: boolean;
  onKanbanPartyAddPress?: (column: FinanceKanbanColumnType) => void;
  /** RBAC: hide suppliers (asset-only) or garage (aggregate-only). */
  visibleColumns?: readonly ColumnType[];
}

const MONTHS_SHORT = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** Ledger rows sometimes store generic party_name ("Supplier") when contact_id was foreign; treat as missing. */
function isPlaceholderLedgerPartyName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n || n === "—" || n === "-") return true;
  return (
    n === "supplier" ||
    n === "client" ||
    n === "driver" ||
    n === "unknown client" ||
    n === "misc / unlinked" ||
    n.startsWith("misc /")
  );
}

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

/** Initials from party/name (max 2 chars, uppercase). */
function initials(name: string): string {
  const t = (name ?? "").trim();
  if (!t) return "—";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2)
    return (words[0][0] + words[words.length - 1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

function avatarColor(str: string): string {
  let n = 0;
  for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function formatTxDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (iso ?? "").slice(0, 10);
  if (!s) return "—";
  const [y, m, day] = s.split("-");
  return `${day} ${MONTHS_SHORT[Number(m) - 1] ?? m} ${y}`;
}

function KanbanCard({
  row,
  index,
  openDetail,
  hasAmtIn,
  amount,
  dateStr,
  vehicleStr,
  partyName,
  routeWhyLine,
  tripIdOnly,
  onRowSelect,
  profileImageUrl,
  partyAvatar,
}: {
  row: LedgerRow;
  index: number;
  cat: ColumnType | "other";
  openDetail: (row: LedgerRow) => void;
  hasAmtIn: boolean;
  amount: number;
  dateStr: string;
  vehicleStr: string | null;
  partyName: string;
  routeWhyLine: string | null;
  tripIdOnly: string | null;
  onRowSelect?: (row: LedgerRow) => void;
  profileImageUrl: string | null;
  partyAvatar?: ReactNode;
}) {
  const avatarBg = avatarColor(partyName);
  const initialText = initials(partyName);

  return (
    <Animated.View
      style={styles.cardContainer}
      entering={FadeInUp.delay(index * 30).springify()}
      layout={Layout.springify()}
    >
      <TouchableOpacity
        style={styles.timelineCard}
        activeOpacity={0.7}
        onPress={() => openDetail(row)}
        accessibilityRole="button"
        accessibilityLabel={`Open cash entry for ${partyName}`}
      >
        {partyAvatar != null ? (
          partyAvatar
        ) : profileImageUrl ? (
          <Image source={{ uri: profileImageUrl }} style={styles.profileImage} />
        ) : (
          <View
            style={[
              styles.timelineCardAvatar,
              { backgroundColor: avatarBg },
              hasAmtIn ? styles.avatarWrapIn : styles.avatarWrapOut,
            ]}
          >
            <Text
              style={[
                styles.avatarText,
                { color: partyAvatarInitialsTextColor(avatarBg) },
              ]}
              numberOfLines={1}
            >
              {initialText}
            </Text>
          </View>
        )}

        <View style={styles.timelineCardBody}>
          <Text style={styles.timelineCardParty} numberOfLines={1}>
            {partyName}
          </Text>
          <Text style={styles.timelineCardDateVehicle} numberOfLines={1}>
            {[dateStr, vehicleStr].filter(Boolean).join(" · ")}
          </Text>
          {routeWhyLine ? (
            <Text style={styles.timelineCardRouteWhy} numberOfLines={1}>
              {routeWhyLine}
            </Text>
          ) : null}
        </View>

        <View style={styles.rightCol}>
          {tripIdOnly && (
            <TouchableOpacity
              style={styles.tripPillWithCheck}
              onPress={() => onRowSelect?.(row)}
              activeOpacity={0.6}
            >
              <FontAwesome name="check-circle" size={8} color={Theme.darkGreen} />
              <Text style={styles.tripPillText} numberOfLines={1}>
                {tripIdOnly}
              </Text>
            </TouchableOpacity>
          )}
          <Text
            style={[
              styles.amount,
              hasAmtIn ? styles.amountIn : styles.amountOut,
            ]}
            numberOfLines={1}
          >
            {hasAmtIn ? "+" : "−"} ₹{formatLedgerAmount(amount)}
          </Text>
        </View>

        <View style={styles.expandHint}>
          <FontAwesome name="chevron-right" size={8} color={Theme.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function KanbanColumn({
  type,
  transactions,
  t,
  renderCard,
  showPartyPromosInColumns,
  onKanbanPartyAddPress,
}: {
  type: ColumnType;
  transactions: LedgerRow[];
  t: (key: string) => string;
  renderCard: (row: LedgerRow, index: number) => React.ReactNode;
  showPartyPromosInColumns?: boolean;
  onKanbanPartyAddPress?: (column: FinanceKanbanColumnType) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <View 
      style={styles.column}
      // @ts-expect-error - mouse events supported on web, not in RN View types
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <View style={styles.columnHeader}>
        <View style={styles.columnTitleRow}>
          <View style={styles.columnAccent} />
          <Text style={styles.columnTitle}>
            {t(
              type === "customers"
                ? "customersLabel"
                : type === "suppliers"
                  ? "suppliersLabel"
                  : type === "garage"
                    ? "tabGarage"
                    : "tabDrivers",
            )}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{transactions.length}</Text>
        </View>
      </View>
      <ScrollView
        style={[
          styles.columnScroll,
          Platform.OS === "web" &&
            ({ scrollbarWidth: "thin" } as ViewStyle),
        ]}
        showsVerticalScrollIndicator={isHovered}
        contentContainerStyle={[
          { paddingRight: 0 },
          transactions.length === 0 && showPartyPromosInColumns
            ? { flexGrow: 1 }
            : null,
        ]}
      >
        {transactions.length === 0 ? (
          showPartyPromosInColumns ? (
            <FinancePromoCard
              variant={FINANCE_KANBAN_COLUMN_PROMO_VARIANT[type]}
              layout="column"
              style={styles.emptyPromoFill}
              onCtaPress={
                onKanbanPartyAddPress
                  ? () => onKanbanPartyAddPress(type)
                  : undefined
              }
            />
          ) : (
            <View style={styles.emptyColumn}>
              {(() => {
                const { label, Icon } = FINANCE_KANBAN_COLUMN_EMPTY[type];
                return (
                  <>
                    <View style={styles.emptyColumnIconWrap}>
                      <Icon size={16} color={Theme.primary} strokeWidth={2} />
                    </View>
                    <Text style={styles.emptyText}>{label}</Text>
                  </>
                );
              })()}
            </View>
          )
        ) : (
          transactions.map((row, index) => renderCard(row, index))
        )}
      </ScrollView>
    </View>
  );
}

export function FinanceKanbanTab({
  transactions,
  onRowSelect,
  getVehicleNumberForTripId,
  tripDetailsMap = {},
  clientRows = [],
  supplierRows = [],
  driverRows = [],
  tripPartyMap = {},
  profileImages,
  linkedOrgDisplayMap = {},
  showPartyPromosInColumns = false,
  onKanbanPartyAddPress,
  visibleColumns = COLUMN_TYPES,
}: FinanceKanbanTabProps) {
  const { t } = useLanguage();
  const [previewTransaction, setPreviewTransaction] = useState<LedgerRow | null>(null);
  const columnTypes = visibleColumns;

  const clientById = useMemo(() => new Map(clientRows.map(c => [c.id, c])), [clientRows]);
  const supplierById = useMemo(() => new Map(supplierRows.map(s => [s.id, s])), [supplierRows]);
  const driverById = useMemo(
    () => new Map(driverRows.map((d) => [d.id, d])),
    [driverRows],
  );

  const getResolvedPartyName = useCallback((row: LedgerRow): string => {
    const contactType = row.contact_type;
    const tripId = row.trip_id;

    // 1) Explicit contact on transaction
    if (contactType === 'client' && row.contact_id) {
      return clientById.get(row.contact_id)?.name || row.party_name || "—";
    }
    if (contactType === 'supplier' && row.contact_id) {
      const direct = supplierById.get(row.contact_id)?.name;
      if (direct) return direct;
      if (tripId && tripPartyMap[tripId]?.supplier_id) {
        const viaTrip = supplierById.get(tripPartyMap[tripId]!.supplier_id!)?.name;
        if (viaTrip) return viaTrip;
      }
      const detailNm =
        tripId && tripDetailsMap[tripId]?.supplier_display_name
          ? tripDetailsMap[tripId]!.supplier_display_name!.trim()
          : "";
      if (detailNm) return detailNm;
      const pn = row.party_name;
      if (pn && !isPlaceholderLedgerPartyName(pn)) return pn;
      return "—";
    }
    if (contactType === 'dco') {
      const pn = row.party_name;
      if (pn && !isPlaceholderLedgerPartyName(pn)) return pn;
      return "DCO";
    }
    if (contactType === 'driver') {
      return row.driver_name || row.party_name || "—";
    }

    // 2) Fallback to tripPartyMap if no explicit contact_id but we have a trip_id
    if (tripId && tripPartyMap[tripId]) {
      const pm = tripPartyMap[tripId];
      if (row.amount_in && pm.client_id) {
        return clientById.get(pm.client_id)?.name || row.party_name || "—";
      }
      if (row.amount_out && pm.supplier_id) {
        const nm = supplierById.get(pm.supplier_id)?.name;
        if (nm) return nm;
      }
    }

    if (tripId && tripDetailsMap[tripId]) {
      const d = tripDetailsMap[tripId];
      if ((row.amount_out ?? 0) > 0 && d.supplier_display_name?.trim()) {
        return d.supplier_display_name.trim();
      }
    }

    const fallbackPn = row.party_name;
    if (fallbackPn && !isPlaceholderLedgerPartyName(fallbackPn)) return fallbackPn;
    return "—";
  }, [clientById, supplierById, tripPartyMap, tripDetailsMap]);

  const resolveReceiptPartyAvatar = useCallback(
    (row: LedgerRow) =>
      resolveLedgerReceiptPartyAvatar(row, {
        clientById,
        supplierById,
        driverById,
        linkedOrgDisplayMap,
        profileImages,
        driverProfileImageUrls: profileImages,
        tripPartyMap,
        partyDisplayName: getResolvedPartyName(row),
      }),
    [
      clientById,
      supplierById,
      driverById,
      linkedOrgDisplayMap,
      profileImages,
      tripPartyMap,
      getResolvedPartyName,
    ],
  );

  // Memoize so columns useMemo can depend on it — tripPartyMap arrives async and
  // changes categorization for rows that have no explicit contact_type.
  const getRowCategory = useCallback((row: LedgerRow): ColumnType | 'other' => {
    const hasAmtIn = (row.amount_in ?? 0) > 0;
    const hasAmtOut = (row.amount_out ?? 0) > 0;
    const contactType = row.contact_type;

    if (contactType === "client") return "customers";
    if (contactType === "supplier" || contactType === "dco") return "suppliers";
    if (contactType === "driver") return "drivers";

    let resolvedContactType: LedgerRow["contact_type"] = contactType;
    if (!resolvedContactType && row.trip_id && tripPartyMap[row.trip_id]) {
      const pm = tripPartyMap[row.trip_id];
      if (hasAmtIn && pm.client_id) resolvedContactType = 'client';
      if (hasAmtOut && pm.supplier_id) resolvedContactType = 'supplier';
    }

    if (resolvedContactType === "client" || (hasAmtIn && !resolvedContactType)) {
      return "customers";
    }

    const vehicleNum =
      row.vehicle_number ??
      (row.trip_id != null ? getVehicleNumberForTripId?.(row.trip_id) ?? null : null);
    const isVehicle =
      (resolvedContactType as string | undefined) === "vehicle" ||
      (!!vehicleNum && resolvedContactType !== "supplier");
    if (isVehicle) return "garage";

    if (resolvedContactType === "supplier" || (hasAmtOut && !resolvedContactType)) {
      return "suppliers";
    }

    if (hasAmtIn) return "customers";
    if (hasAmtOut) return "suppliers";

    return "other";
  }, [tripPartyMap, getVehicleNumberForTripId]);

  const columns = useMemo(() => {
    const cols: Record<ColumnType, LedgerRow[]> = {
      customers: [],
      suppliers: [],
      garage: [],
      drivers: [],
    };
    transactions.forEach((row) => {
      const cat = getRowCategory(row);
      if (cat !== 'other') cols[cat].push(row);
    });
    return cols;
  }, [transactions, getRowCategory]);

  const openDetail = (row: LedgerRow) => {
    setPreviewTransaction(row);
  };

  const renderCard = (row: LedgerRow, index: number) => {
    const cat = getRowCategory(row);
    const hasAmtIn = (row.amount_in ?? 0) > 0;
    const amount = hasAmtIn ? row.amount_in : row.amount_out;
    const dateStr = formatTxDate(row.transaction_date ?? row.created_at);
    const vehicleNum = row.vehicle_number ?? (row.trip_id != null ? (getVehicleNumberForTripId?.(row.trip_id) ?? null) : null);
    const vehicleStr = vehicleNum ? formatIndianVehicleNumber(vehicleNum) : null;
    let partyName = getResolvedPartyName(row);
    if (cat === "garage" && vehicleNum) {
      partyName = vehicleStr || row.party_name || "—";
    }
    const typeLabel = getDoubleEntryDisplayLabel(row) ?? row.description ?? "GENERAL";
    const tripDetail = row.trip_id ? tripDetailsMap[row.trip_id] : null;
    const routeStr = tripDetail ? [tripDetail.pickup_area, tripDetail.drop_location].filter(Boolean).join(" → ") : null;
    const routeWhyLine = [routeStr, typeLabel].filter(Boolean).join(" • ");
    const tripIdOnly =
      getTripOperationalDisplay({
        trip_number: tripDetail?.["trip_number"] ?? row["trip_number"] ?? null,
      }) !== "—"
        ? getTripOperationalDisplay({
            trip_number: tripDetail?.["trip_number"] ?? row["trip_number"] ?? null,
          })
        : row.trip_id
          ? "TRIP"
          : null;

    let profileImageUrl: string | null = null;

    const identity = resolveLedgerRowPartyIdentity(row, {
      clientById,
      supplierById,
      driverById,
      linkedOrgDisplayMap,
      profileImages,
      driverProfileImageUrls: profileImages,
      tripPartyMap,
      partyDisplayName: partyName,
    });

    const partyAvatar =
      identity != null ? (
        <EntityIdentityAvatar identity={identity} size="md" showIntegrationBadge badgeOverlay />
      ) : undefined;

    if (!partyAvatar && row.contact_id) {
      profileImageUrl = profileImages[row.contact_id] ?? null;
    }

    return (
      <KanbanCard
        key={row.id}
        row={row}
        index={index}
        cat={cat}
        openDetail={openDetail}
        hasAmtIn={hasAmtIn}
        amount={amount}
        dateStr={dateStr}
        vehicleStr={vehicleStr}
        partyName={partyName}
        routeWhyLine={routeWhyLine}
        tripIdOnly={tripIdOnly}
        onRowSelect={onRowSelect}
        profileImageUrl={profileImageUrl}
        partyAvatar={partyAvatar}
      />
    );
  };

  return (
    <>
      <View style={styles.wrapper}>
        <View style={styles.kanbanContainer}>
          {columnTypes.map((type) => (
              <KanbanColumn 
                key={type}
                type={type}
                transactions={columns[type]}
                t={t}
                renderCard={renderCard}
                showPartyPromosInColumns={showPartyPromosInColumns}
                onKanbanPartyAddPress={onKanbanPartyAddPress}
              />
          ))}
        </View>
      </View>
      {previewTransaction ? (
        <LedgerTransactionPreviewModal
          visible
          transaction={previewTransaction}
          onClose={() => setPreviewTransaction(null)}
          resolveReceiptPartyAvatar={resolveReceiptPartyAvatar}
          tripDetailsMap={tripDetailsMap}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: Theme.screenBackground,
  },
  kanbanContainer: {
    flex: 1,
    paddingHorizontal: 0,
    paddingBottom: 12,
    paddingTop: 4,
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 280,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  column: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: '100%',
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    padding: 10,
    minHeight: 0,
    alignSelf: 'stretch',
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  columnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  columnAccent: {
    width: 3,
    height: 12,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 2,
  },
  /** Kanban column headers — uppercase muted caps (matches mobile board). */
  columnTitle: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  countBadge: {
    backgroundColor: Theme.financeHeroBg,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnDark,
  },
  columnScroll: {
    flex: 1,
  },
  cardContainer: {
    marginBottom: 8,
  },
  timelineCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
    position: 'relative',
    overflow: 'visible',
  },
  timelineCardAvatar: {
    width: 32,
    height: 32,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  profileImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarWrapIn: {
    borderColor: Theme.positiveMuted,
  },
  avatarWrapOut: {
    borderColor: Theme.negativeMuted,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  timelineCardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
    paddingTop: 4,
  },
  /** Org / party — italic, uppercase, medium weight, dark (mobile cash list). */
  timelineCardParty: {
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  /** Date line — not italic; slate; smaller than title. */
  timelineCardDateVehicle: {
    fontSize: 7,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  /** Route + type — smallest, italic, muted (sentence case from data). */
  timelineCardRouteWhy: {
    fontSize: 7,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 1,
    opacity: 0.95,
    lineHeight: 10,
  },
  rightCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
    maxWidth: "52%",
    paddingTop: 4,
  },
  /** Amount — compact, regular weight; green / red from amountIn / amountOut. */
  amount: {
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "normal",
  },
  amountIn: {
    color: Theme.darkGreen,
  },
  amountOut: {
    color: Theme.teslaRed,
  },
  tripPillWithCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(248,250,252,0.5)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  /** Trip id pill — italic uppercase, primary (dark blue on light). */
  tripPillText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: 0.15,
    textTransform: "uppercase",
  },
  expandHint: {
    position: 'absolute',
    bottom: 4,
    right: 12,
    opacity: 0.3,
  },
  expandedContent: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Theme.borderLight,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 12,
  },
  viewTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 10,
    marginHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  viewTripBtnText: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.primary,
    letterSpacing: 1,
  },
  emptyPromoFill: {
    flex: 1,
    minHeight: 0,
  },
  emptyColumn: {
    paddingVertical: 28,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyColumnIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  emptyText: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
    letterSpacing: -0.1,
    textAlign: 'center',
    lineHeight: 16,
  },
});
