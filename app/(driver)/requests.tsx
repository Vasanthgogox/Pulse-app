import { useDriverAvatarUri } from '@/lib/avatarUpload';
import { DriverInviteCard } from '@/components/driver/DriverInviteCard';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import * as driversService from '@/services/driversService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildOfferText } from '@/lib/driverUtils';

/**
 * Driver Requests page — connection invites.
 * PENDING: accept/decline.
 */
// Wallet-style hero text (match wallet.tsx creditsSection)
const EMERALD_500 = '#10b981';
const GRAY_700 = '#374151';

export default function DriverRequestsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const { profile } = useAuth();
  const { avatarUri } = useDriverAvatarUri();

  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);

  const fetch = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return Promise.resolve();
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    return Promise.all([
      driversService.getDriverInvitesReceived(),
      driversService.getLinkedDriversForCurrentUser(profile.uid),
    ]).then(([invRes, driversRes]) => {
      setInvites(invRes.invites ?? []);
      const drivers = driversRes.drivers ?? [];
      setLinkedDrivers(drivers);
      setLoading(false);
      initialLoadDoneRef.current = true;
      isRefreshingRef.current = false;
      setRefreshing(false);
    }).catch(() => {
      setLoading(false);
      initialLoadDoneRef.current = true;
      isRefreshingRef.current = false;
      setRefreshing(false);
    });
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

  const activeLinkedDrivers = useMemo(
    () => linkedDrivers.filter((d) => !d.left_at),
    [linkedDrivers]
  );

  const styles = useMemo(() => StyleSheet.create({
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
      color: EMERALD_500,
    },
    creditsSubtitle: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginTop: 8,
      textTransform: 'uppercase',
      color: GRAY_700,
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
      borderRadius: 18,
      borderWidth: 1,
      padding: 18,
      marginBottom: 14,
    },
    cardReadOnly: { paddingBottom: 16 },
    premiumHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    premiumHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    premiumInfoBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    cardIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardHeaderText: { flex: 1, minWidth: 0 },
    cardOrgName: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
    cardOffer: { fontSize: 10, lineHeight: 16, fontWeight: '500' },
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
    btnPrimaryText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
    btnDisabled: { opacity: 0.6 },
    statusBadge: {
      flexDirection: 'column',
      alignItems: 'center',
      position: 'absolute',
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 8,
    },
    statusBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2, marginTop: 2 },
    quickStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      marginBottom: 14,
      paddingHorizontal: 2,
    },
    quickStatCol: { flex: 1, minWidth: 0 },
    quickStatLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    quickStatValue: { fontSize: 13, fontWeight: '800', marginTop: 4 },
    quickDivider: { width: 1, height: 28, marginHorizontal: 8 },
    insightCard: {
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
    },
    insightHeader: {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    insightIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    insightLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textAlign: 'center',
    },
    insightAmount: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 2,
    },
    insightProgressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    insightProgressLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    insightProgressValue: { fontSize: 11, fontWeight: '700' },
    insightProgressTrack: {
      width: '100%',
      height: 8,
      borderRadius: 99,
      backgroundColor: 'rgba(255,255,255,0.08)',
      overflow: 'hidden',
    },
    insightProgressFill: { height: '100%', borderRadius: 99 },
    insightFooter: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    insightFooterText: { color: colors.textMuted, fontSize: 10, fontWeight: '600', flex: 1 },
    insightFooterAmount: { color: colors.text, fontWeight: '800' },
    metricsSplitRow: { flexDirection: 'row', gap: 10 },
    metricTile: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
    },
    metricTileHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    metricTileLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    metricTileValue: { fontSize: 18, fontWeight: '800' },
    leaveFleetLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    leaveFleetLinkText: { fontSize: 13, fontWeight: '700' },
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
    cardOrgAvatar: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardOrgAvatarText: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
  }), [colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.push('/(driver)/profile')} style={styles.avatarBtn} activeOpacity={0.8}>
            <View style={[styles.avatarCircle, { borderColor: colors.border, backgroundColor: colors.emeraldMuted }]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <FontAwesome name="user" size={14} color={colors.text} />
              )}
            </View>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.brand, { color: colors.textMuted }]}>Q PILOT</Text>
            <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>
              Requests
            </Text>
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
        <Text style={[styles.creditsTitle, { color: EMERALD_500, textTransform: 'uppercase' }]}>
          Requests.
        </Text>
        <Text style={[styles.creditsSubtitle, { color: GRAY_700 }]}>
          Connection invites.
        </Text>
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
                <DriverInviteCard
                  key={inv.id}
                  invite={inv}
                  colors={colors}
                  offerText={buildOfferText(inv)}
                  busy={inviteActionId === inv.id}
                  fallbackAvatarUri={avatarUri}
                  onIgnore={() => {
                    const title = "Decline invitation?";
                    const msg = "You will reject this fleet connection invitation.";
                    
                    if (Platform.OS === "web" && typeof window !== "undefined") {
                      const confirmed = window.confirm(`${title}\n\n${msg}`);
                      if (confirmed) {
                        (async () => {
                          setInviteActionId(inv.id);
                          const { error } = await driversService.rejectDriverInvite(inv.id);
                          setInviteActionId(null);
                          if (error) {
                            Alert.alert('Decline failed', error.message ?? 'Could not decline. Try again.', [{ text: 'OK' }]);
                          }
                          fetch();
                        })();
                      }
                      return;
                    }

                    Alert.alert(
                      title,
                      msg,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Decline",
                          style: "destructive",
                          onPress: async () => {
                            setInviteActionId(inv.id);
                            const { error } = await driversService.rejectDriverInvite(inv.id);
                            setInviteActionId(null);
                            if (error) {
                              Alert.alert('Decline failed', error.message ?? 'Could not decline. Try again.', [{ text: 'OK' }]);
                            }
                            fetch();
                          }
                        }
                      ]
                    );
                  }}
                  onAccept={async () => {
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
                />
              ))}
            </View>
          )}

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

