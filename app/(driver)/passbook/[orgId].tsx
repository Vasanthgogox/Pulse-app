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
  const from = typeof params.from === 'string' ? params.from : params.from?.[0] ?? 'dashboard';

  const handleBack = useCallback(() => {
    if (from === 'history') {
      router.navigate('/(driver)/passbook/history');
    } else {
      router.navigate('/(driver)');
    }
  }, [router, from]);

  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityTab, setActivityTab] = useState<'all' | 'trips' | 'settled'>('all');

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

  const totalEarned = useMemo(() => {
    return Math.round(completedTrips.reduce((sum, trip) => sum + tripEarnings(trip), 0));
  }, [completedTrips]);

  const pendingToCollect = useMemo(() => Math.max(0, totalEarned - totalReceived), [totalEarned, totalReceived]);

  const joinedLabel = useMemo(() => {
    const raw = driver?.created_at ?? null;
    if (!raw) return null;
    return new Date(raw).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [driver?.created_at]);

  const activeLabel = useMemo(() => {
    const raw = driver?.created_at ?? null;
    if (!raw) return null;
    const start = new Date(raw).getTime();
    const now = Date.now();
    const days = Math.max(0, Math.round((now - start) / (1000 * 60 * 60 * 24)));
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    if (years <= 0 && months <= 0) return 'ACTIVE';
    if (years <= 0) return `${months}M ACTIVE`;
    return `${years}Y ${months}M ACTIVE`;
  }, [driver?.created_at]);

  const filteredCompletedTrips = useMemo(() => {
    if (activityTab === 'all') return completedTrips;
    if (activityTab === 'settled') return completedTrips.filter((t) => (receivedByTripId[t.id] ?? 0) > 0);
    // trips = non-settled trips
    return completedTrips.filter((t) => (receivedByTripId[t.id] ?? 0) === 0);
  }, [activityTab, completedTrips, receivedByTripId]);

  const activitySections = useMemo(() => {
    const list = filteredCompletedTrips
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
  }, [filteredCompletedTrips]);

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
      <View style={[styles.headerLite, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={handleBack} style={[styles.backPill, { backgroundColor: colors.surface }]} activeOpacity={0.85}>
          <FontAwesome name="arrow-left" size={16} color={colors.text} />
          <Text style={[styles.backPillText, { color: colors.textMuted }]}>Back to fleets</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.fleetHero, { backgroundColor: '#0b1220' }]}>
        <View style={styles.fleetHeroTop}>
          <View style={styles.fleetHeroTitleWrap}>
            <Text style={styles.fleetHeroTitle} numberOfLines={1}>{orgName}</Text>
            <View style={styles.fleetHeroMetaRow}>
              <FontAwesome name="calendar-o" size={12} color={'rgba(255,255,255,0.55)'} />
              <Text style={styles.fleetHeroMetaText} numberOfLines={1}>
                {joinedLabel ? `Joined ${joinedLabel}` : 'Joined'}
              </Text>
              <Text style={styles.fleetHeroMetaDot}>•</Text>
              <View style={styles.fleetHeroActivePill}>
                <View style={styles.fleetHeroActiveDot} />
                <Text style={styles.fleetHeroActiveText}>{activeLabel ?? 'ACTIVE'}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.fleetHeroIcon, { backgroundColor: colors.emerald }]}>
            <FontAwesome name="building-o" size={16} color={Theme.textOnPrimary} />
          </View>
        </View>

        <View style={styles.fleetHeroPendingCard}>
          <Text style={styles.fleetHeroPendingLabel}>Pending to collect</Text>
          <View style={styles.fleetHeroPendingRow}>
            <Text style={styles.fleetHeroPendingAmount}>₹{pendingToCollect.toLocaleString('en-IN')}</Text>
            <View style={styles.fleetHeroBoltBadge}>
              <FontAwesome name="bolt" size={14} color={'rgb(251,146,60)'} />
            </View>
          </View>
        </View>

        <View style={styles.fleetHeroStatsRow}>
          <View style={styles.fleetHeroStat}>
            <Text style={styles.fleetHeroStatLabel}>Life earnings</Text>
            <Text style={styles.fleetHeroStatValue}>₹{totalEarned.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.fleetHeroStatDivider} />
          <View style={styles.fleetHeroStat}>
            <Text style={styles.fleetHeroStatLabel}>Settled funds</Text>
            <Text style={[styles.fleetHeroStatValue, { color: colors.emerald }]}>₹{totalReceived.toLocaleString('en-IN')}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.activityTabsWrap, { backgroundColor: isDark ? colors.surfaceElevated : 'rgba(226,232,240,0.55)', borderColor: isDark ? colors.borderSubtle : 'rgba(255,255,255,0.7)' }]}>
        {[
          { id: 'all' as const, label: 'All' },
          { id: 'trips' as const, label: 'Trips' },
          { id: 'settled' as const, label: 'Settled' },
        ].map((t) => {
          const active = activityTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setActivityTab(t.id)}
              activeOpacity={0.85}
              style={[
                styles.activityTab,
                active && [
                  styles.activityTabActive,
                  { backgroundColor: '#0f172a', shadowColor: isDark ? '#000' : 'rgba(15,23,42,0.22)' },
                ],
              ]}
            >
              <Text style={[styles.activityTabText, { color: active ? Theme.textOnPrimary : colors.textMuted }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.section, styles.gpayListSection]}>
        <View style={styles.activitiesHeaderRow}>
          <FontAwesome name="sliders" size={14} color={colors.textMuted} />
          <Text style={[styles.activitiesHeaderText, { color: colors.textMuted }]}>
            Activities ({activityTab})
          </Text>
        </View>

        {activitySections.length === 0 ? (
          <View style={[styles.ledgerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.ledgerEmpty, { borderBottomWidth: 0 }]}>
              <FontAwesome name="search" size={32} color={colors.textMuted} />
              <Text style={[styles.ledgerEmptyText, { color: colors.textMuted }]}>No activities found</Text>
            </View>
          </View>
        ) : (
          <View style={styles.upiListWrap}>
            {activitySections.map(({ sectionLabel, dateKey, trips }) => (
              <View key={dateKey || sectionLabel} style={styles.upiSection}>
                <Text style={[styles.upiSectionHeader, { color: colors.textMuted }]}>{sectionLabel}</Text>
                <View style={[styles.upiListBlock, { backgroundColor: 'transparent' }]}>
                  {trips.map((trip, tripIdx) => {
                    const receivedAmt = receivedByTripId[trip.id] ?? 0;
                    const pending = receivedAmt === 0;
                    const tripRef = tripsService.getTripDisplayNumber(trip);
                    const from = trip.pickup_area?.trim() || 'Unknown origin';
                    const to = trip.drop_location?.trim() || 'Unknown destination';
                    const isLastTrip = tripIdx === trips.length - 1;
                    const listDivider = isDark ? colors.borderSubtle : Theme.borderMedium;
                    return (
                      <View
                        key={trip.id}
                        style={[
                          styles.passbookTripCard,
                          { backgroundColor: colors.surface, borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)' },
                          !isLastTrip && { marginBottom: 14 },
                        ]}
                      >
                        <View style={styles.passbookTripTop}>
                          <View style={[styles.passbookTripIcon, { backgroundColor: '#0f172a' }]}>
                            <FontAwesome name="line-chart" size={18} color={Theme.textOnPrimary} />
                          </View>
                          <View style={styles.passbookTripHead}>
                            <Text style={[styles.passbookTripId, { color: colors.text }]}>{tripRef}</Text>
                            <Text style={[styles.passbookTripMeta, { color: colors.textMuted }]}>
                              {new Date(trip.completed_at ?? trip.updated_at ?? trip.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}{' '}
                              • {sectionLabel.toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.passbookTripRight}>
                            <Text style={[styles.passbookTripAmount, { color: colors.text }]}>
                              ₹{Math.round(tripEarnings(trip)).toLocaleString('en-IN')}
                            </Text>
                            <Text
                              style={[
                                styles.passbookTripStatusPill,
                                pending ? styles.passbookTripStatusInfo : styles.passbookTripStatusSuccess,
                              ]}
                            >
                              {pending ? 'PENDING FROM FLEET' : 'PAID TO BANK'}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.passbookRouteCard,
                            {
                              backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.85)',
                              borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.65)',
                            },
                          ]}
                        >
                          <View style={styles.passbookRouteSide}>
                            <Text style={[styles.passbookRouteLabel, { color: colors.textMuted }]}>Origin</Text>
                            <Text style={[styles.passbookRouteValue, { color: colors.text }]} numberOfLines={1}>{from}</Text>
                          </View>
                          <View style={styles.passbookRouteMiddle}>
                            <View style={[styles.passbookRouteDot, { backgroundColor: colors.emerald }]} />
                            <View style={[styles.passbookRouteLine, { backgroundColor: colors.border }]} />
                            <View style={[styles.passbookRouteDot, { backgroundColor: colors.textMuted }]} />
                          </View>
                          <View style={[styles.passbookRouteSide, styles.passbookRouteSideRight]}>
                            <Text style={[styles.passbookRouteLabel, { color: colors.textMuted }]}>Destination</Text>
                            <Text style={[styles.passbookRouteValue, { color: colors.text }]} numberOfLines={1}>{to}</Text>
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
            const metaRight = isCredit ? 'Added to cash balance' : 'Updated in passbook';
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
                  { paddingHorizontal: 0 },
                  !isLastEntry && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: listDivider },
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
                    const secondaryLine = routeSummary || 'Route not specified';
                    const primaryLine = tripRef;
                    const metaRight =
                      receivedAmt > 0
                        ? 'Added to cash balance'
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
                          { paddingHorizontal: 0 },
                          !isLastTrip && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: listDivider },
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
  headerLite: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 14,
  },
  backPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.7)',
    shadowColor: 'rgba(15,23,42,0.08)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  backPillText: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  fleetHero: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    borderRadius: 34,
    padding: 22,
    overflow: 'hidden',
    shadowColor: 'rgba(15,23,42,0.30)',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.22,
    shadowRadius: 36,
    elevation: 14,
  },
  fleetHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  fleetHeroTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  fleetHeroTitle: {
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: -0.6,
    color: '#ffffff',
    marginBottom: 8,
  },
  fleetHeroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  fleetHeroMetaText: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.55)',
  },
  fleetHeroMetaDot: {
    fontSize: 10,
    fontWeight: '400',
    color: 'rgba(16,185,129,0.85)',
  },
  fleetHeroActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  fleetHeroActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(16,185,129,0.9)',
  },
  fleetHeroActiveText: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: 'rgba(16,185,129,0.95)',
  },
  fleetHeroIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 10,
  },
  fleetHeroPendingCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 16,
  },
  fleetHeroPendingLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    color: 'rgba(251,146,60,0.85)',
    marginBottom: 8,
  },
  fleetHeroPendingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  fleetHeroPendingAmount: {
    fontSize: 36,
    fontWeight: '500',
    letterSpacing: -1.1,
    color: 'rgb(251,146,60)',
  },
  fleetHeroBoltBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(251,146,60,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,146,60,0.20)',
  },
  fleetHeroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  fleetHeroStat: {
    flex: 1,
    minWidth: 0,
  },
  fleetHeroStatDivider: {
    width: 1,
    height: 42,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fleetHeroStatLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 6,
  },
  fleetHeroStatValue: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: -0.4,
    color: '#ffffff',
  },
  activityTabsWrap: {
    marginTop: 16,
    marginHorizontal: Layout.screenPaddingHorizontal,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    padding: 6,
    gap: 6,
  },
  activityTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 999,
  },
  activityTabActive: {
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 26,
    elevation: 10,
  },
  activityTabText: {
    fontSize: 9,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  activitiesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
    marginTop: 20,
    marginBottom: 10,
  },
  activitiesHeaderText: {
    fontSize: 9,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  passbookTripCard: {
    borderWidth: 1,
    borderRadius: 30,
    padding: 20,
  },
  passbookTripTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 16,
  },
  passbookTripIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passbookTripHead: {
    flex: 1,
    minWidth: 0,
  },
  passbookTripId: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  passbookTripMeta: {
    fontSize: 9,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  passbookTripRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  passbookTripAmount: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: -0.7,
  },
  passbookTripStatusPill: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  passbookTripStatusInfo: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  passbookTripStatusSuccess: {
    backgroundColor: '#ecfdf5',
    color: '#059669',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  passbookRouteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  passbookRouteSide: {
    flex: 1,
    minWidth: 0,
  },
  passbookRouteSideRight: {
    alignItems: 'flex-end',
  },
  passbookRouteLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  passbookRouteValue: {
    fontSize: 12,
    fontWeight: '400',
  },
  passbookRouteMiddle: {
    alignItems: 'center',
    width: 44,
  },
  passbookRouteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  passbookRouteLine: {
    width: 1,
    height: 22,
    marginVertical: 2,
  },
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
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 1,
    shadowRadius: 26,
    elevation: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  summaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 3,
  },
  summarySubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  summaryBadgeText: {
    fontSize: 8,
    fontWeight: '400',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  summaryStats: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  summaryStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryStatLabel: {
    fontSize: 8,
    fontWeight: '400',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  summaryStatValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  section: { marginTop: 28 },
  gpayListSection: { marginHorizontal: Layout.screenPaddingHorizontal },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionSubtitle: { fontSize: 11, fontWeight: '400', marginBottom: 12, lineHeight: 16 },
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
  emptyTitle: { fontSize: 16, fontWeight: '500', marginTop: 16 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  upiListWrap: { marginTop: 4, gap: 22 },
  upiSection: { gap: 6 },
  upiSectionHeader: {
    fontSize: 8,
    fontWeight: '400',
    letterSpacing: 2,
    textTransform: 'uppercase',
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
    borderRadius: 23,
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
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
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
    fontSize: 8,
    fontWeight: '400',
    letterSpacing: 2,
  },
  ppSecondary: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 4,
    lineHeight: 18,
    letterSpacing: 0,
  },
  ppAmount: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
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
