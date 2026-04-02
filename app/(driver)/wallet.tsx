import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import { isAggregateTrip, tripEarningsForDriver } from '@/lib/driverUtils';
import { usePreventScreenCapture } from '@/lib/usePreventScreenCapture';
import * as driversService from '@/services/driversService';
import * as salaryRequestsService from '@/services/salaryRequestsService';
import * as tripsService from '@/services/tripsService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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

/** Trip earnings for driver: 0 for aggregate (offline payment), else driver_commission / 10% supplier_rate / 10% client_price. */
function tripEarnings(t: tripsService.TripRow): number {
  return tripEarningsForDriver(t);
}

function formatLedgerDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** UPI-style date section label: Today, Yesterday, or "5 Mar" */
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

const DRIVER_LEDGER_TYPE_LABELS: Record<string, string> = {
  salary: 'Monthly salary',
  settlement: 'Trip-based',
  advance: 'Advance',
  reimbursement: 'Reimbursement',
  adjustment: 'Adjustment',
  deduction: 'Deduction',
};

function ledgerTypeLabel(type: string): string {
  return DRIVER_LEDGER_TYPE_LABELS[type] ?? type;
}

/** Wallet card + credits – exact match to reference: Tailwind emerald/gray */
const EMERALD_950 = '#022c22';
const EMERALD_900 = '#064e3b';
const EMERALD_700 = '#047857';
const EMERALD_600 = '#059669';
const EMERALD_500 = '#10b981';   /* emerald-500: credits title, button bg */
const EMERALD_400 = '#34d399';   /* emerald-400: watermark, button border */
const EMERALD_200_90 = 'rgba(167,243,208,0.9)'; /* emerald-200/90: card label */
const GRAY_700 = '#374151';      /* gray-700: credits subtitle (dark grey) */
const AMBER_50 = 'rgba(245,158,11,0.12)';   /* pending badge bg */
const AMBER_600 = '#d97706';     /* pending badge text */
const EMERALD_50 = 'rgba(16,185,129,0.12)'; /* received badge bg */

