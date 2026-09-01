/**
 * Driver Story / Loads tab — boosted loads for getting new work.
 *
 * Layout: pulse-story reel on top (Mine / Fleet availability + Boosted LOADs),
 * then pickup/drop filters, then recommendation cards ranked by vehicle-type
 * relevance for fleet owners.
 *
 * Lifecycle: show open / quoted / counter opportunities only. Awarded and
 * completed jobs are excluded here (History / trip surfaces). Deduped by
 * post_id so reboosts and RPC joins cannot double the same load.
 */
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { DriverBrandMark } from '@/components/driver/DriverBrandMark';
import { DriverSelfAvatar } from '@/components/driver/DriverSelfAvatar';
import { PartyAvatar } from '@/components/PartyAvatar';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import {
  formatDirectBidError,
  getDriverFleetMemberships,
  recordDriverReachEvent,
  REACH_REFERRAL_REASON_LABELS,
  type DriverReachStoryRow,
  type ReachReferralReason,
} from '@/features/reach/services/driverReferrals.service';
import { DriverPulseStoryViewer } from '@/features/reach/screens/DriverPulseStoryViewer';
import { DriverCapacityStoryViewer } from '@/features/reach/screens/DriverCapacityStoryViewer';
import { DriverDirectBidSheet } from '@/features/reach/components/DriverDirectBidSheet';
import { DriverPulseStoryReel } from '@/features/reach/components/DriverPulseStoryReel';
import { DriverReferralEarningsCard } from '@/features/reach/components/DriverReferralEarningsCard';
import { ShipperCounterHighlight } from '@/features/reach/components/ShipperCounterHighlight';
import {
  deactivateFleetOwnerCapacityStory,
  type FleetOwnerCapacityStory,
} from '@/features/driver/services/fleetOwnerCapacityStory.service';
import {
  bidStatusFilterLabel,
  compareLoadOpportunities,
  dedupeDriverReachStories,
  directBidUiBucket,
  matchesBidStatusFilter,
  type BidStatusFilter,
} from '@/features/reach/utils/directBidLifecycle';
import {
  driverStoryCta,
  resolveDriverParticipation,
  type DriverParticipation,
} from '@/features/reach/utils/driverParticipation';
import {
  useDriverReachStoriesQuery,
  useDriverRewardEarningsQuery,
  useRecommendReachCampaignMutation,
  useSubmitDriverDirectBidMutation,
} from '@/lib/queries/useReachCampaignsQuery';
import { useDriverFleetOwnerQuery } from '@/lib/queries/useDriverFleetOwnerQuery';
import { useMyCapacityStoriesQuery } from '@/lib/queries/useMyCapacityStoriesQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { ROUTES } from '@/lib/routes';
import { formatINR, positiveMoneyOrNull } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { splitLocationParts } from '@/features/network/utils/storyDisplay';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  MapPin,
  Megaphone,
  Package,
  Truck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const REASON_ORDER: ReachReferralReason[] = [
  'truck_available',
  'empty_nearby',
  'good_margin',
  'reliable_customer',
  'other',
];

function cityOf(value: string | null | undefined): string {
  const city = splitLocationParts(value).city;
  return !city || city === '—' ? '' : city;
}

