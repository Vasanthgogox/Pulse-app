/**
 * Driver Story tab — boosted loads distributed to the driver channel.
 *
 * Lifecycle (per product spec): a story is visible while the load is still
 * open; it disappears the moment the load is assigned to someone else (server
 * rule in get_driver_reach_stories). The driver's own converted
 * recommendation stays pinned with the earning — paid into the existing
 * driver wallet (driver_ledger), one tap away.
 *
 * Employed drivers recommend to their fleet owner (earning the campaign's
 * Driver Incentive on conversion); invited drivers are nudged to join their fleet;
 * independent drivers see the load with direct-bid guidance.
 */
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import {
  getDriverFleetMemberships,
  recordDriverReachEvent,
  REACH_REFERRAL_REASON_LABELS,
  type DriverReachStoryRow,
  type ReachReferralReason,
} from '@/features/reach/services/driverReferrals.service';
import { DriverReferralEarningsCard } from '@/features/reach/components/DriverReferralEarningsCard';
import {
  resolveDriverParticipation,
  type DriverParticipation,
} from '@/features/reach/utils/driverParticipation';
import {
  useDriverReachStoriesQuery,
  useDriverRewardEarningsQuery,
  useRecommendReachCampaignMutation,
} from '@/lib/queries/useReachCampaignsQuery';
import { formatINR } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  BadgeCheck,
  Clock3,
  MapPin,
  Megaphone,
  Truck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HERO_FROM = '#022c22';
const HERO_TO = '#064e3b';

const REASON_ORDER: ReachReferralReason[] = [
  'truck_available',
  'empty_nearby',
  'good_margin',
  'reliable_customer',
  'other',
];

function referralStatusChip(story: DriverReachStoryRow): {
  label: string;
  tone: 'pending' | 'positive' | 'negative' | 'reward';
} | null {
  switch (story.referral_status) {
    case 'recommended':
      return { label: 'Waiting for fleet owner', tone: 'pending' };
    case 'approved':
      return { label: 'Approved — fleet owner bidding', tone: 'positive' };
    case 'bid_submitted':
      return { label: 'Bid placed by your fleet', tone: 'positive' };
    case 'rejected':
      return { label: 'Not taken by fleet owner', tone: 'negative' };
    case 'rewarded':
      return {
        label: `Converted · you earned ${formatINR(story.referral_reward_amount ?? 0)}`,
        tone: 'reward',
      };
    case 'expired':
      return { label: 'Campaign ended', tone: 'negative' };
    default:
      return null;
  }
}

