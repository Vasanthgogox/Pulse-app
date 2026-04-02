/**
 * Passbook detail — trip and revenue details for one fleet (organization).
 * Data from trips + driver_ledger for the current user's driver link to this org.
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { isAggregateTrip, tripEarningsForDriver } from '@/lib/driverUtils';
import { usePreventScreenCapture } from '@/lib/usePreventScreenCapture';
import { useSafeBack } from '@/lib/useSafeBack';
import * as driversService from '@/services/driversService';
import * as tripsService from '@/services/tripsService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function isCompleted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

function tripEarnings(t: tripsService.TripRow): number {
  return tripEarningsForDriver(t);
}

function formatLedgerDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatTransactionDateSection(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dDate = d.getDate();
  const dMonth = d.getMonth();
  const dYear = d.getFullYear();
  if (dDate === today.getDate() && dMonth === today.getMonth() && dYear === today.getFullYear())
    return 'Today';
  if (dDate === yesterday.getDate() && dMonth === yesterday.getMonth() && dYear === yesterday.getFullYear())
    return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const LEDGER_TYPE_LABELS: Record<string, string> = {
  salary: 'Monthly salary',
  settlement: 'Trip-based',
  advance: 'Advance',
  reimbursement: 'Reimbursement',
  adjustment: 'Adjustment',
  deduction: 'Deduction',
};

function ledgerTypeLabel(type: string): string {
  return LEDGER_TYPE_LABELS[type] ?? type;
}

export default function DriverPassbookDetailScreen() {
  usePreventScreenCapture();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const safeBack = useSafeBack('/(driver)');
  const colors = useDriverThemeColors();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ orgId: string; orgName?: string }>();
  const orgId = typeof params.orgId === 'string' ? params.orgId : params.orgId?.[0] ?? '';
  const orgName = (typeof params.orgName === 'string' ? params.orgName : params.orgName?.[0]) ?? 'Fleet';

  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!profile?.uid || !orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    driversService.getLinkedDriversForCurrentUser(profile.uid).then((res) => {
      const drivers = res.drivers ?? [];
      const d = drivers.find((x) => x.organization_id === orgId);
      setDriver(d ?? null);
      if (!d) {
        setTrips([]);
        setLedgerEntries([]);
        setLoading(false);
        return;
      }
      Promise.all([
        tripsService.getTripsByDriver(d.id),
        driversService.getDriverLedgerByDriver(d.id),
      ]).then(([tRes, ledgerRes]) => {
        setTrips(tRes.trips ?? []);
        setLedgerEntries(ledgerRes.entries ?? []);
        setLoading(false);
      });
    });
  }, [profile?.uid, orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const completedTrips = trips.filter((t) => isCompleted(t.status));
  const { receivedByTripId, nonTripLedgerEntries } = useMemo(() => {
    const byTrip: Record<string, number> = {};
    const nonTrip: driversService.DriverLedgerRow[] = [];
    for (const e of ledgerEntries) {
      const amt = Number(e.amount) || 0;
      const tid = e.trip_id?.trim() || null;
      if (tid) byTrip[tid] = (byTrip[tid] ?? 0) + amt;
      else nonTrip.push(e);
    }
    return { receivedByTripId: byTrip, nonTripLedgerEntries: nonTrip };
  }, [ledgerEntries]);

  const totalReceived = Math.round(
    ledgerEntries.reduce((sum, e) => sum + (Number(e.amount) ?? 0), 0),
  );

  const transactionSections = useMemo(() => {
    const list = completedTrips
      .slice()
      .sort((a, b) => {
        const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
        const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
        return db - da;
      })
      .slice(0, 50);
    const bySection: { sectionLabel: string; dateKey: string; trips: typeof list }[] = [];
    let currentKey = '';
    let currentGroup: typeof list = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const raw = t.completed_at ?? t.updated_at ?? t.created_at ?? '';
      const dateKey = raw ? new Date(raw).toISOString().slice(0, 10) : '';
      if (dateKey !== currentKey) {
        if (currentGroup.length > 0) {
          const first = currentGroup[0];
          bySection.push({
            sectionLabel: formatTransactionDateSection(
              first.completed_at ?? first.updated_at ?? first.created_at ?? '',
            ),
            dateKey: currentKey,
            trips: currentGroup,
          });
        }
        currentKey = dateKey;
        currentGroup = [t];
      } else {
        currentGroup.push(t);
      }
    }
    if (currentGroup.length > 0) {
      const first = currentGroup[0];
      bySection.push({
        sectionLabel: formatTransactionDateSection(
          first.completed_at ?? first.updated_at ?? first.created_at ?? '',
        ),
        dateKey: currentKey,
        trips: currentGroup,
      });
    }
    return bySection;
  }, [completedTrips]);

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.emerald} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading passbook…</Text>
      </View>
    );
  }

  if (!driver) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingHorizontal: 24, paddingBottom: 20, borderColor: colors.border }]}>
          <TouchableOpacity onPress={safeBack} style={styles.backBtn} hitSlop={12}>
            <FontAwesome name="arrow-left" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Passbook</Text>
        </View>
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FontAwesome name="building-o" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No connection to this fleet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            You are not linked to this organization. Passbook is available only for your current connections.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, paddingBottom: Layout.driverHeaderBottomPadding, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity onPress={safeBack} style={styles.backBtn} hitSlop={12}>
          <FontAwesome name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{orgName}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Passbook · Trip & revenue</Text>
          {driver.left_at && (
            <Text style={[styles.headerLeftAt, { color: colors.textMuted }]}>
              Left on {new Date(driver.left_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total received from this fleet</Text>
        <Text style={[styles.summaryAmount, { color: colors.emerald }]}>₹{totalReceived.toLocaleString('en-IN')}</Text>
        <View style={styles.summaryMeta}>
          <Text style={[styles.summaryMetaText, { color: colors.textMuted }]}>{completedTrips.length} trips completed</Text>
        </View>
      </View>

      {nonTripLedgerEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Salary & other payments</Text>
          <View style={[styles.ledgerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {nonTripLedgerEntries.map((entry) => (
              <View key={entry.id} style={[styles.ledgerRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.ledgerIconWrap, { backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.emerald }]}>
                  <FontAwesome name="arrow-down" size={18} color={Theme.textOnPrimary} />
                </View>
                <View style={styles.ledgerDesc}>
                  <Text style={[styles.ledgerDescText, { color: colors.text }]}>
                    {entry.description?.trim() || ledgerTypeLabel(entry.type)}
                  </Text>
                  <Text style={[styles.ledgerDate, { color: colors.textMuted }]}>{formatLedgerDate(entry.created_at)}</Text>
                </View>
                <Text style={[styles.ledgerAmount, { color: colors.emerald }]}>+₹{Number(entry.amount).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Trip history</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          Earned per trip · Received = payments from fleet
        </Text>
        {completedTrips.length === 0 ? (
          <View
            style={[
              styles.ledgerCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={[styles.ledgerEmpty, { borderBottomWidth: 0 }]}>
              <FontAwesome name="exchange" size={32} color={colors.textMuted} />
              <Text style={[styles.ledgerEmptyText, { color: colors.textMuted }]}>
                No trips yet
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.upiListWrap}>
            {transactionSections.map(({ sectionLabel, dateKey, trips }) => (
              <View key={dateKey || sectionLabel} style={styles.upiSection}>
                <Text style={[styles.upiSectionHeader, { color: colors.textMuted }]}>
                  {sectionLabel}
                </Text>
                <View
                  style={[
                    styles.upiListBlock,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  {trips.map((trip, idx) => {
                    const earned = Math.round(tripEarnings(trip));
                    const received = receivedByTripId[trip.id] ?? 0;
                    const date = formatLedgerDate(
                      trip.completed_at ?? trip.updated_at ?? trip.created_at,
                    );
                    const isPending = received === 0;
                    const isAdHocTrip = isAggregateTrip(trip);
                    const isLast = idx === trips.length - 1;
                    return (
                      <View
                        key={trip.id}
                        style={[
                          styles.upiRow,
                          { borderBottomColor: colors.border },
                          isLast && styles.upiRowLast,
                        ]}
                      >
                        <View style={styles.upiRowIcon}>
                          <FontAwesome
                            name={isPending ? 'clock-o' : 'check'}
                            size={20}
                            color={isPending ? Theme.negative : Theme.driverEmerald}
                            style={styles.upiRowIconStyle}
                          />
                        </View>
                        <View style={styles.upiRowBody}>
                          <Text
                            style={[styles.upiRowTitle, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            Trip earnings
                          </Text>
                          <Text
                            style={[styles.upiRowSub, { color: colors.textMuted }]}
                            numberOfLines={1}
                          >
                            {date}
                            {isAdHocTrip ? ' · Ad hoc trip' : ''}
                            {(trip.pickup_area?.trim() || trip.drop_location?.trim())
                              ? ` · ${[trip.pickup_area?.trim(), trip.drop_location?.trim()]
                                  .filter(Boolean)
                                  .join(' → ')}`
                              : ''}
                          </Text>
                        </View>
                        <View style={styles.upiRowRight}>
                          <Text
                            style={[
                              styles.upiRowAmount,
                              {
                                color: isPending
                                  ? Theme.primaryText
                                  : Theme.darkGreen,
                              },
                            ]}
                          >
                            {isAggregateTrip(trip)
                              ? '—'
                              : `+₹${earned.toLocaleString('en-IN')}`}
                          </Text>
                          <Text
                            style={[
                              styles.upiRowStatus,
                              {
                                color: isPending
                                  ? Theme.negative
                                  : Theme.driverEmerald,
                              },
                            ]}
                          >
                            {isPending ? 'Not received yet' : 'Received'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.driverHeaderHorizontalPadding,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  headerLeftAt: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  summaryCard: {
    marginHorizontal: 24,
    marginTop: 24,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  summaryAmount: { fontSize: 24, fontWeight: '800' },
  summaryMeta: { marginTop: 8 },
  summaryMetaText: { fontSize: 12 },
  section: { marginHorizontal: 24, marginTop: 28 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, marginBottom: 12 },
  ledgerCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  ledgerEmpty: { padding: 32, alignItems: 'center', gap: 12 },
  ledgerEmptyText: { fontSize: 14 },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  ledgerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerDesc: { flex: 1, minWidth: 0 },
  ledgerDescText: { fontSize: 13, fontWeight: '700' },
  ledgerDate: { fontSize: 11, marginTop: 2 },
  ledgerAmount: { fontSize: 14, fontWeight: '800' },
  tripBlock: { borderBottomWidth: 1 },
  receivedSubrow: { paddingVertical: 10, paddingLeft: 52 },
  emptyCard: {
    marginHorizontal: 24,
    marginTop: 24,
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 16 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  upiListWrap: { marginTop: 4, gap: 16 },
  upiSection: { gap: 8 },
  upiSectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  upiListBlock: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  upiRowLast: { borderBottomWidth: 0 },
  upiRowIcon: { width: 32, alignItems: 'center' },
  upiRowIconStyle: { opacity: 0.9 },
  upiRowBody: { flex: 1, minWidth: 0 },
  upiRowTitle: { fontSize: 13, fontWeight: '700' },
  upiRowSub: { fontSize: 11, marginTop: 2 },
  upiRowRight: { alignItems: 'flex-end', gap: 4 },
  upiRowAmount: { fontSize: 14, fontWeight: '800' },
  upiRowStatus: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});
