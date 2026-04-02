/**
 * Driver Requests page — connection invites + passbook per fleet (driver_invites, trips, driver_ledger).
 * PENDING: accept/decline. CONNECTED: accepted/declined with optional Passbook summary and link to detail.
 */
// Wallet-style hero text (match wallet.tsx creditsSection)
const EMERALD_500 = '#10b981';
const GRAY_700 = '#374151';

import { useDriverAvatarUri } from '@/lib/avatarUpload';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { tripEarningsForDriver } from '@/lib/driverUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import * as driversService from '@/services/driversService';
import * as tripsService from '@/services/tripsService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  RefreshControl,
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

function buildOfferText(inv: driversService.DriverInviteRow): string {
  const parts: string[] = [];
  if (inv.payable_amount != null && inv.payable_amount > 0) {
    parts.push(`₹${Number(inv.payable_amount).toLocaleString('en-IN')}`);
  }
  if (inv.commission_percent != null && inv.commission_percent > 0) {
    parts.push(`${inv.commission_percent}% commission`);
  }
  if (inv.commission_per_km != null && inv.commission_per_km > 0) {
    parts.push(`₹${inv.commission_per_km}/km`);
  }
  return parts.length ? parts.join(' · ') : 'Offer on accept';
}

/** Per-org passbook stats (trips, earned, received from DB). */
export interface ConnectionPassbook {
  driverId: string;
  orgId: string;
  orgName: string;
  tripsCount: number;
  completedCount: number;
  totalEarned: number;
  totalReceived: number;
  pendingAmount: number;
}