function normalizeVehicleType(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function vehicleTypesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeVehicleType(a);
  const nb = normalizeVehicleType(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

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

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Presentation-only content adapter — the same Reach reel/filters/cards/
 * modals rendered by `DriverStoriesScreen` below, minus its header, so the
 * unified Market "Find Work" surface can embed it unchanged. No lifecycle,
 * sorting, or query logic differs from the standalone route.
 */
export function StoriesContent({
  footer,
  onRefreshExtra,
}: {
  footer?: React.ReactNode;
  onRefreshExtra?: () => void;
} = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const { avatarUri } = useDriverAvatarUri();
  const { isFleetOwner } = useDriverFleetOwnerQuery(userId);
  const capacityQ = useMyCapacityStoriesQuery(userId);
  const vehiclesQ = useOwnerVehiclesQuery(userId);

  const storiesQ = useDriverReachStoriesQuery(userId);
  const earningsQ = useDriverRewardEarningsQuery(userId);
  const recommendMutation = useRecommendReachCampaignMutation();
  const bidMutation = useSubmitDriverDirectBidMutation();

  const [participation, setParticipation] = useState<DriverParticipation>({ mode: 'independent' });
  const [recommendTarget, setRecommendTarget] = useState<DriverReachStoryRow | null>(null);
  const [reason, setReason] = useState<ReachReferralReason>('truck_available');
  const [suggestedRateText, setSuggestedRateText] = useState('');
  const [note, setNote] = useState('');
  const [bidTarget, setBidTarget] = useState<DriverReachStoryRow | null>(null);
  const [viewerStartPostId, setViewerStartPostId] = useState<string | null>(null);
  const [capacityViewer, setCapacityViewer] = useState<FleetOwnerCapacityStory | null>(null);
  const [pickupFilter, setPickupFilter] = useState<string | null>(null);
  const [dropFilter, setDropFilter] = useState<string | null>(null);
  const [source, setSource] = useState<'all' | 'reach' | 'market'>('all');
  const [bidStatusFilter, setBidStatusFilter] = useState<BidStatusFilter>('all');

  useEffect(() => {
    let cancelled = false;
    void getDriverFleetMemberships().then(({ memberships }) => {
      if (!cancelled) setParticipation(resolveDriverParticipation(memberships));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const impressionsLogged = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const story of storiesQ.data ?? []) {
      if (story.campaign_status !== 'active') continue;
      if (impressionsLogged.current.has(story.campaign_id)) continue;
      impressionsLogged.current.add(story.campaign_id);
      void recordDriverReachEvent(story.campaign_id, 'impression');
    }
  }, [storiesQ.data]);

  const stories = useMemo(
    () => dedupeDriverReachStories(storiesQ.data ?? []),
    [storiesQ.data],
  );

  const fleetVehicleTypes = useMemo(() => {
    if (!isFleetOwner) return [] as string[];
    return vehiclesQ.vehicles
      .map((v) => v.vehicle_type)
      .filter((t): t is string => !!t && t.trim().length > 0);
  }, [isFleetOwner, vehiclesQ.vehicles]);

  const pickupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stories) {
      const c = cityOf(s.snapshot_origin);
      if (c) set.add(c);
    }
    for (const s of capacityQ.activeStories ?? []) {
      const c = cityOf(s.origin);
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [stories, capacityQ.activeStories]);

  const dropOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stories) {
      const c = cityOf(s.snapshot_destination);
      if (c) set.add(c);
    }
    for (const s of capacityQ.activeStories ?? []) {
      const c = cityOf(s.destination);
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [stories, capacityQ.activeStories]);

  const recommendedStories = useMemo(() => {
    const filtered = stories.filter((s) => {
      if (pickupFilter) {
        const origin = cityOf(s.snapshot_origin);
        if (origin.toLowerCase() !== pickupFilter.toLowerCase()) return false;
      }
      if (dropFilter) {
        const dest = cityOf(s.snapshot_destination);
        if (dest.toLowerCase() !== dropFilter.toLowerCase()) return false;
      }
      if (!matchesBidStatusFilter(s, bidStatusFilter)) return false;
      return true;
    });

    const scored = filtered.map((s) => {
      const matchesFleet =
        fleetVehicleTypes.length > 0 &&
        fleetVehicleTypes.some((vt) => vehicleTypesMatch(vt, s.snapshot_vehicle_type));
      const bucket = directBidUiBucket(s);
      return { story: s, matchesFleet, bucket };
    });

    scored.sort(compareLoadOpportunities);

    return scored;
  }, [stories, pickupFilter, dropFilter, bidStatusFilter, fleetVehicleTypes]);

  /**
   * Action Needed — counter/quoted items needing a driver response, independent
   * of whatever pickup/drop/status filters are applied to the discovery list
   * below. Same bucket classification and ranking as `recommendedStories`
   * (directBidUiBucket / compareLoadOpportunities), just unfiltered and
   * narrowed to the two actionable buckets.
   */
  const actionNeededItems = useMemo(() => {
    const scored = stories.map((s) => {
      const matchesFleet =
        fleetVehicleTypes.length > 0 &&
        fleetVehicleTypes.some((vt) => vehicleTypesMatch(vt, s.snapshot_vehicle_type));
      const bucket = directBidUiBucket(s);
      return { story: s, matchesFleet, bucket };
    });
    const actionable = scored.filter(({ bucket }) => bucket === 'counter' || bucket === 'quoted');
    actionable.sort(compareLoadOpportunities);
    return actionable;
  }, [stories, fleetVehicleTypes]);

  /** Filtered loads for the pulse reel (same route/status filters as cards). */
  const filteredReelLoads = useMemo(
    () => recommendedStories.map((row) => row.story),
    [recommendedStories],
  );

  const filteredCapacityStories = useMemo(() => {
    const list = capacityQ.activeStories ?? [];
    if (!pickupFilter && !dropFilter) return list;
    return list.filter((s) => {
      if (pickupFilter) {
        const origin = cityOf(s.origin);
        if (origin.toLowerCase() !== pickupFilter.toLowerCase()) return false;
      }
      if (dropFilter) {
        const dest = cityOf(s.destination);
        if (dest.toLowerCase() !== dropFilter.toLowerCase()) return false;
      }
      return true;
    });
  }, [capacityQ.activeStories, pickupFilter, dropFilter]);

  const openRecommend = (story: DriverReachStoryRow) => {
    setReason('truck_available');
    const target = positiveMoneyOrNull(story.snapshot_rate_offer);
    setSuggestedRateText(target != null ? String(Math.round(target)) : '');
    setNote('');
    setRecommendTarget(story);
  };

  const openBid = (story: DriverReachStoryRow) => {
    setBidTarget(story);
  };

  const openStoryViewer = (story: DriverReachStoryRow) => {
    setViewerStartPostId(story.post_id);
  };

  const openCapacityViewer = (story: FleetOwnerCapacityStory) => {
    setCapacityViewer(story);
  };

  const openCapacityComposer = (vehicleId?: string | null) => {
    router.push(
      ROUTES.driverCapacityStory(vehicleId ?? undefined) as Parameters<typeof router.push>[0],
    );
  };

  const takeCapacityOffline = (story: FleetOwnerCapacityStory) => {
    Alert.alert('Take offline?', 'Hide this capacity Story from Business discovery.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take offline',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const { error } = await deactivateFleetOwnerCapacityStory(story.id);
            if (error) {
              Alert.alert('Could not update', error.message);
              return;
            }
            setCapacityViewer(null);
            capacityQ.invalidate();
          })();
        },
      },
    ]);
  };

  const resolveViewerFooterAction = useCallback(
    (viewerStory: DriverReachStoryRow) => {
      if (viewerStory.referral_status === 'rewarded') {
        return {
          label: 'See earning in wallet',
          onPress: () => {
            setViewerStartPostId(null);
            router.push('/(driver)/wallet');
          },
        };
      }
      const canRecommend =
        participation.mode === 'employed' &&
        viewerStory.campaign_status === 'active' &&
        viewerStory.referral_status == null &&
        viewerStory.campaign_org_id !== participation.fleetOrgId;
      if (canRecommend) {
        const tip =
          viewerStory.driver_reward_enabled &&
          viewerStory.reward_amount > 0 &&
          viewerStory.reward_available;
        return {
          label: 'Recommend to Fleet Owner',
          hint: tip ? `Earn ${formatINR(viewerStory.reward_amount)} on conversion` : undefined,
          onPress: () => {
            setViewerStartPostId(null);
            openRecommend(viewerStory);
          },
        };
      }
      if (participation.mode === 'independent' && viewerStory.direct_bid_status !== 'accepted') {
        const cta = driverStoryCta(participation, viewerStory.reward_amount);
        const hasBid = viewerStory.direct_bid_status === 'pending';
        const counter = positiveMoneyOrNull(viewerStory.direct_bid_counter_amount);
        return {
          label: hasBid
            ? counter != null
              ? `Revise quote · counter ${formatINR(counter)}`
              : `Quoted bid · ${formatINR(viewerStory.direct_bid_amount ?? 0)}`
            : cta.label,
          hint: hasBid
            ? counter != null
              ? 'Shipper sent a counter — tap to revise'
              : 'Tap to update your quoted bid'
            : cta.badge ?? undefined,
          onPress: () => {
            setViewerStartPostId(null);
            openBid(viewerStory);
          },
        };
      }
      return null;
    },
    [participation, router],
  );

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

  const submitBid = async (amount: number, note: string) => {
    if (!bidTarget) return;
    const { error } = await bidMutation.mutateAsync({
      postId: bidTarget.post_id,
      amount,
      note: note || undefined,
    });
    if (error) {
      Alert.alert("Couldn't submit bid", formatDirectBidError(error.message));
      return;
    }
    setBidTarget(null);
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reach.driverStories(userId) });
    }
  };

  if (storiesQ.isLoading) {
    return <CenteredLoadingView message="Loading boosted stories…" />;
  }

  const cardBg = isDark ? colors.surface : Theme.cardWhite;
  const hasActiveFilters =
    pickupFilter != null || dropFilter != null || bidStatusFilter !== 'all';
  const BID_STATUS_FILTERS: BidStatusFilter[] = ['all', 'open', 'quoted', 'counter'];

  return (
    <>
      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: Layout.tabBarHeight + insets.bottom + 32,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={
              storiesQ.isRefetching || capacityQ.isRefetching || vehiclesQ.isRefetching
            }
            onRefresh={() => {
              void storiesQ.refetch();
              void earningsQ.refetch();
              void capacityQ.refetch();
              void vehiclesQ.refetch();
              onRefreshExtra?.();
            }}
            tintColor={Theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {actionNeededItems.length > 0 ? (
          <View style={styles.actionNeededWrap}>
            <Text style={[styles.actionNeededHeader, { color: colors.textMuted }]}>
              ACTION NEEDED · {actionNeededItems.length}
            </Text>
            {actionNeededItems.map(({ story, bucket }) => {
              const counterRate = positiveMoneyOrNull(story.direct_bid_counter_amount);
              const quotedAmount = positiveMoneyOrNull(story.direct_bid_amount);
              return (
                <Pressable
                  key={story.post_id}
                  onPress={() => openBid(story)}
                  style={[styles.actionCard, { backgroundColor: cardBg }]}
                >
                  <Text style={styles.actionCardKicker}>
                    {bucket === 'counter' ? 'Counter offer received' : 'Your bid is pending'}
                  </Text>
                  <Text style={[styles.actionCardOrg, { color: colors.text }]} numberOfLines={1}>
                    {story.org_name}
                  </Text>
                  {bucket === 'counter' && counterRate != null ? (
                    <ShipperCounterHighlight
                      counterAmountInr={counterRate}
                      yourQuoteInr={quotedAmount}
                    />
                  ) : quotedAmount != null ? (
                    <Text style={[styles.actionCardAmount, { color: colors.text }]}>
                      {formatINR(quotedAmount)}
                    </Text>
                  ) : null}
                  <View style={styles.actionCardCta}>
                    <Text style={styles.actionCardCtaText}>
                      {bucket === 'counter' ? 'Review counter' : 'View your bid'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.sourceRow, { borderColor: colors.border }]}>
          {(
            [
              { id: 'all' as const, label: 'All Work' },
              { id: 'reach' as const, label: 'Reach' },
              { id: 'market' as const, label: 'Market' },
            ] as const
          ).map((opt) => {
            const on = source === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSource(opt.id)}
                style={[
                  styles.sourceChip,
                  on && { backgroundColor: isDark ? colors.surfaceElevated : Theme.cardWhite, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.sourceChipText, { color: on ? colors.text : colors.textMuted }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {source !== 'market' ? (
          <>
            <DriverPulseStoryReel
              isFleetOwner={isFleetOwner}
              avatarUri={avatarUri}
              displayName={user?.displayName}
              capacityStories={filteredCapacityStories}
              loads={filteredReelLoads}
              onAddCapacity={() => openCapacityComposer()}
              onPressCapacity={openCapacityViewer}
              onPressLoad={openStoryViewer}
            />

            {userId && earningsQ.data ? (
              <View style={styles.earningsWrap}>
                <DriverReferralEarningsCard userId={userId} earnings={earningsQ.data} />
              </View>
            ) : null}

            <View style={styles.sectionPad}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Reach</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              {fleetVehicleTypes.length > 0
                ? 'Recommended for your fleet — bid on open loads. Awarded jobs stay in History.'
                : 'Find work for your vehicle — bid on open loads. Awarded jobs stay in History.'}
            </Text>
          </View>

          {stories.length > 0 || (capacityQ.activeStories?.length ?? 0) > 0 ? (
            <View style={styles.filtersBlock}>
              <View style={styles.filterRow}>
                <MapPin size={11} color={Theme.textMuted} strokeWidth={2.2} />
                <Text style={styles.filterLabel}>Pickup</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterChips}
                >
                  <FilterChip
                    label="Any"
                    selected={pickupFilter == null}
                    onPress={() => setPickupFilter(null)}
                  />
                  {pickupOptions.map((city) => (
                    <FilterChip
                      key={`p-${city}`}
                      label={city}
                      selected={pickupFilter === city}
                      onPress={() => setPickupFilter(city)}
                    />
                  ))}
                </ScrollView>
              </View>
              <View style={styles.filterRow}>
                <MapPin size={11} color={Theme.textMuted} strokeWidth={2.2} />
                <Text style={styles.filterLabel}>Drop</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterChips}
                >
                  <FilterChip
                    label="Any"
                    selected={dropFilter == null}
                    onPress={() => setDropFilter(null)}
                  />
                  {dropOptions.map((city) => (
                    <FilterChip
                      key={`d-${city}`}
                      label={city}
                      selected={dropFilter === city}
                      onPress={() => setDropFilter(city)}
                    />
                  ))}
                </ScrollView>
              </View>
              <View style={styles.filterRow}>
                <BadgeCheck size={11} color={Theme.textMuted} strokeWidth={2.2} />
                <Text style={styles.filterLabel}>Status</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterChips}
                >
                  {BID_STATUS_FILTERS.map((f) => (
                    <FilterChip
                      key={f}
                      label={bidStatusFilterLabel(f)}
                      selected={bidStatusFilter === f}
                      onPress={() => setBidStatusFilter(f)}
                    />
                  ))}
                </ScrollView>
              </View>
              {hasActiveFilters ? (
                <Pressable
                  onPress={() => {
                    setPickupFilter(null);
                    setDropFilter(null);
                    setBidStatusFilter('all');
                  }}
                  hitSlop={8}
                  style={styles.clearFilters}
                >
                  <Text style={styles.clearFiltersText}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
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
          ) : recommendedStories.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
              <MapPin size={22} color={colors.textMuted} strokeWidth={1.8} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No open loads right now</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                {pickupFilter || dropFilter
                  ? 'Try another pickup or drop, or clear filters to see available loads.'
                  : 'Awarded and completed jobs are not listed here — use History for those. Pull to refresh for new boosted loads.'}
              </Text>
            </View>
          ) : (
            recommendedStories.map(({ story, matchesFleet, bucket }) => {
              const chip = referralStatusChip(story);
              const origin = cityOf(story.snapshot_origin) || 'Pickup';
              const destination = cityOf(story.snapshot_destination) || 'Drop';
              const tipVisible =
                story.driver_reward_enabled && story.reward_amount > 0 && story.reward_available;
              const targetRate = positiveMoneyOrNull(story.snapshot_rate_offer);
              const counterRate = positiveMoneyOrNull(story.direct_bid_counter_amount);
              const quotedAmount = positiveMoneyOrNull(story.direct_bid_amount);
              const isAwardedJob = bucket === 'awarded';
              const canRecommend =
                participation.mode === 'employed' &&
                story.campaign_status === 'active' &&
                story.referral_status == null &&
                story.campaign_org_id !== participation.fleetOrgId;
              const canBid =
                participation.mode === 'independent' &&
                !isAwardedJob &&
                story.direct_bid_status !== 'rejected';
              const showRevise = canBid && (bucket === 'quoted' || bucket === 'counter');
              const showBidNow = canBid && !showRevise;

              return (
                <View
                  key={story.post_id || story.campaign_id}
                  style={[
                    styles.recCard,
                    { backgroundColor: Theme.cardWhite },
                    isAwardedJob && styles.jobCard,
                    bucket === 'counter' && styles.counterCard,
                  ]}
                >
                  <View style={styles.recCardBody}>
                    <View style={styles.recTop}>
                      <View style={styles.recOrgRow}>
                        <PartyAvatar
                          name={story.org_name || 'Shipper'}
                          initialsColorSeed={story.campaign_org_id}
                          organizationImageUrl={story.org_logo_url}
                          entityType="client"
                          size={32}
                          shape="rounded"
                        />
                        <View style={styles.recOrgText}>
                          <Text style={styles.orgName} numberOfLines={1}>
                            {story.org_name}
                          </Text>
                          <Text style={[styles.recKicker, isAwardedJob && styles.jobKicker, bucket === 'counter' && styles.counterKicker]}>
                            {isAwardedJob
                              ? 'Job · Awarded'
                              : bucket === 'quoted'
                                ? 'Quoted bid'
                                : bucket === 'counter'
                                  ? 'Counter — your move'
                                  : 'Sponsored load'}
                          </Text>
                        </View>
                      </View>
                      {isAwardedJob ? (
                        <View style={styles.awardedPill}>
                          <Text style={styles.awardedPillText}>Awarded</Text>
                        </View>
                      ) : tipVisible ? (
                        <View style={styles.tipBadge}>
                          <Text style={styles.tipBadgeText}>Earn {formatINR(story.reward_amount)}</Text>
                        </View>
                      ) : (
                        <View style={styles.boostedPill}>
                          <Text style={styles.boostedPillText}>Boosted</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.routeBlock}>
                      <View style={styles.routeCityCol}>
                        <Text style={styles.routeCity} numberOfLines={1}>
                          {origin}
                        </Text>
                        <Text style={styles.routeMeta}>Pickup</Text>
                      </View>
                      <View style={styles.routeArrowWrap}>
                        <ArrowRight size={13} color={Theme.textMuted} strokeWidth={2.2} />
                      </View>
                      <View style={[styles.routeCityCol, styles.routeCityColEnd]}>
                        <Text style={[styles.routeCity, styles.routeCityEnd]} numberOfLines={1}>
                          {destination}
                        </Text>
                        <Text style={[styles.routeMeta, styles.routeMetaEnd]}>Drop</Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Truck size={11} color={Theme.textMuted} strokeWidth={2} />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {story.snapshot_vehicle_type ?? 'Any vehicle'}
                        </Text>
                      </View>
                      {story.snapshot_material ? (
                        <View style={styles.metaItem}>
                          <Package size={11} color={Theme.textMuted} strokeWidth={2} />
                          <Text style={styles.metaText} numberOfLines={1}>
                            {story.snapshot_material}
                          </Text>
                        </View>
                      ) : null}
                      {matchesFleet ? (
                        <View style={styles.matchPill}>
                          <Text style={styles.matchPillText}>Fleet match</Text>
                        </View>
                      ) : null}
                    </View>

                    {isAwardedJob && quotedAmount != null ? (
                      <View style={styles.targetRow}>
                        <Text style={styles.targetLabel}>Awarded rate</Text>
                        <Text style={styles.targetValue}>{formatINR(quotedAmount)}</Text>
                      </View>
                    ) : bucket === 'counter' && counterRate != null ? (
                      <ShipperCounterHighlight
                        counterAmountInr={counterRate}
                        yourQuoteInr={quotedAmount}
                      />
                    ) : bucket === 'quoted' && quotedAmount != null ? (
                      <View style={styles.targetRow}>
                        <Text style={styles.targetLabel}>Your quote</Text>
                        <Text style={styles.targetValue}>{formatINR(quotedAmount)}</Text>
                      </View>
                    ) : targetRate != null ? (
                      <View style={styles.targetRow}>
                        <Text style={styles.targetLabel}>Shipper target</Text>
                        <Text style={styles.targetValue}>{formatINR(targetRate)}</Text>
                      </View>
                    ) : null}

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
                          <Clock3
                            size={12}
                            color={chip.tone === 'positive' ? Theme.success : Theme.accentGold}
                          />
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
                  </View>

                  <View style={styles.cardActionsRow}>
                    <View style={styles.cardActionPrimary}>
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
                          style={styles.ctaBtn}
                          activeOpacity={0.88}
                          onPress={() => openRecommend(story)}
                        >
                          <Text style={styles.ctaBtnText}>Recommend to Fleet Owner</Text>
                          {tipVisible ? (
                            <Text style={styles.ctaBtnHint}>
                              Earn {formatINR(story.reward_amount)} on conversion
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      ) : participation.mode === 'invited' && story.referral_status == null ? (
                        <View style={styles.infoPill}>
                          <Text style={styles.infoPillText}>Join your fleet to participate</Text>
                        </View>
                      ) : showRevise ? (
                        <TouchableOpacity
                          style={[
                            bucket === 'quoted' ? styles.quotedCtaBtn : styles.ctaBtn,
                            bucket === 'counter' && styles.counterCtaBtn,
                          ]}
                          activeOpacity={0.88}
                          onPress={() => openBid(story)}
                        >
                          <Text
                            style={[
                              bucket === 'quoted' ? styles.quotedCtaBtnText : styles.ctaBtnText,
                              bucket === 'counter' && styles.counterCtaBtnText,
                            ]}
                            numberOfLines={1}
                          >
                            {bucket === 'counter'
                              ? `Respond to counter${counterRate != null ? ` · ${formatINR(counterRate)}` : ''}`
                              : `Revise bid${quotedAmount != null ? ` · ${formatINR(quotedAmount)}` : ''}`}
                          </Text>
                          <Text
                            style={[
                              bucket === 'quoted' ? styles.quotedCtaBtnHint : styles.ctaBtnHint,
                              bucket === 'counter' && styles.counterCtaBtnHint,
                            ]}
                            numberOfLines={1}
                          >
                            {bucket === 'counter'
                              ? quotedAmount != null
                                ? `Your quote ${formatINR(quotedAmount)}`
                                : 'Shipper sent a counter'
                              : targetRate != null
                                ? `Target ${formatINR(targetRate)}`
                                : 'Update your quoted bid'}
                          </Text>
                        </TouchableOpacity>
                      ) : showBidNow ? (
                        <TouchableOpacity
                          style={styles.ctaBtn}
                          activeOpacity={0.88}
                          onPress={() => openBid(story)}
                        >
                          <Text style={styles.ctaBtnText} numberOfLines={1}>
                            Bid Now
                          </Text>
                          <Text style={styles.ctaBtnHint} numberOfLines={1}>
                            {targetRate != null
                              ? `Shipper target ${formatINR(targetRate)}`
                              : 'Offer your rate to the shipper'}
                          </Text>
                        </TouchableOpacity>
                      ) : participation.mode === 'independent' &&
                        story.direct_bid_status === 'rejected' ? (
                        <View style={styles.infoPill}>
                          <Text style={styles.infoPillText}>Bid not accepted this time</Text>
                        </View>
                      ) : (
                        <View style={styles.infoPill}>
                          <Text style={styles.infoPillText}>View details</Text>
                        </View>
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.fullViewBtn}
                      activeOpacity={0.88}
                      onPress={() => openStoryViewer(story)}
                      accessibilityRole="button"
                      accessibilityLabel={`Full view story from ${story.org_name}`}
                    >
                      <Text style={styles.fullViewBtnText}>
                        {isAwardedJob ? 'Open job' : 'Full view'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
          </>
        ) : null}

        {source !== 'reach' ? footer : null}
      </ScrollView>

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
              style={[
                styles.sheetInput,
                styles.sheetNoteInput,
                { borderColor: colors.border, color: colors.text },
              ]}
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
                <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
              ) : (
                <Text style={styles.sheetSubmitText}>Send to Fleet Owner</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DriverDirectBidSheet
        visible={bidTarget != null}
        story={bidTarget}
        submitting={bidMutation.isPending}
        onClose={() => setBidTarget(null)}
        onSubmit={submitBid}
      />

      {viewerStartPostId ? (
        <DriverPulseStoryViewer
          stories={filteredReelLoads}
          initialPostId={viewerStartPostId}
          onClose={() => setViewerStartPostId(null)}
          resolveFooterAction={resolveViewerFooterAction}
          onStoryViewed={(s) => {
            void recordDriverReachEvent(s.campaign_id, 'view');
          }}
        />
      ) : null}

      {capacityViewer ? (
        <DriverCapacityStoryViewer
          story={capacityViewer}
          onClose={() => setCapacityViewer(null)}
          footerActions={{
            primary: {
              label: 'Share another',
              hint: 'Post updated availability',
              onPress: () => {
                const vehicleId = capacityViewer.owner_vehicle_id;
                setCapacityViewer(null);
                openCapacityComposer(vehicleId);
              },
            },
            secondary: capacityViewer.is_active
              ? {
                  label: 'Take offline',
                  onPress: () => takeCapacityOffline(capacityViewer),
                }
              : {
                  label: 'Done',
                  onPress: () => setCapacityViewer(null),
                },
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Standalone route wrapper for the existing `stories` route (kept, now
 * unlinked from the primary tab bar). Owns only the header; all Reach
 * content/logic lives in `StoriesContent`, reused unchanged inside the
 * unified Market "Find Work" surface.
 */
export default function DriverStoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const { avatarUri } = useDriverAvatarUri();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: isDark ? colors.background : Theme.surfaceGray },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingHorizontal: Layout.driverHeaderHorizontalPadding,
            paddingBottom: Layout.driverHeaderBottomPadding,
            backgroundColor: isDark ? colors.surface : Theme.surfaceGray,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.push('/(driver)/profile')}
            style={styles.avatarBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <DriverSelfAvatar size={36} uri={avatarUri} borderColor={colors.emerald} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <DriverBrandMark color={colors.textMuted} />
            <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>
              load
            </Text>
          </View>
        </View>
      </View>

      <StoriesContent />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    justifyContent: 'center',
  },
  avatarBtn: { padding: 2 },
  welcomeTitle: {
    ...Typography.headerTitle,
    textTransform: 'none',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  list: { flex: 1 },
  // Header accounts for safe area — reel starts under the header.
  listContent: { paddingBottom: 12, gap: 0 },
  earningsWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
  },
  actionNeededWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    gap: 8,
  },
  actionNeededHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Theme.accentGoldBorder,
    padding: 12,
    gap: 6,
  },
  actionCardKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  actionCardOrg: { fontSize: 14, fontWeight: '800' },
  actionCardAmount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  actionCardCta: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Theme.accentGold,
  },
  actionCardCtaText: { fontSize: 12, fontWeight: '800', color: Theme.textPrimaryDark },
  sourceRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sourceChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  sourceChipText: { fontSize: 12, fontWeight: '700' },
  sectionPad: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    gap: 10,
  },
  sectionHeader: { gap: 2, marginBottom: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: -0.15 },
  sectionSub: { fontSize: 11, fontWeight: '500', lineHeight: 15 },

  filtersBlock: {
    gap: 8,
    paddingVertical: 2,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
  },
  filterLabel: {
    width: 52,
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  filterChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 28,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlueInk,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  filterChipTextSelected: {
    color: Theme.brandBlueInk,
    fontWeight: '700',
  },
  clearFilters: { alignSelf: 'flex-start', paddingVertical: 2 },
  clearFiltersText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.accentBrown,
  },

  emptyCard: {
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  emptyTitle: { fontSize: 13, fontWeight: '700' },
  emptyBody: { fontSize: 11, fontWeight: '500', textAlign: 'center', lineHeight: 15 },

  recCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 10,
    backgroundColor: Theme.cardWhite,
  },
  jobCard: {
    borderColor: Theme.darkGreen,
    borderWidth: 1,
    backgroundColor: Theme.positiveMuted,
  },
  counterCard: {
    borderColor: Theme.accentGoldBorder,
    borderWidth: 1.5,
  },
  recCardBody: { gap: 10 },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  cardActionPrimary: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  fullViewBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  fullViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  recTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recOrgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  recOrgText: { flex: 1, minWidth: 0, gap: 1 },
  orgName: { fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark },
  recKicker: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  jobKicker: {
    color: Theme.darkGreen,
    fontWeight: '700',
  },
  counterKicker: {
    color: Theme.warning,
    fontWeight: '800',
  },
  boostedPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.accentBrown,
    flexShrink: 0,
  },
  boostedPillText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textOnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  awardedPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.darkGreen,
  },
  awardedPillText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.darkGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  tipBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.accentGoldBorder,
  },
  tipBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.accentGold,
    textTransform: 'uppercase',
  },

  routeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  routeCityCol: { flex: 1, minWidth: 0, gap: 1 },
  routeCityColEnd: { alignItems: 'flex-end' },
  routeCity: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  routeCityEnd: { textAlign: 'right' },
  routeMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },
  routeMetaEnd: { textAlign: 'right' },
  routeArrowWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '48%',
  },
  metaText: { fontSize: 11, fontWeight: '500', color: Theme.textSecondary },
  matchPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.positiveMuted,
  },
  matchPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.success,
  },

  targetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.15,
  },
  targetValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },

  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusChipPending: { backgroundColor: Theme.accentGoldMuted, borderColor: Theme.accentGoldBorder },
  statusChipPositive: { backgroundColor: Theme.positiveMuted, borderColor: Theme.positiveMuted },
  statusChipNegative: { backgroundColor: Theme.negativeMuted, borderColor: Theme.negativeMuted },
  statusChipReward: { backgroundColor: Theme.positiveMuted, borderColor: Theme.positiveMuted },
  statusChipText: { fontSize: 9, fontWeight: '700' },
  statusChipTextPositive: { color: Theme.success },
  statusChipTextNegative: { color: Theme.negative },
  statusChipTextPending: { color: Theme.accentGoldPressed },

  ctaBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  ctaBtnText: { fontSize: 12, fontWeight: '700', color: Theme.buttonPrimaryText },
  ctaBtnHint: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.buttonPrimaryText,
    opacity: 0.75,
  },
  quotedCtaBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  quotedCtaBtnText: { fontSize: 12, fontWeight: '700', color: Theme.textPrimaryDark },
  quotedCtaBtnHint: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  counterCtaBtn: {
    backgroundColor: Theme.accentGold,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.accentGoldPressed,
  },
  counterCtaBtnText: {
    color: Theme.textPrimaryDark,
  },
  counterCtaBtnHint: {
    color: Theme.accentBrownDeep,
    opacity: 0.85,
  },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Theme.success,
    paddingHorizontal: 8,
  },
  walletBtnText: { fontSize: 11, fontWeight: '700', color: Theme.textOnPrimary },
  infoPill: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  infoPillText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    color: Theme.textMuted,
  },

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
  reasonChipActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimaryBorder,
  },
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
