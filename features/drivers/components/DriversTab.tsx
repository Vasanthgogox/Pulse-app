/**
 * Treasury Fiscal Matrix — Drivers tab. O(n): due = trips (commission), paid = ledger only (no trip.amount_paid).
 * Layout aligned with Customers tab: wrap, header, summary row, table card.
 */
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidFillPill } from '@/components/LiquidFillPill';
import { IntegrationModeTag } from '@/components/IntegrationModeTag';
import { useTabBarAwareScrollProps } from '@/contexts/DemoTabBarScrollContext';
import Theme from '@/constants/Theme';
import { getRatingsForDrivers, averageScore } from '@/features/ratings';
import type { TripRow } from '@/features/trips';
import type { EntityListFilter } from "@/features/finance/components/TreasurySummaryCard";
import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import { aggregateDrivers, type DriverOfferForAggregation, type TripPartyMap } from "@/features/finance/aggregation";
import { useDriversQuery, useTripsQuery } from '@/lib/queries';
import type { DriverRow, DriverOffer } from '../services/drivers.service';
import type { VehicleRow } from '@/features/vehicles/services/vehicles.service';

/** Minimal ledger row for aggregation (compatible with LedgerTx). */
export interface LedgerRowForDriver {
  contact_id?: string | null;
  contact_type?: string | null;
  amount_in?: number;
  amount_out?: number;
}