export default function DriverRequestsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useDriverThemeColors();
  const { profile } = useAuth();
  const { avatarSeed } = useDriverAvatar();
  const { avatarUri } = useDriverAvatarUri();

  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [allTrips, setAllTrips] = useState<tripsService.TripRow[]>([]);
  const [allLedger, setAllLedger] = useState<driversService.DriverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [leavingOrgId, setLeavingOrgId] = useState<string | null>(null);
  const [leaveFleetPressedOrgId, setLeaveFleetPressedOrgId] = useState<string | null>(null);

  const fetch = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    return Promise.all([
      driversService.getDriverInvitesReceived(),
      driversService.getLinkedDriversForCurrentUser(profile.uid),
    ]).then(([invRes, driversRes]) => {
      setInvites(invRes.invites ?? []);
      const drivers = driversRes.drivers ?? [];
      setLinkedDrivers(drivers);
      const driverIds = drivers.map((d) => d.id);
      if (driverIds.length === 0) {
        setAllTrips([]);
        setAllLedger([]);
        setLoading(false);
        return Promise.resolve();
      }
      return Promise.all([
        tripsService.getTripsByDriverIds(driverIds),
        driversService.getDriverLedgerByDriverIds(driverIds),
      ]).then(([tRes, ledgerRes]) => {
        setAllTrips(tRes.trips ?? []);
        setAllLedger(ledgerRes.entries ?? []);
        setLoading(false);
      });
    }).catch(() => setLoading(false));
  }, [profile?.uid]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useFocusEffect(
    useCallback(() => {
      if (profile?.uid) fetch();
    }, [profile?.uid, fetch])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && profile?.uid) fetch();
    });
    return () => sub.remove();
  }, [profile?.uid, fetch]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetch().finally(() => setRefreshing(false));
  }, [fetch]);

  const pendingInvites = invites.filter((i) => i.status === 'pending');
  const resolvedInvites = invites.filter((i) => i.status !== 'pending');
  const acceptedInvites = resolvedInvites.filter((i) => i.status === 'accepted');

  const activeLinkedDrivers = useMemo(
    () => linkedDrivers.filter((d) => !d.left_at),
    [linkedDrivers]
  );
  const pastLinkedDrivers = useMemo(
    () =>
      linkedDrivers
        .filter((d) => !!d.left_at)
        .sort((a, b) => new Date((b.left_at ?? 0) as string).getTime() - new Date((a.left_at ?? 0) as string).getTime()),
    [linkedDrivers]
  );
  /** Show only 3 most recently left for minimal cards; "See more" goes to full history. */
  const pastLinkedDriversPreview = useMemo(() => pastLinkedDrivers.slice(0, 3), [pastLinkedDrivers]);

  /** Accepted invites where the driver is still active (not left). */
  const connectedAcceptedInvites = useMemo(
    () =>
      acceptedInvites.filter((inv) =>
        activeLinkedDrivers.some((d) => d.organization_id === inv.from_organization_id)
      ),
    [acceptedInvites, activeLinkedDrivers]
  );

  /** Map: orgId -> ConnectionPassbook for accepted invites where we have a linked driver (active or past). */
  const passbookByOrgId = useMemo(() => {
    const map: Record<string, ConnectionPassbook> = {};
    const accepted = resolvedInvites.filter((i) => i.status === 'accepted');
    for (const inv of accepted) {
      const orgId = inv.from_organization_id;
      const driver = linkedDrivers.find((d) => d.organization_id === orgId);
      if (!driver) continue;
      const driverTrips = allTrips.filter((t) => t.driver_id === driver.id);
      const driverLedger = allLedger.filter((e) => e.driver_id === driver.id);
      const completed = driverTrips.filter((t) => isCompleted(t.status));
      const totalEarned = Math.round(
        completed.reduce((sum, t) => sum + tripEarningsForDriver(t), 0)
      );
      const totalReceived = Math.round(
        driverLedger.reduce((s, e) => s + (Number(e.amount) ?? 0), 0)
      );
      map[orgId] = {
        driverId: driver.id,
        orgId,
        orgName: inv.from_org_name ?? 'Fleet',
        tripsCount: driverTrips.length,
        completedCount: completed.length,
        totalEarned,
        totalReceived,
        pendingAmount: Math.max(0, totalEarned - totalReceived),
      };
    }
    return map;
  }, [resolvedInvites, linkedDrivers, allTrips, allLedger]);

  const handleLeaveFleet = useCallback(
    async (organizationId: string) => {
      setLeavingOrgId(organizationId);
      const { error } = await driversService.leaveFleet(organizationId);
      setLeavingOrgId(null);
      if (error) {
        const msg = error.message ?? 'Could not leave fleet.';
        Alert.alert(
          'Leave fleet failed',
          /function.*does not exist|relation.*does not exist/i.test(msg)
            ? 'Server is not set up for leaving fleets yet. Please try again later or contact support.'
            : msg,
          [{ text: 'OK' }]
        );
        return;
      }
      fetch();
    },
    [fetch]
  );

  const handleLeaveFleetPress = useCallback(
    (organizationId: string, orgName: string) => {
      Alert.alert(
        'Leave fleet?',
        `You will no longer receive trip assignments from ${orgName}. Your passbook for this fleet will remain available under Passbook history. You can connect again if they send a new invite.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Leave fleet',
            style: 'destructive',
            onPress: () => handleLeaveFleet(organizationId),
          },
        ]
      );
    },
    [handleLeaveFleet]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.push('/(driver)/profile')} style={styles.avatarBtn} activeOpacity={0.8}>
            <View style={[styles.avatarCircle, { borderColor: colors.border, backgroundColor: colors.emeraldMuted }]}>
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            </View>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.brand, { color: colors.textMuted }]}>Q PILOT</Text>
            <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>Requests</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {}}
          style={[styles.notificationBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
          accessibilityLabel="Notifications"
        >
          <FontAwesome name="bell" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.creditsSection, { backgroundColor: colors.background }]}>
        <Text style={[styles.creditsTitle, { color: EMERALD_500 }]}>Requests.</Text>
        <Text style={[styles.creditsSubtitle, { color: GRAY_700 }]}>Connection invites.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.emerald} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.emerald} />
          }
        >
          {pendingInvites.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PENDING</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                {activeLinkedDrivers.length === 0
                  ? 'Accept an invitation below to connect again and receive trip assignments.'
                  : 'Accept to join and receive trip assignments.'}
              </Text>
              {pendingInvites.map((inv) => (
                <View
                  key={inv.id}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardIconWrap, { backgroundColor: colors.emeraldMuted }]}>
                      <FontAwesome name="building" size={22} color={colors.emerald} />
                    </View>
                    <View style={styles.cardHeaderText}>
                      <Text style={[styles.cardOrgName, { color: colors.text }]} numberOfLines={1}>
                        {inv.from_org_name || 'Organisation'}
                      </Text>
                      <Text style={[styles.cardOffer, { color: colors.textMuted }]} numberOfLines={2}>
                        {buildOfferText(inv)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.btnSecondary, { borderColor: colors.border }, inviteActionId === inv.id && styles.btnDisabled]}
                      onPress={async () => {
                        setInviteActionId(inv.id);
                        const { error } = await driversService.rejectDriverInvite(inv.id);
                        setInviteActionId(null);
                        if (error) {
                          Alert.alert('Decline failed', error.message ?? 'Could not decline. Try again.', [{ text: 'OK' }]);
                        }
                        fetch();
                      }}
                      disabled={!!inviteActionId}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnPrimary, { backgroundColor: colors.emerald }, inviteActionId === inv.id && styles.btnDisabled]}
                      onPress={async () => {
                        setInviteActionId(inv.id);
                        const { error } = await driversService.acceptDriverInvite(inv.id);
                        setInviteActionId(null);
                        if (error) {
                          Alert.alert('Accept failed', error.message ?? 'Could not accept. Try again.', [{ text: 'OK' }]);
                          fetch();
                          return;
                        }
                        fetch();
                      }}
                      disabled={!!inviteActionId}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.btnPrimaryText}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {connectedAcceptedInvites.length > 0 && (
            <View style={styles.section}>
              {connectedAcceptedInvites.map((inv) => {
                const passbook = passbookByOrgId[inv.from_organization_id];
                const isLeaving = leavingOrgId === inv.from_organization_id;
                return (
                  <View
                    key={inv.id}
                    style={[styles.card, styles.cardReadOnly, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={[styles.cardIconWrap, { backgroundColor: colors.emeraldMuted }]}>
                        <FontAwesome name="building" size={22} color={colors.emerald} />
                      </View>
                      <View style={styles.cardHeaderText}>
                        <Text style={[styles.cardOrgName, { color: colors.text }]} numberOfLines={1}>
                          {inv.from_org_name || 'Organisation'}
                        </Text>
                        <Text style={[styles.cardOffer, { color: colors.textMuted }]} numberOfLines={2}>
                          {buildOfferText(inv)}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: colors.emeraldMuted, borderColor: colors.emerald }]}>
                      <FontAwesome name="check-circle" size={12} color={colors.emerald} />
                      <Text style={[styles.statusBadgeText, { color: colors.text }]}>Accepted</Text>
                    </View>
                    {passbook != null && (
                      <View style={[styles.passbookBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <View style={styles.passbookRow}>
                          <Text style={[styles.passbookLabel, { color: colors.textMuted }]}>Trips</Text>
                          <Text style={[styles.passbookValue, { color: colors.text }]}>{passbook.completedCount} completed</Text>
                        </View>
                        <View style={styles.passbookRow}>
                          <Text style={[styles.passbookLabel, { color: colors.textMuted }]}>Earned</Text>
                          <Text style={[styles.passbookValue, { color: colors.emerald }]}>₹{passbook.totalEarned.toLocaleString('en-IN')}</Text>
                        </View>
                        <View style={styles.passbookRow}>
                          <Text style={[styles.passbookLabel, { color: colors.textMuted }]}>Received</Text>
                          <Text style={[styles.passbookValue, { color: colors.text }]}>₹{passbook.totalReceived.toLocaleString('en-IN')}</Text>
                        </View>
                        {passbook.pendingAmount > 0 && (
                          <View style={styles.passbookRow}>
                            <Text style={[styles.passbookLabel, { color: colors.textMuted }]}>Pending</Text>
                            <Text style={[styles.passbookValue, { color: colors.gold }]}>₹{passbook.pendingAmount.toLocaleString('en-IN')}</Text>
                          </View>
                        )}
                      </View>
                    )}
                    <View style={styles.passbookActionsColumn}>
                      <TouchableOpacity
                        style={[
                          styles.viewPassbookBtnLarge,
                          {
                            backgroundColor: colors.emerald,
                            shadowColor: Theme.textPrimaryDark,
                            shadowOffset: { width: 4, height: 4 },
                            shadowOpacity: 0.2,
                            shadowRadius: 0,
                          },
                        ]}
                        onPress={() => router.push({
                          pathname: `/(driver)/passbook/${passbook?.orgId ?? inv.from_organization_id}` as const,
                          params: { orgName: passbook?.orgName ?? inv.from_org_name ?? 'Fleet' },
                        } as Parameters<typeof router.push>[0])}
                        activeOpacity={0.9}
                      >
                        <View style={styles.viewPassbookBtnLargeLeft}>
                          <FontAwesome name="credit-card" size={22} color={colors.textOnPrimary} />
                          <Text style={[styles.viewPassbookBtnLargeText, { color: colors.textOnPrimary }]}>VIEW PASSBOOK</Text>
                        </View>
                        <View style={styles.viewPassbookBtnLargeSpacer} />
                        <FontAwesome name="chevron-right" size={20} color={colors.textOnPrimary} style={styles.viewPassbookBtnLargeArrow} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.leaveFleetLink}
                        onPress={() => handleLeaveFleetPress(inv.from_organization_id, inv.from_org_name ?? 'this organisation')}
                        onPressIn={() => setLeaveFleetPressedOrgId(inv.from_organization_id)}
                        onPressOut={() => setLeaveFleetPressedOrgId(null)}
                        disabled={!!isLeaving}
                        activeOpacity={1}
                      >
                        {isLeaving ? (
                          <ActivityIndicator size="small" color={colors.textMuted} />
                        ) : (
                          <>
                            <FontAwesome
                              name="sign-out"
                              size={16}
                              color={leaveFleetPressedOrgId === inv.from_organization_id ? Theme.destructive : colors.textMuted}
                            />
                            <Text
                              style={[
                                styles.leaveFleetLinkText,
                                { color: leaveFleetPressedOrgId === inv.from_organization_id ? Theme.destructive : colors.textMuted },
                              ]}
                            >
                              Leave this fleet
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.viewHistoryLink}
              onPress={() => router.push('/(driver)/passbook/history')}
              activeOpacity={0.8}
            >
              <Text style={[styles.viewHistoryLinkEyebrow, { color: colors.textMuted }]}>PASSBOOK HISTORY</Text>
              <Text style={[styles.viewHistoryLinkText, { color: colors.emerald }]}>View history</Text>
              <FontAwesome name="chevron-right" size={12} color={colors.emerald} />
            </TouchableOpacity>
          </View>

          {pendingInvites.length === 0 && connectedAcceptedInvites.length === 0 && pastLinkedDrivers.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.whiteMuted }]}>
                <FontAwesome name="inbox" size={40} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No connection requests</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Organisation invites will appear here. Accept to connect and receive trip assignments on the Dashboard.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.driverHeaderHorizontalPadding,
    paddingBottom: Layout.driverHeaderBottomPadding,
    borderBottomWidth: 1,
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
  avatarImage: { width: '100%', height: '100%', borderRadius: Layout.driverHeaderAvatarSize / 2 },
  brand: { fontSize: 9, fontWeight: '800', letterSpacing: 1.6, marginBottom: 1 },
  welcomeTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  creditsSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  creditsTitle: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  creditsSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1, alignSelf: 'stretch' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 8 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, marginBottom: 16, lineHeight: 18 },
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 14,
  },
  cardReadOnly: { paddingBottom: 20 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardOrgName: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  cardOffer: { fontSize: 13, lineHeight: 18 },
  cardActions: { flexDirection: 'row', gap: 12 },
  btnSecondary: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
  },
  btnSecondaryText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  btnPrimary: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  btnPrimaryText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3, color: Theme.textOnPrimary },
  btnDisabled: { opacity: 0.6 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  passbookBlock: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  passbookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  passbookLabel: { fontSize: 12, fontWeight: '600' },
  passbookValue: { fontSize: 14, fontWeight: '700' },
  passbookActions: { flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'center' },
  passbookActionsColumn: {
    marginTop: 16,
    gap: 12,
  },
  viewPassbookBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    elevation: 4,
  },
  viewPassbookBtnLargeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  viewPassbookBtnLargeSpacer: { flex: 1 },
  viewPassbookBtnLargeText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  viewPassbookBtnLargeArrow: { opacity: 0.3 },
  leaveFleetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  leaveFleetLinkText: { fontSize: 14, fontWeight: '700' },
  viewPassbookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  viewPassbookBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: Theme.textOnPrimary },
  leaveFleetBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  leaveFleetBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  historyCardMinimal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  historyCardName: { fontSize: 15, fontWeight: '700', flex: 1, minWidth: 0 },
  viewPassbookBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  seeMoreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  seeMoreText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  passbookHistoryEmpty: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  passbookHistoryEmptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  viewHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  viewHistoryBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  viewHistoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 2,
  },
  viewHistoryLinkEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginRight: 6 },
  viewHistoryLinkText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.1 },
  emptyCard: {
    width: '100%',
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, letterSpacing: 0.3 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
});