export default function DriverStoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const userId = user?.uid ?? null;

  const storiesQ = useDriverReachStoriesQuery(userId);
  const earningsQ = useDriverRewardEarningsQuery(userId);
  const recommendMutation = useRecommendReachCampaignMutation();

  const [participation, setParticipation] = useState<DriverParticipation>({ mode: 'independent' });
  const [recommendTarget, setRecommendTarget] = useState<DriverReachStoryRow | null>(null);
  const [reason, setReason] = useState<ReachReferralReason>('truck_available');
  const [suggestedRateText, setSuggestedRateText] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getDriverFleetMemberships().then(({ memberships }) => {
      if (!cancelled) setParticipation(resolveDriverParticipation(memberships));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Driver-channel impressions — one per campaign per day, deduped server-side.
  const impressionsLogged = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const story of storiesQ.data ?? []) {
      if (story.campaign_status !== 'active') continue;
      if (impressionsLogged.current.has(story.campaign_id)) continue;
      impressionsLogged.current.add(story.campaign_id);
      void recordDriverReachEvent(story.campaign_id, 'impression');
    }
  }, [storiesQ.data]);

  const stories = storiesQ.data ?? [];

  const openRecommend = (story: DriverReachStoryRow) => {
    setReason('truck_available');
    setSuggestedRateText('');
    setNote('');
    setRecommendTarget(story);
  };

  const submitRecommend = async () => {
    if (!recommendTarget || participation.mode !== 'employed') return;
    const rate = parseFloat(suggestedRateText);
    const { error } = await recommendMutation.mutateAsync({
      campaignId: recommendTarget.campaign_id,
      fleetOrgId: participation.fleetOrgId,
      reason,
      suggestedRate: Number.isFinite(rate) && rate > 0 ? rate : undefined,
      note: note.trim() || undefined,
    });
    if (error) {
      Alert.alert("Couldn't send recommendation", error.message);
      return;
    }
    setRecommendTarget(null);
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reach.driverStories(userId) });
    }
  };

  if (storiesQ.isLoading) {
    return <CenteredLoadingView message="Loading boosted stories…" />;
  }

  const cardBg = isDark ? colors.surface : Theme.cardWhite;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[HERO_FROM, HERO_TO]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 14 }]}
      >
        <View style={styles.heroTitleRow}>
          <Megaphone size={20} color="rgba(167,243,208,0.95)" strokeWidth={2.2} />
          <Text style={styles.heroTitle}>Boosted Stories</Text>
        </View>
        <Text style={styles.heroSub}>
          {participation.mode === 'employed'
            ? 'Recommend loads to your fleet owner — earn the reward when the trip converts.'
            : participation.mode === 'invited'
              ? 'Join your fleet to recommend loads and earn rewards.'
              : 'Boosted loads from shippers across Pulse.'}
        </Text>

      </LinearGradient>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Layout.tabBarHeight + insets.bottom + 32 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={storiesQ.isRefetching}
            onRefresh={() => {
              void storiesQ.refetch();
              void earningsQ.refetch();
            }}
            tintColor={colors.emerald}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {userId && earningsQ.data ? (
          <DriverReferralEarningsCard userId={userId} earnings={earningsQ.data} />
        ) : null}

        {storiesQ.isError ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Couldn't load stories</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              {(storiesQ.error as Error)?.message ?? 'Unknown error'}
            </Text>
          </View>
        ) : stories.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
            <Megaphone size={26} color={colors.textMuted} strokeWidth={1.8} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No boosted loads right now</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              When shippers boost loads to drivers, they show up here. Loads disappear once they're
              assigned to someone else.
            </Text>
          </View>
        ) : (
          stories.map((story) => {
            const chip = referralStatusChip(story);
            const route =
              story.snapshot_origin && story.snapshot_destination
                ? `${story.snapshot_origin} → ${story.snapshot_destination}`
                : null;
            const tipVisible =
              story.driver_reward_enabled && story.reward_amount > 0 && story.reward_available;
            const canRecommend =
              participation.mode === 'employed' &&
              story.campaign_status === 'active' &&
              story.referral_status == null &&
              story.campaign_org_id !== participation.fleetOrgId;

            return (
              <View
                key={story.campaign_id}
                style={[styles.storyCard, { backgroundColor: cardBg, borderColor: colors.border }]}
              >
                <View style={styles.storyTopRow}>
                  <View style={styles.storyOrgRow}>
                    <View style={[styles.orgAvatar, { backgroundColor: isDark ? colors.surfaceElevated : Theme.surface }]}>
                      <Text style={[styles.orgAvatarText, { color: colors.emerald }]}>
                        {(story.org_name || '?').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.storyOrgTextWrap}>
                      <Text style={[styles.orgName, { color: colors.text }]} numberOfLines={1}>
                        {story.org_name}
                      </Text>
                      {route ? (
                        <View style={styles.routeRow}>
                          <MapPin size={10} color={colors.emerald} />
                          <Text style={[styles.routeText, { color: colors.textMuted }]} numberOfLines={1}>
                            {route}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {tipVisible ? (
                    <View style={styles.tipBadge}>
                      <Text style={styles.tipBadgeText}>Earn {formatINR(story.reward_amount)}</Text>
                    </View>
                  ) : (
                    <View style={styles.sponsoredBadge}>
                      <Text style={styles.sponsoredBadgeText}>Sponsored</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.specRow, { borderColor: colors.border, backgroundColor: isDark ? colors.surfaceElevated : Theme.surface }]}>
                  <View style={styles.specCell}>
                    <Truck size={12} color={colors.textMuted} />
                    <Text style={[styles.specText, { color: colors.text }]} numberOfLines={1}>
                      {story.snapshot_vehicle_type ?? 'Any vehicle'}
                    </Text>
                  </View>
                  {story.snapshot_material ? (
                    <View style={styles.specCell}>
                      <Text style={[styles.specText, { color: colors.text }]} numberOfLines={1}>
                        {story.snapshot_material}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {chip ? (
                  <View
                    style={[
                      styles.statusChip,
                      chip.tone === 'pending' && styles.statusChipPending,
                      chip.tone === 'positive' && styles.statusChipPositive,
                      chip.tone === 'negative' && styles.statusChipNegative,
                      chip.tone === 'reward' && styles.statusChipReward,
                    ]}
                  >
                    {chip.tone === 'reward' ? (
                      <BadgeCheck size={12} color={Theme.success} />
                    ) : chip.tone === 'negative' ? (
                      <XCircle size={12} color={Theme.negative} />
                    ) : (
                      <Clock3 size={12} color={chip.tone === 'positive' ? Theme.success : Theme.accentGold} />
                    )}
                    <Text
                      style={[
                        styles.statusChipText,
                        chip.tone === 'reward' || chip.tone === 'positive'
                          ? styles.statusChipTextPositive
                          : chip.tone === 'negative'
                            ? styles.statusChipTextNegative
                            : styles.statusChipTextPending,
                      ]}
                      numberOfLines={1}
                    >
                      {chip.label}
                    </Text>
                  </View>
                ) : null}

                {story.referral_status === 'rewarded' ? (
                  <TouchableOpacity
                    style={styles.walletBtn}
                    activeOpacity={0.88}
                    onPress={() => router.push('/(driver)/wallet')}
                  >
                    <Wallet size={13} color={Theme.textOnPrimary} />
                    <Text style={styles.walletBtnText}>See earning in wallet</Text>
                  </TouchableOpacity>
                ) : canRecommend ? (
                  <TouchableOpacity
                    style={styles.recommendBtn}
                    activeOpacity={0.88}
                    onPress={() => openRecommend(story)}
                  >
                    <Text style={styles.recommendBtnText}>Recommend to Fleet Owner</Text>
                    {tipVisible ? (
                      <Text style={styles.recommendBtnHint}>Earn {formatINR(story.reward_amount)} on conversion</Text>
                    ) : null}
                  </TouchableOpacity>
                ) : participation.mode === 'invited' && story.referral_status == null ? (
                  <View style={[styles.infoPill, { borderColor: colors.border }]}>
                    <Text style={[styles.infoPillText, { color: colors.textMuted }]}>
                      Join your fleet to participate
                    </Text>
                  </View>
                ) : participation.mode === 'independent' && story.referral_status == null ? (
                  <View style={[styles.infoPill, { borderColor: colors.border }]}>
                    <Text style={[styles.infoPillText, { color: colors.textMuted }]}>
                      Direct bidding runs through your organization's Pulse account
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Recommend sheet ── */}
      <Modal
        visible={recommendTarget != null}
        transparent
        animationType="slide"
        onRequestClose={() => setRecommendTarget(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRecommendTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: cardBg, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Recommend this load</Text>
              <Pressable onPress={() => setRecommendTarget(null)} hitSlop={10}>
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            {recommendTarget ? (
              <Text style={[styles.sheetStoryLine, { color: colors.textMuted }]} numberOfLines={1}>
                {recommendTarget.snapshot_origin} → {recommendTarget.snapshot_destination}
                {recommendTarget.driver_reward_enabled && recommendTarget.reward_amount > 0
                  ? ` · earn ${formatINR(recommendTarget.reward_amount)} on conversion`
                  : ''}
              </Text>
            ) : null}

            <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>WHY THIS LOAD?</Text>
            <View style={styles.reasonWrap}>
              {REASON_ORDER.map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.reasonChip,
                    { borderColor: colors.border },
                    reason === r && styles.reasonChipActive,
                  ]}
                  onPress={() => setReason(r)}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      { color: reason === r ? Theme.textOnPrimary : colors.text },
                    ]}
                  >
                    {REACH_REFERRAL_REASON_LABELS[r]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>SUGGESTED RATE (OPTIONAL)</Text>
            <TextInput
              style={[styles.sheetInput, { borderColor: colors.border, color: colors.text }]}
              value={suggestedRateText}
              onChangeText={setSuggestedRateText}
              keyboardType="number-pad"
              placeholder="e.g. 18500"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.sheetLabel, { color: colors.textMuted }]}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={[styles.sheetInput, styles.sheetNoteInput, { borderColor: colors.border, color: colors.text }]}
              value={note}
              onChangeText={setNote}
              placeholder="Anything your fleet owner should know"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <TouchableOpacity
              style={[styles.sheetSubmit, recommendMutation.isPending && styles.sheetSubmitDisabled]}
              disabled={recommendMutation.isPending}
              activeOpacity={0.88}
              onPress={() => void submitRecommend()}
            >
              {recommendMutation.isPending ? (
                <ActivityIndicator size="small" color={Theme.textOnPrimary} />
              ) : (
                <Text style={styles.sheetSubmitText}>Send to Fleet Owner</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 8,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { fontSize: 19, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 12, fontWeight: '500', color: 'rgba(209,250,229,0.85)', lineHeight: 17 },
  list: { flex: 1 },
  listContent: { padding: Layout.screenPaddingHorizontal, gap: 12 },

  emptyCard: {
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800' },
  emptyBody: { fontSize: 12, fontWeight: '500', textAlign: 'center', lineHeight: 17 },

  storyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  storyTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  storyOrgRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  orgAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgAvatarText: { fontSize: 11, fontWeight: '900' },
  storyOrgTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  orgName: { fontSize: 13, fontWeight: '800' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  routeText: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  tipBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    flexShrink: 0,
  },
  tipBadgeText: { fontSize: 9, fontWeight: '900', color: Theme.accentGold, textTransform: 'uppercase' },
  sponsoredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    flexShrink: 0,
  },
  sponsoredBadgeText: { fontSize: 8, fontWeight: '800', color: Theme.accentGold, textTransform: 'uppercase' },

  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  specCell: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, minWidth: 0 },
  specText: { fontSize: 11, fontWeight: '700' },

  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipPending: { backgroundColor: Theme.accentGoldMuted, borderColor: Theme.accentGoldBorder },
  statusChipPositive: { backgroundColor: Theme.positiveMuted, borderColor: Theme.positiveMuted },
  statusChipNegative: { backgroundColor: Theme.negativeMuted, borderColor: Theme.negativeMuted },
  statusChipReward: { backgroundColor: Theme.positiveMuted, borderColor: Theme.positiveMuted },
  statusChipText: { fontSize: 10, fontWeight: '800' },
  statusChipTextPositive: { color: Theme.success },
  statusChipTextNegative: { color: Theme.negative },
  statusChipTextPending: { color: Theme.accentGoldPressed },

  recommendBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 8,
  },
  recommendBtnText: { fontSize: 12, fontWeight: '800', color: Theme.buttonPrimaryText },
  recommendBtnHint: { fontSize: 9, fontWeight: '700', color: Theme.buttonPrimaryText, opacity: 0.8 },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: Theme.success,
  },
  walletBtnText: { fontSize: 12, fontWeight: '800', color: Theme.textOnPrimary },
  infoPill: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  infoPillText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Theme.overlayBackdrop },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    alignSelf: 'center',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 15, fontWeight: '800' },
  sheetStoryLine: { fontSize: 11, fontWeight: '600' },
  sheetLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7, marginTop: 4 },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  reasonChipActive: { backgroundColor: Theme.buttonPrimary, borderColor: Theme.buttonPrimaryBorder },
  reasonChipText: { fontSize: 11, fontWeight: '700' },
  sheetInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  sheetNoteInput: { minHeight: 64, textAlignVertical: 'top' },
  sheetSubmit: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    marginTop: 6,
  },
  sheetSubmitDisabled: { opacity: 0.6 },
  sheetSubmitText: { fontSize: 13, fontWeight: '800', color: Theme.buttonPrimaryText },
});