export default function DriverWalletScreen() {
  usePreventScreenCapture();
  const insets = useSafeAreaInsets();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const router = useRouter();

  const openTripDetails = useCallback(
    (tripId: string) => {
      router.push({ pathname: '/(driver)/control', params: { tripId } });
    },
    [router],
  );
  const { profile } = useAuth();
  const { avatarSeed } = useDriverAvatar();
  const { avatarUri } = useDriverAvatarUri();
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'pending' | 'received'>('all');
  /** Expand/collapse transaction detail (trip id or null). No redirect. */
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [markPaidLoadingTripId, setMarkPaidLoadingTripId] = useState<string | null>(null);
  const [requestPaymentLoadingTripId, setRequestPaymentLoadingTripId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
    ]).then(([driversRes, invRes]) => {
      const drivers = (driversRes.drivers ?? []).filter((d) => !d.left_at);
      setInvites(invRes.invites ?? []);
      setLinkedDrivers(drivers);
      if (drivers.length > 0) {
        setDriver(drivers[0]);
        const driverIds = drivers.map((d) => d.id);
        Promise.all([
          tripsService.getTripsByDriverIds(driverIds),
          driversService.getDriverLedgerByDriverIds(driverIds),
        ]).then(([tRes, ledgerRes]) => {
          setTrips(tRes.trips ?? []);
          setLedgerEntries(ledgerRes.entries ?? []);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [profile?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const completedTrips = useMemo(() => {
    const list = trips.filter((t) => isCompleted(t.status));
    return [...list].sort((a, b) => {
      const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
      const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
      return db - da;
    });
  }, [trips]);

  /** O(n): one pass over ledgerEntries → received total per trip_id + non-trip entries. */
  const { receivedByTripId, nonTripLedgerEntries } = useMemo(() => {
    const byTrip: Record<string, number> = {};
    const nonTrip: driversService.DriverLedgerRow[] = [];
    for (let i = 0; i < ledgerEntries.length; i++) {
      const e = ledgerEntries[i];
      const amt = Number(e.amount) || 0;
      const tid = e.trip_id?.trim() || null;
      if (tid) {
        byTrip[tid] = (byTrip[tid] ?? 0) + amt;
      } else {
        nonTrip.push(e);
      }
    }
    return { receivedByTripId: byTrip, nonTripLedgerEntries: nonTrip };
  }, [ledgerEntries]);

  /** Pending = not yet credited; received = already in ledger. */
  const { pendingTrips, receivedTrips, filteredTrips, pendingTotal, receivedTotal } = useMemo(() => {
    const pending = completedTrips.filter((t) => (receivedByTripId[t.id] ?? 0) === 0);
    const received = completedTrips.filter((t) => (receivedByTripId[t.id] ?? 0) > 0);
    const pendingSum = pending.reduce((s, t) => s + tripEarnings(t), 0);
    const receivedSum = received.reduce((s, t) => s + (receivedByTripId[t.id] ?? 0), 0);
    const list =
      transactionFilter === 'pending'
        ? pending
        : transactionFilter === 'received'
          ? received
          : completedTrips;
    return {
      pendingTrips: pending,
      receivedTrips: received,
      filteredTrips: list,
      pendingTotal: pendingSum,
      receivedTotal: receivedSum,
    };
  }, [completedTrips, receivedByTripId, transactionFilter]);

  /** UPI-style: trips grouped by date section (Today, Yesterday, 5 Mar, ...) */
  const transactionSections = useMemo(() => {
    const list = filteredTrips.slice(0, 50);
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
            sectionLabel: formatTransactionDateSection(first.completed_at ?? first.updated_at ?? first.created_at ?? ''),
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
        sectionLabel: formatTransactionDateSection(first.completed_at ?? first.updated_at ?? first.created_at ?? ''),
        dateKey: currentKey,
        trips: currentGroup,
      });
    }
    return bySection;
  }, [filteredTrips]);

  // Wallet balance = only received (sum of all driver_ledger entries). Trip earnings are not in wallet until received.
  const totalReceived = Math.round(ledgerEntries.reduce((sum, e) => sum + (Number(e.amount) ?? 0), 0));

  /** Salary request: only show connected fleets (accepted invite). Use org name from invite when available, else "Fleet". */
  const salaryRequestOrgOptions = useMemo(() => {
    const accepted = invites.filter((i) => (i.status || '').toLowerCase() === 'accepted');
    return linkedDrivers
      .filter((d) => accepted.some((i) => String(i.from_organization_id || '') === String(d.organization_id || '')))
      .map((d) => {
        const inv = accepted.find(
          (i) => String(i.from_organization_id || '') === String(d.organization_id || '')
        );
        const rawName =
          (inv && (inv as { from_org_name?: string | null; fromOrgName?: string | null }).from_org_name) ||
          (inv && (inv as { from_org_name?: string | null; fromOrgName?: string | null }).fromOrgName) ||
          null;
        const name = (rawName && String(rawName).trim()) ? String(rawName).trim() : null;
        return {
          driverId: d.id,
          orgId: d.organization_id,
          orgName: name || 'Fleet',
        };
      });
  }, [linkedDrivers, invites]);

  /** Request payment for the selected trip only: create a single trip_based salary request in DB. */
  const requestPaymentForTrip = useCallback(
    async (trip: tripsService.TripRow) => {
      const driverId = trip.driver_id ?? linkedDrivers[0]?.id;
      if (!driverId || !trip.organization_id) {
        Alert.alert('Error', 'Missing driver or organization.');
        return;
      }
      const orgOption = salaryRequestOrgOptions.find(
        (o) => o.driverId === trip.driver_id && o.orgId === trip.organization_id
      );
      if (!orgOption) {
        Alert.alert('Fleet not found', 'This trip’s fleet is not in your connections. You can request payment from the main Salary request button.');
        return;
      }
      const amount = Math.round(tripEarnings(trip));
      if (amount <= 0) {
        Alert.alert('Invalid amount', 'No earnings for this trip.');
        return;
      }
      setRequestPaymentLoadingTripId(trip.id);
      const { error } = await salaryRequestsService.createSalaryRequest(
        driverId,
        trip.organization_id,
        'trip_based',
        amount,
        { tripIds: [trip.id], createdBy: profile?.uid ?? null }
      );
      setRequestPaymentLoadingTripId(null);
      if (error) {
        Alert.alert('Request failed', error.message);
        return;
      }
      Alert.alert('Request sent', `Settlement request for ₹${amount.toLocaleString('en-IN')} (${tripsService.getTripDisplayNumber(trip)}) has been sent to your fleet.`);
      setExpandedTripId(null);
    },
    [linkedDrivers, salaryRequestOrgOptions, profile?.uid]
  );
  const openSalaryRequestForTrip = requestPaymentForTrip;

  /** Mark trip as paid (settlement ledger entry). */
  const markTripAsPaid = useCallback(
    async (trip: tripsService.TripRow, amount: number) => {
      const driverId = trip.driver_id ?? linkedDrivers[0]?.id;
      if (!driverId || !trip.organization_id) {
        Alert.alert('Error', 'Missing driver or organization.');
        return;
      }
      setMarkPaidLoadingTripId(trip.id);
      const { error } = await driversService.createDriverLedgerEntry(
        trip.organization_id,
        driverId,
        Math.round(amount),
        'settlement',
        { tripId: trip.id, createdBy: profile?.uid ?? null, description: `Trip ${tripsService.getTripDisplayNumber(trip)}` }
      );
      setMarkPaidLoadingTripId(null);
      if (error) {
        const isDriverLedgerRls =
          /row-level security policy.*driver_ledger|driver_ledger.*row-level security/i.test(error.message);
        const message = isDriverLedgerRls
          ? "You don't have permission to record this payment. Ensure the database has the driver settlement policy applied (migration: 20250324120000_driver_ledger_driver_settlement_insert)."
          : error.message;
        Alert.alert('Could not mark as paid', message);
        return;
      }
      setExpandedTripId(null);
      load();
    },
    [linkedDrivers, profile?.uid, load]
  );

  /** Confirm then mark trip as paid. */
  const confirmMarkAsPaid = useCallback(
    (trip: tripsService.TripRow, amount: number) => {
      const displayId = tripsService.getTripDisplayNumber(trip);
      const amtStr = `₹${Math.round(amount).toLocaleString('en-IN')}`;
      Alert.alert(
        'Mark as paid',
        `Record ${amtStr} for ${displayId} as received? This will update your wallet.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: () => markTripAsPaid(trip, amount) },
        ]
      );
    },
    [markTripAsPaid]
  );

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.emerald} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.push('/(driver)/profile')}
            style={styles.avatarBtn}
            activeOpacity={0.8}
          >
            <View style={[styles.avatarCircle, { borderColor: colors.border, backgroundColor: colors.emeraldMuted }]}>
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            </View>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.brand, { color: colors.textMuted }]}>Q PILOT</Text>
            <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>Wallet</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(driver)/requests')}
          style={[styles.passbookHeaderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
          accessibilityLabel="Passbook"
          accessibilityHint="Opens passbook by fleet"
        >
          <FontAwesome name="book" size={18} color={colors.emerald} />
          <Text style={[styles.passbookHeaderBtnText, { color: colors.emerald }]}>Passbook</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.creditsSection}>
        <Text style={[styles.creditsTitle, { color: EMERALD_500 }]}>Salary.</Text>
        <Text style={[styles.creditsSubtitle, { color: GRAY_700 }]}>Financial audit & settlements.</Text>
      </View>

      <View style={styles.walletCardWrap}>
        <View
          style={[
            styles.walletCard,
            {
              backgroundColor: isDark ? EMERALD_900 : EMERALD_600,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(4,120,87,0.5)' : 'rgba(16,185,129,0.5)',
              shadowColor: isDark ? 'rgba(6,95,70,0.25)' : 'rgba(6,95,70,0.2)',
              shadowOffset: { width: 0, height: 20 },
              shadowOpacity: 1,
              shadowRadius: 40,
              elevation: 8,
            },
          ]}
        >
          <View style={styles.walletCardWatermarkWrap} pointerEvents="none">
            <Text
              style={[
                styles.walletCardWatermark,
                { color: EMERALD_400, opacity: 0.25, transform: [{ rotate: '12deg' }] },
              ]}
            >
              ₹
            </Text>
          </View>
          <View style={styles.walletCardContent}>
            <Text style={[styles.walletCardLabel, { color: EMERALD_200_90 }]}>salary balance</Text>
            <Text style={[styles.walletCardSublabel, { color: EMERALD_200_90, opacity: 0.8 }]}></Text>
            <View style={styles.walletCardBalanceRow}>
              <Text style={[styles.walletCardBalanceRupee, { color: '#ffffff' }]}>₹</Text>
              <Text style={[styles.walletCardBalanceNumber, { color: '#ffffff' }]}>{totalReceived.toLocaleString()}</Text>
            </View>
            <TouchableOpacity
              style={[styles.walletCardWithdrawBtn, { backgroundColor: EMERALD_500, borderColor: 'rgba(52,211,153,0.3)' }]}
              activeOpacity={0.8}
              onPress={() => router.push('/(driver)/salary-request')}
              accessibilityLabel="Salary request"
              accessibilityHint="Request salary from your fleet"
            >
              <Text style={[styles.walletCardWithdrawText, { color: '#000000' }]}>SALARY REQUEST</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {nonTripLedgerEntries.length > 0 ? (
        <View style={styles.ledgerSection}>
          <Text style={[styles.ledgerTitle, { color: colors.text }]}>Other payments</Text>
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
                  <Text style={[styles.ledgerDate, { color: colors.textMuted }]}>
                    {formatLedgerDate(entry.created_at)}
                  </Text>
                </View>
                <Text style={[styles.ledgerAmount, { color: colors.emerald }]}>
                  +₹{Number(entry.amount).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.ledgerSection}>
        <Text style={[styles.transactionHistoryTitle, { color: colors.text }]}>
          Transaction history
        </Text>
        {(pendingTotal > 0 || receivedTotal > 0) && (
          <View style={styles.filterSummaryRow}>
            <TouchableOpacity
              style={[
                styles.filterSummaryTile,
                styles.filterSummaryTilePending,
                transactionFilter === 'pending' && styles.filterSummaryTileActive,
              ]}
              onPress={() => setTransactionFilter(transactionFilter === 'pending' ? 'all' : 'pending')}
              activeOpacity={0.9}
              accessibilityLabel="Filter by pending"
              accessibilityState={{ selected: transactionFilter === 'pending' }}
            >
              <View style={styles.filterSummaryWatermarkWrap} pointerEvents="none">
                <FontAwesome
                  name="clock-o"
                  size={56}
                  color={Theme.textOnPrimary}
                  style={styles.filterSummaryWatermarkIcon}
                />
              </View>
              <View style={styles.filterSummaryContent}>
                <Text style={styles.filterSummaryLabelOnDark}>PENDING</Text>
                <Text style={styles.filterSummaryAmountOnDark}>
                  ₹{pendingTotal.toLocaleString('en-IN')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterSummaryTile,
                styles.filterSummaryTileReceived,
                transactionFilter === 'received' && styles.filterSummaryTileActive,
              ]}
              onPress={() => setTransactionFilter(transactionFilter === 'received' ? 'all' : 'received')}
              activeOpacity={0.9}
              accessibilityLabel="Filter by received"
              accessibilityState={{ selected: transactionFilter === 'received' }}
            >
              <View style={styles.filterSummaryWatermarkWrap} pointerEvents="none">
                <FontAwesome
                  name="check-circle"
                  size={56}
                  color={Theme.textOnPrimary}
                  style={styles.filterSummaryWatermarkIcon}
                />
              </View>
              <View style={styles.filterSummaryContent}>
                <Text style={styles.filterSummaryLabelOnDark}>RECEIVED</Text>
                <Text style={styles.filterSummaryAmountOnDark}>
                  ₹{receivedTotal.toLocaleString('en-IN')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
        {completedTrips.length === 0 ? (
          <View style={[styles.ledgerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.ledgerEmpty, { borderBottomWidth: 0 }]}>
              <FontAwesome name="exchange" size={32} color={colors.textMuted} />
              <Text style={[styles.ledgerEmptyText, { color: colors.textMuted }]}>No trips completed yet</Text>
            </View>
          </View>
        ) : filteredTrips.length === 0 ? (
          <View style={[styles.ledgerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.ledgerEmpty, { borderBottomWidth: 0 }]}>
              <FontAwesome
                name={transactionFilter === 'pending' ? 'clock-o' : 'check-circle'}
                size={32}
                color={colors.textMuted}
              />
              <Text style={[styles.ledgerEmptyText, { color: colors.textMuted }]}>
                {transactionFilter === 'pending'
                  ? 'No pending earnings'
                  : 'No received yet'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.upiListWrap}>
            {transactionSections.map(({ sectionLabel, dateKey, trips }) => (
              <View key={dateKey} style={styles.upiSection}>
                <Text style={[styles.upiSectionHeader, { color: colors.textMuted }]}>{sectionLabel}</Text>
                <View style={[styles.upiListBlock, { backgroundColor: colors.surface }]}>
                  {trips.map((trip, idx) => {
                    const earned = tripEarnings(trip);
                    const received = receivedByTripId[trip.id] ?? 0;
                    const date = formatLedgerDate(trip.completed_at ?? trip.updated_at ?? trip.created_at);
                    const isPending = received === 0;
                    const isAdHocTrip = isAggregateTrip(trip);
                    const isLast = idx === trips.length - 1;
                    const isExpanded = expandedTripId === trip.id;
                    const transactionDateTime =
                      trip.completed_at ?? trip.updated_at ?? trip.created_at
                        ? new Date(trip.completed_at ?? trip.updated_at ?? trip.created_at).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : '—';
                    return (
                      <View
                        key={trip.id}
                        style={[styles.tripCard, { backgroundColor: colors.surface }]}
                      >
                        <TouchableOpacity
                          style={[
                            styles.upiRow,
                            { borderBottomColor: colors.border },
                            isLast && !isExpanded && styles.upiRowLast,
                          ]}
                          activeOpacity={0.7}
                          onPress={() => setExpandedTripId((prev) => (prev === trip.id ? null : trip.id))}
                          accessibilityLabel={`Trip ${tripsService.getTripDisplayNumber(trip)} earnings ${earned}`}
                          accessibilityHint={isExpanded ? 'Collapse details' : 'Expand details'}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: isExpanded }}
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
                            <Text style={[styles.upiRowTitle, { color: colors.text }]} numberOfLines={1}>
                              Trip Earnings
                            </Text>
                            <Text style={[styles.upiRowSub, { color: colors.textMuted }]} numberOfLines={1}>
                              {date}
                              {isAdHocTrip ? ' · Ad hoc trip' : ''}
                              {(trip.pickup_area?.trim() || trip.drop_location?.trim())
                                ? ` · ${[trip.pickup_area?.trim(), trip.drop_location?.trim()].filter(Boolean).join(' → ')}`
                                : ''}
                            </Text>
                          </View>
                          <View style={styles.upiRowRight}>
                            <Text
                              style={[
                                styles.upiRowAmount,
                                { color: isPending ? Theme.primaryText : Theme.darkGreen },
                              ]}
                            >
                              +₹{earned.toLocaleString('en-IN')}
                            </Text>
                            <Text
                              style={[
                                styles.upiRowStatus,
                                { color: isPending ? Theme.negative : Theme.driverEmerald },
                              ]}
                            >
                              {isPending ? 'Pending' : 'Settled'}
                            </Text>
                          </View>
                          {/* Chevron removed per latest UX request */}
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={[styles.upiExpandedPanel, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                            <View style={[styles.upiExpandedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                              <View style={[styles.upiExpandedDetailRowTwoCol, { borderBottomColor: colors.border }]}>
                                <View style={styles.upiExpandedDetailCell}>
                                  <Text style={[styles.upiExpandedLabel, { color: colors.textMuted }]}>Trip ID</Text>
                                  <Text style={[styles.upiExpandedValue, { color: colors.text }]} numberOfLines={1}>{tripsService.getTripDisplayNumber(trip)}</Text>
                                </View>
                                <View style={[styles.upiExpandedDetailCell, styles.upiExpandedDetailCellRight]}>
                                  <Text style={[styles.upiExpandedLabel, { color: colors.textMuted }]}>Date & time</Text>
                                  <Text style={[styles.upiExpandedValue, { color: colors.text }]} numberOfLines={2}>{transactionDateTime}</Text>
                                </View>
                              </View>
                              <View style={[styles.upiExpandedDetailRowTwoCol, styles.upiExpandedDetailRowLast, { borderBottomColor: colors.border }]}>
                                <View style={styles.upiExpandedDetailCell}>
                                  <Text style={[styles.upiExpandedLabel, { color: colors.textMuted }]}>Route</Text>
                                  <Text style={[styles.upiExpandedValue, { color: colors.text }]} numberOfLines={2}>
                                    {(trip.pickup_area?.trim() || trip.drop_location?.trim())
                                      ? [trip.pickup_area?.trim(), trip.drop_location?.trim()].filter(Boolean).join(' → ')
                                      : '—'}
                                  </Text>
                                </View>
                                <View style={[styles.upiExpandedDetailCell, styles.upiExpandedDetailCellRight]}>
                                  <Text style={[styles.upiExpandedLabel, { color: colors.textMuted }]}>Amount</Text>
                                  <Text style={[styles.upiExpandedValue, styles.upiExpandedAmountValue, { color: isPending ? Theme.negative : Theme.darkGreen }]}>
                                    +₹{earned.toLocaleString('en-IN')}
                                  </Text>
                                </View>
                              </View>
                            </View>
                            {isPending && isAdHocTrip && (
                              <View style={[styles.upiExpandedAdHocCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                <View style={[styles.upiExpandedAdHocIconWrap, { backgroundColor: colors.emeraldMuted }]}>
                                  <FontAwesome name="info-circle" size={20} color={colors.emerald} />
                                </View>
                                <View style={styles.upiExpandedAdHocTextWrap}>
                                  <Text style={[styles.upiExpandedAdHocTitle, { color: colors.text }]}>
                                    Ad hoc trip
                                  </Text>
                                  <Text style={[styles.upiExpandedAdHocBody, { color: colors.textMuted }]}>
                                    You'll get paid by this fleet directly. The 'Request payment' button is only for fleets you're connected to.
                                  </Text>
                                </View>
                              </View>
                            )}
                            {isPending && !isAdHocTrip && (
                              <View style={[styles.upiExpandedActions, { borderTopColor: colors.border }]}>
                                <TouchableOpacity
                                  style={[styles.upiExpandedBtn, styles.upiExpandedBtnPrimary, { backgroundColor: colors.emerald }]}
                                  onPress={() => openSalaryRequestForTrip(trip)}
                                  disabled={!!requestPaymentLoadingTripId}
                                  activeOpacity={0.8}
                                  accessibilityLabel="Request payment"
                                >
                                  {requestPaymentLoadingTripId === trip.id ? (
                                    <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                                  ) : (
                                    <FontAwesome name="send" size={14} color={Theme.textOnPrimary} />
                                  )}
                                  <Text style={[styles.upiExpandedBtnText, { color: Theme.textOnPrimary }]}>
                                    {requestPaymentLoadingTripId === trip.id ? 'Sending…' : 'Request payment'}
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.upiExpandedBtn, styles.upiExpandedBtnSecondary, { borderColor: colors.border }]}
                                  onPress={() => confirmMarkAsPaid(trip, earned)}
                                  disabled={!!markPaidLoadingTripId}
                                  activeOpacity={0.8}
                                  accessibilityLabel="Mark as paid"
                                >
                                  {markPaidLoadingTripId === trip.id ? (
                                    <ActivityIndicator size="small" color={colors.text} />
                                  ) : (
                                    <FontAwesome name="check-circle" size={14} color={colors.text} />
                                  )}
                                  <Text style={[styles.upiExpandedBtnText, { color: colors.text }]}>
                                    {markPaidLoadingTripId === trip.id ? 'Marking…' : 'Mark as paid'}
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
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.driverBackground,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.driverBackground,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.driverHeaderHorizontalPadding,
    paddingBottom: Layout.driverHeaderBottomPadding,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.driverHeaderGap,
    flex: 1,
    minWidth: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  passbookHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  passbookHeaderBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  avatarBtn: { padding: 2 },
  avatarCircle: {
    width: Layout.driverHeaderAvatarSize,
    height: Layout.driverHeaderAvatarSize,
    borderRadius: Layout.driverHeaderAvatarSize / 2,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: Layout.driverHeaderAvatarSize / 2,
  },
  brand: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 1,
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  creditsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  creditsTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  creditsSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  walletCardWrap: {
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  walletCard: {
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 60,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  walletCardWatermarkWrap: {
    position: 'absolute',
    top: 0,
    right: -12,
    width: 100,
    paddingTop: 24,
    paddingRight: 24,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  walletCardWatermark: {
    fontSize: 120,
    fontWeight: '700',
  },
  walletCardContent: {
    width: '100%',
    alignItems: 'center',
  },
  walletCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 5,
    marginBottom: 4,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  walletCardSublabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  walletCardBalanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    paddingHorizontal: 50,
  },
  walletCardBalanceRupee: {
    fontSize: 48,
    fontWeight: '800',
    fontStyle: 'italic',
    lineHeight: 56,
    marginRight: -4,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  walletCardBalanceNumber: {
    fontSize: 48,
    fontWeight: '800',
    fontStyle: 'italic',
    lineHeight: 56,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  walletCardWithdrawBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  walletCardWithdrawText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 4,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  ledgerSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  transactionHistoryTitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  filterTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  filterTabPill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabPillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  filterSummaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 12,
  },
  filterSummaryTile: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  filterSummaryTilePending: {
    backgroundColor: '#B91C1C',
  },
  filterSummaryTileReceived: {
    backgroundColor: EMERALD_600,
  },
  filterSummaryTileActive: {
    borderColor: 'rgba(255,255,255,0.6)',
  },
  filterSummaryWatermarkWrap: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '12deg' }],
  },
  filterSummaryWatermarkIcon: {
    opacity: 0.2,
  },
  filterSummaryContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  filterSummaryLabelOnDark: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  },
  filterSummaryAmountOnDark: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 0.2,
    color: Theme.textOnPrimary,
  },
  filterSummaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  filterSummaryAmountPending: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: Theme.negative,
  },
  filterSummaryAmountReceived: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: Theme.driverEmerald,
  },
  filterScroll: {
    marginBottom: 8,
  },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 24,
  },
  filterTab: {
    position: 'relative' as const,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  filterTabUnderline: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 4,
    height: 2,
    borderRadius: 1,
  },
  filterSummary: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  ledgerTitle: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  ledgerCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ledgerEmpty: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  ledgerEmptyText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.driverBorder,
    gap: 16,
  },
  ledgerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.driverEmerald,
    borderWidth: 1,
    borderColor: Theme.driverEmerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerIconWrapDebit: {
    backgroundColor: Theme.driverSurface,
  },
  ledgerDesc: { flex: 1 },
  ledgerDescText: {
    fontSize: 13,
    fontWeight: '500',
    color: Theme.textOnDark,
  },
  ledgerDate: {
    fontSize: 9,
    fontWeight: '500',
    color: Theme.textMuted,
    marginTop: 2,
  },
  ledgerAmount: {
    fontSize: 15,
    fontWeight: '500',
    color: Theme.driverEmerald,
  },
  ledgerAmountDebit: {
    color: Theme.textMuted,
  },
  upiListWrap: {
    gap: 20,
    paddingBottom: 24,
  },
  upiSection: {
    gap: 8,
  },
  upiSectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
    paddingHorizontal: 4,
  },
  upiListBlock: {
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  tripCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 6,
    overflow: 'hidden',
  },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  upiRowLast: {
    borderBottomWidth: 0,
  },
  upiRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiRowIconStyle: {
    opacity: 0.39,
  },
  upiRowBody: {
    flex: 1,
    minWidth: 0,
  },
  upiRowTitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  upiRowSub: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  upiRowRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  upiRowAmount: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  upiRowStatus: {
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  upiRowChevron: {
    marginLeft: 4,
  },
  upiExpandedPanel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
  },
  upiExpandedCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: 'rgba(16,185,129,0.35)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  upiExpandedDetailRowTwoCol: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  upiExpandedDetailRowLast: {
    borderBottomWidth: 0,
  },
  upiExpandedDetailCell: {
    flex: 1,
    minWidth: 0,
  },
  upiExpandedDetailCellRight: {
    paddingLeft: 8,
  },
  upiExpandedLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  upiExpandedValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  upiExpandedAmountValue: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  upiExpandedActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  upiExpandedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  upiExpandedBtnPrimary: {
    shadowColor: 'rgba(16,185,129,0.35)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  upiExpandedBtnSecondary: {
    borderWidth: 1,
  },
  upiExpandedBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  upiExpandedAdHocCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    paddingBottom: 4,
    borderTopWidth: 1,
    paddingHorizontal: 4,
  },
  upiExpandedAdHocIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiExpandedAdHocTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  upiExpandedAdHocTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  upiExpandedAdHocBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  earningsListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  earningsListRowLast: {
    borderBottomWidth: 0,
  },
  earningsListStatusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsListStatusIconWrapSettled: {
    backgroundColor: Theme.driverEmerald,
  },
  earningsListStatusIconWrapNotSettled: {
    backgroundColor: Theme.negative,
  },
  earningsListBody: {
    flex: 1,
    minWidth: 0,
  },
  earningsListHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  earningsListTripId: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  earningsListRideBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  earningsListRideBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  earningsListSubtext: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 4,
  },
  earningsListLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    minWidth: 0,
  },
  earningsListLocationIcon: {
    marginRight: 5,
  },
  earningsListLocation: {
    flex: 1,
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  earningsListRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  earningsListAmount: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  earningsCardStatusTagText: {
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  tripBlock: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.driverBorder,
  },
  tripEarningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0,
    gap: 16,
  },
  receivedSubrowWrap: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    paddingLeft: 56,
    borderLeftWidth: 3,
    borderLeftColor: Theme.driverEmeraldBorderSoft ?? Theme.driverEmerald,
    marginLeft: 20,
    marginRight: 20,
    marginBottom: 4,
  },
  receivedSubrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ledgerIconWrapSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receivedLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  ledgerAmountSmall: {
    fontSize: 14,
    fontWeight: '500',
  },
  notReceivedLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
