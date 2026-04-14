/**
 * Passbook detail — trip and revenue details for one fleet (organization).
 * Data from trips + driver_ledger for the current user's driver link to this org.
 */
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { phonePeMetaDate } from '@/lib/driverGpayTransactions';
import { isAggregateTrip, tripEarningsForDriver } from '@/lib/driverUtils';
import { usePreventScreenCapture } from '@/lib/usePreventScreenCapture';
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

function tripEarnings(t: tripsService.TripRow): number {
  return tripEarningsForDriver(t);
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

const AMBER_50 = 'rgba(245,158,11,0.12)';

export default function DriverPassbookDetailScreen() {
  usePreventScreenCapture();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ orgId: string; orgName?: string; from?: string }>();
  const orgId = typeof params.orgId === 'string' ? params.orgId : params.orgId?.[0] ?? '';
  const orgName = (typeof params.orgName === 'string' ? params.orgName : params.orgName?.[0]) ?? 'Fleet';
  const from = typeof params.from === 'string' ? params.from : params.from?.[0] ?? 'requests';

  const handleBack = useCallback(() => {
    if (from === 'history') {
      router.navigate('/(driver)/passbook/history');
    } else {
      router.navigate('/(driver)/requests');
    }
  }, [router, from]);

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
      ])
        .then(([tRes, ledgerRes]) => {
          setTrips(tRes.trips ?? []);
          setLedgerEntries(ledgerRes.entries ?? []);
        })
        .catch(() => {
          setTrips([]);
          setLedgerEntries([]);
        })
        .finally(() => {
          setLoading(false);
        });
    });
  }, [profile?.uid, orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const tripsForOrg = useMemo(
    () => trips.filter((t) => String(t.organization_id ?? '') === String(orgId)),
    [trips, orgId],
  );

  const completedTrips = useMemo(
    () => tripsForOrg.filter((t) => tripsService.isTripCompleted(t)),
    [tripsForOrg],
  );
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
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={12}>
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
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={12}>
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
        <View style={[styles.section, styles.gpayListSection]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Salary & other payments</Text>
          {nonTripLedgerEntries.map((entry, entryIdx) => {
            const label = entry.description?.trim() || ledgerTypeLabel(entry.type);
            const raw = Number(entry.amount) || 0;
            const isCredit = raw >= 0;
            const amtAbs = Math.abs(raw);
            const amountLabel = isCredit
              ? `+ ₹${amtAbs.toLocaleString('en-IN')}`
              : `₹${amtAbs.toLocaleString('en-IN')}`;
            const amountColor = isCredit
              ? isDark
                ? colors.emerald
                : Theme.gpayAmountReceived
              : isDark
                ? colors.text
                : Theme.gpayListTitle;
            const primary = isCredit ? 'Payment received' : 'Adjustment';
            const metaRight = isCredit ? 'Credited to wallet' : 'Updated in passbook';
            const listDivider = isDark ? colors.borderSubtle : Theme.borderMedium;
            const subColor = colors.textMuted;
            const metaColor = colors.textMuted;
            const isLastEntry = entryIdx === nonTripLedgerEntries.length - 1;
            const statusLabel = isCredit ? 'RECEIVED' : 'PENDING';
            const statusPillBg = isCredit ? colors.emeraldMuted : AMBER_50;
            const statusPillTextColor = isCredit ? colors.emerald : Theme.warning;
            const statusPillBorderColor = isCredit ? colors.emeraldBorderSoft : 'rgba(180,83,9,0.25)';
            const rowToneBorder = isCredit ? colors.emeraldBorderSoft : 'rgba(180,83,9,0.25)';
            const iconSqBg = isCredit ? colors.emeraldMuted : AMBER_50;
            const iconColor = isCredit ? colors.emerald : Theme.warning;
            return (
              <View
                key={entry.id}
                style={[
                  styles.ppTxCard,
                  { borderWidth: 1, borderColor: rowToneBorder, borderRadius: 12, paddingHorizontal: 12, marginBottom: 6 },
                ]}
              >
                <View style={styles.ppTxTopRow}>
                  <View style={[styles.ppIconSq, { backgroundColor: iconSqBg }]}>
                    <FontAwesome
                      name={isCredit ? 'arrow-down' : 'arrow-up'}
                      size={18}
                      color={iconColor}
                    />
                  </View>
                  <View style={styles.ppMiddle}>
                    <View style={styles.ppPrimaryRow}>
                      <Text style={[styles.ppPrimary, { color: colors.text }]} numberOfLines={1}>
                        {primary}
                      </Text>
                      <View style={[styles.txStatusPill, { backgroundColor: statusPillBg, borderColor: statusPillBorderColor }]}>
                        <Text style={[styles.txStatusPillText, { color: statusPillTextColor }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={[styles.ppSecondary, { color: subColor }]} numberOfLines={2}>
                      {label}
                    </Text>
                  </View>
                  <Text style={[styles.ppAmount, { color: amountColor }]} numberOfLines={1}>
                    {amountLabel}
                  </Text>
                </View>
                <View style={styles.ppMetaRow}>
                  <Text style={[styles.ppMetaLeft, { color: metaColor }]}>{phonePeMetaDate(entry.created_at)}</Text>
                  <View style={styles.ppMetaRight}>
                    <Text style={[styles.ppMetaRightText, { color: metaColor }]} numberOfLines={1}>
                      {metaRight}
                    </Text>
                    <FontAwesome name="university" size={13} color={colors.emerald} style={styles.ppMetaBankIcon} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={[styles.section, styles.gpayListSection]}>
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
                <Text style={[styles.upiSectionHeader, { color: colors.textMuted }]}>{sectionLabel}</Text>
                <View style={[styles.upiListBlock, { backgroundColor: 'transparent' }]}>
                  {trips.map((trip, tripIdx) => {
                    const earned = Math.round(tripEarnings(trip));
                    const receivedAmt = receivedByTripId[trip.id] ?? 0;
                    const isAggregate = isAggregateTrip(trip);
                    const routeSummary = [trip.pickup_area?.trim(), trip.drop_location?.trim()]
                      .filter(Boolean)
                      .join(' → ');
                    const tripRef = tripsService.getTripDisplayNumber(trip);
                    let amountLabel: string;
                    if (isAggregate) {
                      amountLabel = '—';
                    } else if (receivedAmt > 0) {
                      amountLabel = `+ ₹${receivedAmt.toLocaleString('en-IN')}`;
                    } else if (earned > 0) {
                      amountLabel = `₹${earned.toLocaleString('en-IN')}`;
                    } else {
                      amountLabel = '₹0';
                    }
                    const amountColor =
                      amountLabel === '—'
                        ? colors.textMuted
                        : receivedAmt > 0
                          ? isDark
                            ? colors.emerald
                            : Theme.gpayAmountReceived
                          : isDark
                            ? colors.text
                            : Theme.gpayListTitle;
                    const listDivider = isDark ? colors.borderSubtle : Theme.borderMedium;
                    const subColor = colors.textMuted;
                    const metaColor = colors.textMuted;
                    const secondaryLine = routeSummary || tripRef;
                    const primaryLine =
                      isAggregate && earned === 0
                        ? 'Ad hoc trip'
                        : receivedAmt > 0
                          ? 'Received for trip'
                          : 'Trip earnings';
                    const metaRight =
                      receivedAmt > 0
                        ? 'Credited to wallet'
                        : isAggregate && earned === 0
                          ? 'Pending'
                          : 'Pending from fleet';
                    const isLastTrip = tripIdx === trips.length - 1;
                    const iconName =
                      isAggregate && earned === 0 ? 'exchange' : receivedAmt > 0 ? 'arrow-down' : 'clock-o';
                    const isReceived = receivedAmt > 0;
                    const statusLabel = isReceived ? 'RECEIVED' : 'PENDING';
                    const statusPillBg = isReceived ? colors.emeraldMuted : AMBER_50;
                    const statusPillTextColor = isReceived ? colors.emerald : Theme.warning;
                    const statusPillBorderColor = isReceived ? colors.emeraldBorderSoft : 'rgba(180,83,9,0.25)';
                    const rowToneBorder = isReceived ? colors.emeraldBorderSoft : 'rgba(180,83,9,0.25)';
                    const iconSqBg = isReceived ? colors.emeraldMuted : AMBER_50;
                    const iconColor = isReceived ? colors.emerald : Theme.warning;
                    return (
                      <View
                        key={trip.id}
                        style={[
                          styles.ppTxCard,
                          { borderWidth: 1, borderColor: rowToneBorder, borderRadius: 12, paddingHorizontal: 12, marginBottom: 6 },
                        ]}
                      >
                        <View style={styles.ppTxTopRow}>
                          <View style={[styles.ppIconSq, { backgroundColor: iconSqBg }]}>
                            <FontAwesome name={iconName} size={18} color={iconColor} />
                          </View>
                          <View style={styles.ppMiddle}>
                            <View style={styles.ppPrimaryRow}>
                              <Text style={[styles.ppPrimary, { color: colors.text }]} numberOfLines={1}>
                                {primaryLine}
                              </Text>
                              <View style={[styles.txStatusPill, { backgroundColor: statusPillBg, borderColor: statusPillBorderColor }]}>
                                <Text style={[styles.txStatusPillText, { color: statusPillTextColor }]}>{statusLabel}</Text>
                              </View>
                            </View>
                            <Text style={[styles.ppSecondary, { color: subColor }]} numberOfLines={2}>
                              {secondaryLine}
                            </Text>
                          </View>
                          <Text style={[styles.ppAmount, { color: amountColor }]} numberOfLines={1}>
                            {amountLabel}
                          </Text>
                        </View>
                        <View style={styles.ppMetaRow}>
                          <Text style={[styles.ppMetaLeft, { color: metaColor }]}>
                            {phonePeMetaDate(trip.completed_at ?? trip.updated_at ?? trip.created_at)}
                          </Text>
                          <View style={styles.ppMetaRight}>
                            <Text style={[styles.ppMetaRightText, { color: metaColor }]} numberOfLines={1}>
                              {metaRight}
                            </Text>
                            <FontAwesome name="university" size={13} color={colors.emerald} style={styles.ppMetaBankIcon} />
                          </View>
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
  headerTitle: { ...Typography.headerTitle },
  headerSubtitle: { ...Typography.headerSubtitle, marginTop: 2 },
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
  section: { marginTop: 28 },
  gpayListSection: { marginHorizontal: Layout.screenPaddingHorizontal },
  sectionTitle: { fontSize: 17, fontWeight: '500', marginBottom: 6, letterSpacing: 0.1 },
  sectionSubtitle: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  ledgerCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  ledgerEmpty: { padding: 32, alignItems: 'center', gap: 12 },
  ledgerEmptyText: { fontSize: 14 },
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
  upiListWrap: { marginTop: 4, gap: 22 },
  upiSection: { gap: 6 },
  upiSectionHeader: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.15,
  },
  upiListBlock: {
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'visible',
  },
  ppTxCard: {
    paddingVertical: 14,
    paddingHorizontal: 0,
  },
  ppTxTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ppIconSq: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  ppMiddle: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  ppPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  ppPrimary: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  txStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txStatusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  ppSecondary: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 4,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  ppAmount: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.1,
    flexShrink: 0,
    maxWidth: '40%',
    textAlign: 'right',
  },
  ppMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingLeft: 58,
    paddingRight: 2,
  },
  ppMetaLeft: {
    fontSize: 12,
    fontWeight: '400',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  ppMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    maxWidth: '52%',
    justifyContent: 'flex-end',
  },
  ppMetaRightText: {
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'right',
    flexShrink: 1,
  },
  ppMetaBankIcon: {
    marginTop: 1,
  },
});
