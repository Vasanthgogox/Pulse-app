/**
 * Passbook history — full list of previously worked fleets (left_at set).
 * Accessible only via "View history" (e.g. from Requests). When no organisations:
 * shows "No History Found" empty state with Join Organization CTA and How it works.
 */
// Wallet-style hero text (match wallet.tsx creditsSection)
const EMERALD_500 = '#10b981';
const GRAY_700 = '#374151';

import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import * as driversService from '@/services/driversService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeBack } from '@/lib/useSafeBack';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PassbookHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const safeBack = useSafeBack('/(driver)');
  const colors = useDriverThemeColors();
  const { profile } = useAuth();

  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
    ])
      .then(([driversRes, invitesRes]) => {
        setLinkedDrivers(driversRes.drivers ?? []);
        setInvites(invitesRes.invites ?? []);
      })
      .finally(() => setLoading(false));
  }, [profile?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const historyDrivers = useMemo(
    () =>
      linkedDrivers
        .filter((d) => !!d.left_at)
        .sort((a, b) => new Date(b.left_at as string).getTime() - new Date(a.left_at as string).getTime()),
    [linkedDrivers]
  );

  const getOrgName = useCallback(
    (organizationId: string) => {
      const invite = invites.find((i) => i.from_organization_id === organizationId);
      return invite?.from_org_name && invite.from_org_name.trim() !== '' ? invite.from_org_name : 'Fleet';
    },
    [invites]
  );

  if (loading) {
    return (
      <View
        style={[
          styles.loadingWrap,
          { paddingTop: insets.top, backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.emerald} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading…
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingBottom: Layout.driverHeaderBottomPadding,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={safeBack}
          style={styles.backBtn}
          hitSlop={12}
        >
          <FontAwesome name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Passbook history
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            Previously worked fleets · tap to view passbook
          </Text>
        </View>
      </View>

      <View style={[styles.creditsSection, { backgroundColor: colors.background }]}>
        <Text style={[styles.creditsTitle, { color: EMERALD_500 }]}>History.</Text>
        <Text style={[styles.creditsSubtitle, { color: GRAY_700 }]}>Previously worked fleets · tap to view passbook.</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {historyDrivers.length === 0 ? (
          <View style={styles.noHistoryRoot}>
            <View
              style={[
                styles.noHistoryIconWrap,
                {
                  backgroundColor: colors.surface,
                  shadowColor: Theme.shadow,
                  ...(Platform.OS === 'ios'
                    ? { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }
                    : { elevation: 6 }),
                },
              ]}
            >
              <FontAwesome name="book" size={56} color={colors.emerald} />
              <View
                style={[
                  styles.noHistoryIconBadge,
                  { backgroundColor: colors.emerald },
                ]}
              >
                <FontAwesome name="plus" size={14} color={Theme.textOnPrimary} />
              </View>
            </View>
            <Text style={[styles.noHistoryTitle, { color: colors.text }]}>
              No History Found
            </Text>
            <Text style={[styles.noHistoryBody, { color: colors.textMuted }]}>
              You aren't connected to any fleets yet. Join an organization to start tracking your trips and earnings in your passbook.
            </Text>
            <TouchableOpacity
              style={[styles.joinOrgBtn, { backgroundColor: colors.emerald }]}
              onPress={() => router.push('/(driver)')}
              activeOpacity={0.8}
            >
              <FontAwesome name="plus" size={20} color={Theme.textOnPrimary} />
              <Text style={[styles.joinOrgBtnText, { color: Theme.textOnPrimary }]}>
                Join Organization
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.howItWorksWrap}
              onPress={() =>
                Alert.alert(
                  'How it works',
                  'Accept an invitation from an organization on the Dashboard screen to connect. Once connected, you\'ll receive trips and your earnings will be tracked in your passbook. When you leave a fleet, it appears here in history.'
                )
              }
              activeOpacity={0.8}
            >
              <FontAwesome name="info-circle" size={16} color={colors.textMuted} />
              <Text style={[styles.howItWorksText, { color: colors.textMuted }]}>
                How it works
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            {historyDrivers.map((d) => {
              const orgId = d.organization_id;
              const orgName = getOrgName(orgId);
              return (
                <View
                  key={d.id}
                  style={[
                    styles.historyCardMinimal,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.historyCardName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {orgName}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.viewPassbookBtnSmall,
                      { backgroundColor: colors.emerald },
                    ]}
                    onPress={() =>
                      router.push({
                        pathname: `/(driver)/passbook/${orgId}` as const,
                        params: { orgName, from: 'history' },
                      } as Parameters<typeof router.push>[0])
                    }
                    activeOpacity={0.8}
                  >
                    <FontAwesome
                      name="book"
                      size={12}
                      color={Theme.textOnPrimary}
                    />
                    <Text style={styles.viewPassbookBtnText}>
                      View passbook
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
  section: { marginBottom: 24 },
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
  viewPassbookBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Theme.textOnPrimary,
  },
  noHistoryRoot: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  noHistoryIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    position: 'relative',
  },
  noHistoryIconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noHistoryTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  noHistoryBody: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  joinOrgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    width: '100%',
    maxWidth: 320,
  },
  joinOrgBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  howItWorksWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
  },
  howItWorksText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
