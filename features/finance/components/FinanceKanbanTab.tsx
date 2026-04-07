/**
 * Kanban view for Finance transactions — specifically for Web.
 * Categorizes ledger entries into Customers, Suppliers, Garage, and Drivers columns.
 */
import { ALL_LEDGER_CATEGORY_VALUES } from "@/components/AddTransactionModal";
import Theme from '@/constants/Theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatIndianVehicleNumber } from '@/lib/format';
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { getDoubleEntryDisplayLabel } from "../accounting/accountingModel";
import type { LedgerRow } from '../services/finance.service';
import { LedgerExpandedCardFromData, type FinancialRowData } from "./FinancialRow";

export interface FinanceKanbanTabProps {
  transactions: LedgerRow[];
  onRowSelect?: (data: any) => void;
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
    }
  >;
}

const COLUMN_TYPES = ['customers', 'suppliers', 'garage', 'drivers'] as const;
type ColumnType = typeof COLUMN_TYPES[number];

export function FinanceKanbanTab({
  transactions,
  onRowSelect,
  getVehicleNumberForTripId,
  tripDetailsMap = {},
}: FinanceKanbanTabProps) {
  const { t } = useLanguage();
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const columns = useMemo(() => {
    const cols: Record<ColumnType, LedgerRow[]> = {
      customers: [],
      suppliers: [],
      garage: [],
      drivers: [],
    };

    transactions.forEach((row) => {
      const isDriver = row.contact_type === "driver" || (row.driver_name ?? "").trim() !== "";
      const isClient = row.contact_type === "client";
      const isSupplier = row.contact_type === "supplier";
      const vehicleNum = row.vehicle_number ?? (row.trip_id != null && !isDriver ? (getVehicleNumberForTripId?.(row.trip_id) ?? null) : null);
      const isVehicle = row.contact_type === "vehicle" || (!isDriver && !isClient && !isSupplier && vehicleNum);

      if (isClient) cols.customers.push(row);
      else if (isSupplier) cols.suppliers.push(row);
      else if (isDriver) cols.drivers.push(row);
      else if (isVehicle) cols.garage.push(row);
    });

    return cols;
  }, [transactions, getVehicleNumberForTripId]);

  function formatEntryDate(iso: string | undefined | null): string {
    if (!iso) return "—";
    try {
      const s = iso.slice(0, 10);
      const [y, m, day] = s.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mi = parseInt(m ?? "0", 10) - 1;
      return mi >= 0 && mi < 12 ? `${day} ${monthNames[mi]} ${y}` : s;
    } catch {
      return iso.slice(0, 10);
    }
  }

  const buildFinancialRowData = (row: LedgerRow): FinancialRowData => {
    const isDriverPayment = row.contact_type === "driver" || (row.driver_name ?? "").trim() !== "";
    const isClientOrSupplier = row.contact_type === "client" || row.contact_type === "supplier";
    const vehicleNum = row.vehicle_number ?? (row.trip_id != null && !isDriverPayment ? (getVehicleNumberForTripId?.(row.trip_id) ?? null) : null);
    
    const entityName = isDriverPayment
      ? row.driver_name || row.party_name || "—"
      : isClientOrSupplier
        ? row.party_name || "—"
        : vehicleNum
          ? formatIndianVehicleNumber(vehicleNum)
          : (row.party_name ?? "—");

    const tripDetail = row.trip_id != null && tripDetailsMap[row.trip_id] ? tripDetailsMap[row.trip_id] : null;
    
    const sameTripTransactions = row.trip_id != null
      ? transactions
          .filter((r) => r.trip_id != null && r.trip_id === row.trip_id)
          .map((r) => ({
            id: r.id,
            date: formatEntryDate(r.transaction_date),
            typeLabel: getDoubleEntryDisplayLabel(r) ?? "—",
            in: r.amount_in ?? 0,
            out: r.amount_out ?? 0,
            party: r.party_name || "—",
          }))
      : undefined;

    const summary = row.trip_id != null
      ? (() => {
          const sameTrip = transactions.filter((r) => r.trip_id != null && r.trip_id === row.trip_id);
          return {
            received: sameTrip.reduce((s, r) => s + (r.amount_in ?? 0), 0),
            paid: sameTrip.reduce((s, r) => s + (r.amount_out ?? 0), 0),
            entryCount: sameTrip.length,
          };
        })()
      : undefined;

    return {
      id: row.id,
      name: entityName,
      subline: row.description || "",
      category: ALL_LEDGER_CATEGORY_VALUES.includes(row.description ?? "") ? row.description : "GENERAL",
      desc: row.description,
      tripId: row.trip_id,
      msn: row.trip_number || (row.trip_id ? "Trip" : "General"),
      tripDetail: tripDetail ?? undefined,
      vehicleNumber: vehicleNum,
      driverName: row.driver_name,
      ledgerPartyType: row.contact_type as any,
      in: row.amount_in ?? 0,
      out: row.amount_out ?? 0,
      transaction_date: row.transaction_date,
      transactionTypeLabel: getDoubleEntryDisplayLabel(row),
      tripPaymentSummary: summary,
      sameTripTransactions,
    };
  };

  const renderCard = (row: LedgerRow) => {
    const isIn = (row.amount_in ?? 0) > 0;
    const amount = isIn ? row.amount_in : row.amount_out;
    const isExpanded = expandedRowId === row.id;
    
    const dateStr = row.transaction_date ? (() => {
        try {
            const d = new Date(row.transaction_date);
            const day = d.getDate().toString().padStart(2, '0');
            const month = d.toLocaleString('en-IN', { month: 'short' });
            const year = d.getFullYear().toString().slice(-2);
            return `${day} ${month} ${year}`;
        } catch {
            return row.transaction_date.slice(0, 10);
        }
    })() : '—';

    const isDriver = row.contact_type === "driver" || (row.driver_name ?? "").trim() !== "";
    const isClient = row.contact_type === "client";
    const isSupplier = row.contact_type === "supplier";
    const vehicleNum = row.vehicle_number ?? (row.trip_id != null && !isDriver ? (getVehicleNumberForTripId?.(row.trip_id) ?? null) : null);

    const entityName = isDriver
      ? row.driver_name || row.party_name || "—"
      : (isClient || isSupplier)
        ? row.party_name || "—"
        : vehicleNum
          ? formatIndianVehicleNumber(vehicleNum)
          : (row.party_name ?? "—");

    const desc = row.description ?? "";
    const categoryLabel = ALL_LEDGER_CATEGORY_VALUES.includes(desc) ? desc : "GENERAL";

    const rowData = buildFinancialRowData(row);

    return (
      <View key={row.id} style={styles.cardContainer}>
        <TouchableOpacity 
          style={[styles.card, isExpanded && styles.cardExpanded]}
          activeOpacity={0.7}
          onPress={() => setExpandedRowId(isExpanded ? null : row.id)}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.entityName} numberOfLines={1}>{entityName}</Text>
            <Text style={[styles.amount, isIn ? styles.amountIn : styles.amountOut]}>
              ₹{amount?.toLocaleString('en-IN')}
            </Text>
          </View>
          
          <View style={styles.cardMeta}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{categoryLabel}</Text>
            </View>
            <Text style={styles.date}>{dateStr}</Text>
          </View>

          {(row.trip_number || row.trip_id) && !isExpanded && (
            <View style={styles.tripRow}>
              <View style={styles.tripBadge}>
                <FontAwesome name="map-marker" size={10} color={Theme.primary} style={{ marginRight: 4 }} />
                <Text style={styles.tripText}>{row.trip_number || 'TRIP'}</Text>
              </View>
            </View>
          )}

          {row.description && !ALL_LEDGER_CATEGORY_VALUES.includes(row.description) && !isExpanded && (
            <Text style={styles.description} numberOfLines={2}>{row.description}</Text>
          )}

          <View style={styles.expandHint}>
            <FontAwesome name={isExpanded ? "chevron-up" : "chevron-down"} size={10} color={Theme.textMuted} />
          </View>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.expandedContent}>
            <LedgerExpandedCardFromData data={rowData} />
            {row.trip_id && (
                <TouchableOpacity 
                    style={styles.viewTripBtn}
                    onPress={() => onRowSelect?.(row)}
                >
                    <Text style={styles.viewTripBtnText}>VIEW FULL TRIP</Text>
                    <FontAwesome name="arrow-right" size={10} color={Theme.primary} />
                </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.kanbanContainer}
      >
        {COLUMN_TYPES.map((type) => (
          <View key={type} style={styles.column}>
            <View style={styles.columnHeader}>
              <View style={styles.columnTitleRow}>
                <View style={styles.columnAccent} />
                <Text style={styles.columnTitle}>{t(
                  type === 'customers' ? 'customersLabel' : 
                  type === 'suppliers' ? 'suppliersLabel' : 
                  type === 'garage' ? 'tabGarage' : 'tabDrivers'
                ).toUpperCase()}</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{columns[type].length}</Text>
              </View>
            </View>
            <ScrollView 
              style={styles.columnScroll}
              showsVerticalScrollIndicator={true}
            >
              {columns[type].length === 0 ? (
                <View style={styles.emptyColumn}>
                  <Text style={styles.emptyText}>{t('noLedgerEntriesYet')}</Text>
                </View>
              ) : (
                columns[type].map(renderCard)
              )}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  kanbanContainer: {
    padding: 24,
    paddingBottom: 40,
    flexDirection: 'row',
    gap: 24,
  },
  column: {
    width: 350,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 14,
    padding: 12,
    maxHeight: '100%',
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  columnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  columnAccent: {
    width: 3,
    height: 14,
    backgroundColor: Theme.teslaRed,
    borderRadius: 2,
  },
  columnTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: 1.5,
  },
  countBadge: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textOnDark,
  },
  columnScroll: {
    flex: 1,
  },
  cardContainer: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    position: 'relative',
  },
  cardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  entityName: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    flex: 1,
    marginRight: 10,
    letterSpacing: 0.2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  amountIn: {
    color: Theme.darkGreen,
  },
  amountOut: {
    color: Theme.teslaRed,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryBadge: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  date: {
    fontSize: 11,
    color: Theme.textMuted,
    fontWeight: '600',
  },
  tripRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  tripBadge: {
    backgroundColor: 'rgba(0, 102, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripText: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.primary,
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 12,
    lineHeight: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    fontStyle: 'italic',
  },
  expandHint: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    opacity: 0.5,
  },
  expandedContent: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Theme.borderLight,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
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
    fontWeight: '800',
    color: Theme.primary,
    letterSpacing: 1,
  },
  emptyColumn: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