export interface DriversTabProps {
  organizationId: string | null;
  /** When provided (e.g. from Finance parent), use these instead of fetching — same pattern as Ledger tab. */
  drivers?: DriverRow[];
  trips?: TripRow[];
  /** Ledger (cash_entries) for paid aggregation by contact_type === 'driver' (amount_out = paid to driver). */
  transactions?: LedgerRowForDriver[] | null;
  /** Driver offers from accepted invites (commission_percent, commission_per_km) for commission from trip base price. */
  driverOffers?: Record<string, DriverOffer> | null;
  /** When true, parent is still loading entity data; show loading until ready. */
  parentLoading?: boolean;
  onTotals?: (totals: { totalIn: number; totalOut: number }) => void;
  onRowSelect?: (data: FinancialRowData, entityType: 'DRIVER', subTab: 'drivers') => void;
  searchQuery?: string;
  entityFilter?: EntityListFilter;
  /** Optional map of trip_id -> party ids for ledger fallback attribution. */
  tripPartyMap?: TripPartyMap | null;
  /** Vehicles for resolving assigned_vehicle_id to vehicle_number (show below driver name). */
  vehicles?: VehicleRow[];
  topContent?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

export function DriversTab({
  organizationId,
  drivers: driversProp,
  trips: tripsProp,
  transactions: transactionsProp,
  driverOffers: driverOffersProp,
  parentLoading = false,
  onTotals,
  onRowSelect,
  searchQuery = '',
  entityFilter = 'all',
  tripPartyMap,
  vehicles = [],
  topContent,
  refreshing = false,
  onRefresh,
  bottomInset = 100,
}: DriversTabProps) {
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [driverRatingsMap, setDriverRatingsMap] = useState<Record<string, { avg: number | null; count: number }>>({});
  const isControlled = driversProp !== undefined && tripsProp !== undefined;

  const { data: driversFromQuery = [], isPending: driversLoading } = useDriversQuery(
    isControlled ? null : organizationId
  );
  const { data: tripsFromQuery = [], isPending: tripsLoading } = useTripsQuery(
    isControlled ? null : organizationId
  );

  const drivers = isControlled ? (driversProp ?? []) : driversFromQuery;
  const trips = isControlled ? (tripsProp ?? []) : tripsFromQuery;
  const transactions = transactionsProp ?? [];
  const loading = isControlled ? false : (driversLoading || tripsLoading);

  useEffect(() => {
    if (drivers.length === 0) {
      setDriverRatingsMap({});
      return;
    }
    const ids = drivers.map((d) => d.id);
    getRatingsForDrivers(ids).then(({ byDriverId }) => {
      const map: Record<string, { avg: number | null; count: number }> = {};
      ids.forEach((id) => {
        const list = byDriverId[id] ?? [];
        map[id] = { avg: averageScore(list), count: list.length };
      });
      setDriverRatingsMap(map);
    });
  }, [drivers]);

  const offersForAggregation = useMemo((): Record<string, DriverOfferForAggregation> | undefined => {
    if (!driverOffersProp || Object.keys(driverOffersProp).length === 0) return undefined;
    const out: Record<string, DriverOfferForAggregation> = {};
    for (const [driverId, o] of Object.entries(driverOffersProp)) {
      out[driverId] = {
        payableAmount: o.payableAmount ?? null,
        commissionPercent: o.commissionPercent ?? null,
        commissionPerKm: o.commissionPerKm ?? null,
      };
    }
    return out;
  }, [driverOffersProp]);

  const { rows: baseRows, totals } = useMemo(() => {
    return aggregateDrivers(
      drivers,
      trips,
      transactions,
      offersForAggregation,
      tripPartyMap,
    );
  }, [drivers, trips, transactions, offersForAggregation, tripPartyMap]);

  const driverById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  );
  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles],
  );

  const rows = useMemo(() => {
    let list = baseRows.map((r) => {
      const driver = driverById.get(r.id);
      const vehicle = driver?.assigned_vehicle_id
        ? vehicleById.get(driver.assigned_vehicle_id)
        : null;
      const displayName =
        (driver?.name ?? "").trim() ||
        (driver?.phone ?? "").trim() ||
        "Driver";
      return {
        ...r,
        name: displayName,
        vehicleNumber: vehicle?.vehicle_number ?? undefined,
      };
    });
    if (Object.keys(driverRatingsMap).length > 0) {
      list = list.map((r) => {
        const ratingInfo = driverRatingsMap[r.id];
        if (!ratingInfo) return r;
        return { ...r, rating: ratingInfo.avg ?? undefined, ratingCount: ratingInfo.count };
      });
    }
    return list;
  }, [baseRows, driverById, vehicleById, driverRatingsMap]);

  const q = searchQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.subline || '').toLowerCase().includes(q)
      );
    }
    if (entityFilter === 'has_due') list = list.filter((r) => (r.pending ?? 0) > 0);
    if (entityFilter === 'no_due') list = list.filter((r) => (r.pending ?? 0) === 0);
    return list;
  }, [rows, q, entityFilter]);

  useEffect(() => {
    if (onTotals) {
      onTotals(totals);
    }
  }, [onTotals, totals.totalIn, totals.totalOut]);

  if (loading || parentLoading) {
    return <Text style={styles.loading}>Loading…</Text>;
  }
  if (filteredRows.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No drivers. Add drivers from Resources.</Text>
      </View>
    );
  }

  const totalPending = totals.totalOut ?? 0;
  const totalEarnings = totals.totalIn ?? 0;
  const settlementPercent =
    totalEarnings > 0 ? Math.round(((totalEarnings - totalPending) / totalEarnings) * 100) : 0;
  const stickyHeaderIndex = topContent ? 2 : 1;

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.tableScroll}
        contentContainerStyle={[
          styles.tableScrollContent,
          { paddingBottom: bottomInset + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        {...tabBarScrollProps}
        stickyHeaderIndices={[stickyHeaderIndex]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.teslaRed}
            />
          ) : undefined
        }
      >
        {topContent}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Pending</Text>
            <Text style={styles.summaryPending}>
              ₹{totalPending.toLocaleString('en-IN')}
            </Text>
          </View>
          <LiquidFillPill
            percentage={settlementPercent}
            label="Settled"
            valueSuffix="%"
          />
        </View>
        <View style={styles.tableHeader}>
          <View style={styles.headerEntityCol}>
            <Text style={[styles.tableHeaderCell, styles.ctLeft]} numberOfLines={1}>
              Driver Entity
            </Text>
          </View>
          <View style={styles.headerTripsCol}>
            <Text style={[styles.tableHeaderCell, styles.ctCenter]} numberOfLines={1}>
              Trips
            </Text>
          </View>
          <View style={styles.headerPendingCol}>
            <Text style={[styles.tableHeaderCell, styles.ctRight]} numberOfLines={1}>
              Pending
            </Text>
          </View>
        </View>
        <View style={styles.tableCard}>
          {filteredRows.map((data) => {
            const pending = data.pending ?? 0;
            const paid = data.paid ?? 0;
            const tripCount = data.trips ?? 0;
            const isDisconnected =
              data.left_at != null && String(data.left_at).trim() !== '';
            const integrationMode =
              !isDisconnected && data.is_integrated ? 'integrated' : 'manual';
            return (
              <TouchableOpacity
                key={data.id}
                style={styles.tableRow}
                onPress={() =>
                  onRowSelect
                    ? onRowSelect(data, 'DRIVER', 'drivers')
                    : router.push(`/driver/${data.id}`)
                }
                activeOpacity={0.7}
              >
                <View style={[styles.tableCell, styles.ctEntity]}>
                  <View style={styles.tableEntityHeader}>
                    <IntegrationModeTag
                      mode={integrationMode}
                    />
                    <Text style={styles.tableEntityName} numberOfLines={1} ellipsizeMode="tail">
                      {data.name ?? '—'}
                    </Text>
                  </View>
                  <Text style={styles.tableEntitySub} numberOfLines={1} ellipsizeMode="tail">
                    Earned: ₹{(data.due ?? 0) >= 1000 ? `${((data.due ?? 0) / 1000).toFixed(1)}k` : (data.due ?? 0).toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={[styles.tableCell, styles.ctTrips]}>
                  <View style={styles.tripsPill}>
                    <Text style={styles.tripsPillText}>{tripCount}</Text>
                  </View>
                </View>
                <View style={[styles.tableCell, styles.ctPending]}>
                  <Text
                    style={[
                      styles.tablePendingValue,
                      pending > 0 ? styles.tablePendingDue : styles.tablePendingSettled,
                    ]}
                    numberOfLines={1}
                  >
                    ₹{pending.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.tablePaidLabel} numberOfLines={1}>
                    Paid: ₹{paid >= 1000 ? `${(paid / 1000).toFixed(1)}k` : paid.toLocaleString('en-IN')}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 24, textAlign: 'center', color: Theme.textSecondary },
  wrap: { flex: 1, backgroundColor: '#FBFBFF' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    fontSize: 8,
    fontWeight: '500',
    color: Theme.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: '500',
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryPending: {
    fontSize: 18,
    fontWeight: '600',
    fontStyle: 'italic',
    color: Theme.teslaRed,
  },
  tableScroll: { flex: 1 },
  tableScrollContent: { paddingHorizontal: 0, paddingTop: 12 },
  tableCard: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#F9FAFB',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableHeaderCell: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  ctLeft: { textAlign: 'left' },
  ctCenter: { textAlign: 'center' },
  ctRight: { textAlign: 'right' },
  headerEntityCol: { flex: 2.2, minWidth: 0, justifyContent: 'center' },
  headerTripsCol: { flex: 0.5, minWidth: 44, justifyContent: 'center' },
  headerPendingCol: { flex: 1.5, minWidth: 0, justifyContent: 'center' },
  ctEntity: { flex: 2.2, minWidth: 0 },
  ctTrips: { flex: 0.5, minWidth: 44, justifyContent: 'center' },
  ctPending: { flex: 1.5, minWidth: 0, alignItems: 'flex-end', justifyContent: 'center' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableCell: { paddingHorizontal: 5, minWidth: 0 },
  tableEntityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  tableEntityName: {
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  tableEntitySub: {
    fontSize: 8,
    fontWeight: '500',
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  tripsPill: {
    alignSelf: 'center',
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripsPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  tablePendingValue: {
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'right',
  },
  tablePendingDue: { color: Theme.teslaRed },
  tablePendingSettled: { color: Theme.darkGreen },
  tablePaidLabel: {
    fontSize: 8,
    fontWeight: '500',
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
    textAlign: 'right',
  },
  emptyState: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 10, fontWeight: '700', color: Theme.textMutedDemo, textTransform: 'uppercase' },
});
