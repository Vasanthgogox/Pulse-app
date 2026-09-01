/**
 * Phase 3A — Available Loads (read-only marketplace discovery for Fleet Owners).
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import {
  fleetOwnerLoadDisplayId,
  fleetOwnerLoadRouteLabel,
  formatFleetOwnerRateOffer,
  isLoadCompatibleWithFleet,
  type FleetOwnerOpenLoad,
} from '@/features/driver/services/fleetOwnerLoads.service';
import { marketBidStatusLabel, type MarketBidStatus } from '@/features/driver/services/marketBids.service';
import { MyBidsContent } from '@/features/driver/components/MyBidsScreen';
import { StoriesContent } from '@/features/reach/screens/DriverStoriesScreen';
import { useDriverFleetOwnerQuery } from '@/lib/queries/useDriverFleetOwnerQuery';
import { useFleetOwnerOpenLoadsQuery } from '@/lib/queries/useFleetOwnerOpenLoadsQuery';
import { useMyMarketBidsQuery } from '@/lib/queries/useMyMarketBidsQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { ROUTES } from '@/lib/routes';
import { useRouter } from 'expo-router';
import { ChevronRight, Filter, MapPin, Truck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type FilterMode = 'all' | 'compatible';

function formatPickupDate(iso: string | null): string {
  if (!iso) return 'Date TBA';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

export default function AvailableLoadsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const [segment, setSegment] = useState<'find' | 'mybids'>('find');
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="Market"
        subtitle="Find work"
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace(ROUTES.DRIVER_ROOT)
        }
      />

      <View
        style={[
          styles.segmentRow,
          { borderColor: cardBorder, backgroundColor: isDark ? colors.surfaceElevated : Theme.surfaceGray },
        ]}
      >
        {(
          [
            { id: 'find' as const, label: 'Find Work' },
            { id: 'mybids' as const, label: 'My Bids' },
          ] as const
        ).map((seg) => {
          const on = segment === seg.id;
          return (
            <Pressable
              key={seg.id}
              onPress={() => setSegment(seg.id)}
              style={[
                styles.segmentBtn,
                on && { backgroundColor: colors.surface, borderColor: cardBorder },
              ]}
            >
              <Text style={[styles.segmentText, { color: on ? colors.text : colors.textMuted }]}>
                {seg.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {segment === 'mybids' ? (
        uid ? <MyBidsContent uid={uid} /> : null
      ) : uid ? (
        <MarketFindWorkScreen uid={uid} />
      ) : null}
    </View>
  );
}

/**
 * Market → Find Work: the existing Reach opportunities feed (`StoriesContent`,
 * unchanged) with formal open-Market loads composed in as its last section,
 * so both opportunity sources read as one feed instead of two stacked
 * screens. No new sorting/business logic — same components, same queries,
 * new composition only.
 */
function MarketFindWorkScreen({ uid }: { uid: string }) {
  const { refetch: refetchLoads } = useFleetOwnerOpenLoadsQuery(uid);
  const { refetch: refetchBids } = useMyMarketBidsQuery(uid);

  return (
    <StoriesContent
      footer={<FindLoadsContent uid={uid} />}
      onRefreshExtra={() => {
        void refetchLoads();
        void refetchBids();
      }}
    />
  );
}

/**
 * Presentation-only content adapter — the same open-Market load list/filters
 * previously rendered inline in this screen, now embeddable at the bottom of
 * the unified Find Work feed. Same hooks, same data, same Fleet Owner gate;
 * only the surrounding ScrollView/header is gone (the caller owns scrolling).
 */
function FindLoadsContent({ uid }: { uid: string }) {
  const router = useRouter();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const { isFleetOwner, isLoading: ownerLoading } = useDriverFleetOwnerQuery(uid);
  const { loads, isLoading, error } = useFleetOwnerOpenLoadsQuery(uid);
  const { vehicles } = useOwnerVehiclesQuery(uid);
  const { bids } = useMyMarketBidsQuery(uid);
  const [filter, setFilter] = useState<FilterMode>('all');
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

  const fleetTypes = useMemo(
    () => vehicles.map((v) => v.vehicle_type),
    [vehicles],
  );

  const bidStatusByIndentId = useMemo(() => {
    const map = new Map<string, MarketBidStatus>();
    for (const b of bids) map.set(b.indent_id, b.status);
    return map;
  }, [bids]);

  const visible = useMemo(() => {
    if (filter !== 'compatible') return loads;
    return loads.filter((l) => isLoadCompatibleWithFleet(l, fleetTypes));
  }, [loads, filter, fleetTypes]);

  if (!ownerLoading && !isFleetOwner) {
    return (
      <View style={styles.marketGate}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Market loads</Text>
        <Text style={[styles.gateBody, { color: colors.textMuted }]}>
          Open marketplace demand comes from businesses. Become a Fleet Owner
          to also bid on formal Market loads here.
        </Text>
        <Pressable
          onPress={() =>
            router.push(
              ROUTES.driverBecomeFleetOwner() as Parameters<typeof router.push>[0],
            )
          }
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.emerald, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <Text style={styles.ctaText}>Become a Fleet Owner</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.marketSection}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Market loads</Text>
        <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
          Formal marketplace loads from businesses — bid with your fleet.
        </Text>
      </View>

      <View style={styles.filterRow}>
        {(
          [
            { id: 'all' as const, label: 'All open' },
            { id: 'compatible' as const, label: 'Fits my fleet' },
          ] as const
        ).map((opt) => {
          const on = filter === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setFilter(opt.id)}
              style={[
                styles.filterChip,
                {
                  borderColor: on ? colors.emerald : cardBorder,
                  backgroundColor: on
                    ? isDark
                      ? colors.emeraldMuted
                      : 'rgba(167,243,208,0.4)'
                    : colors.surface,
                },
              ]}
            >
              <Filter size={12} color={on ? colors.emerald : colors.textMuted} />
              <Text
                style={[
                  styles.filterText,
                  { color: on ? colors.emerald : colors.textMuted },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.marketListPad}>
        {error ? (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Could not load marketplace.'}
          </Text>
        ) : isLoading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginTop: 28 }} />
        ) : visible.length === 0 ? (
          <View
            style={[
              styles.empty,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <MapPin size={22} color={colors.emerald} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No open loads right now
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              When businesses broadcast marketplace demand, it appears here.
            </Text>
          </View>
        ) : (
          visible.map((load) => (
            <LoadCard
              key={load.id}
              load={load}
              compatible={isLoadCompatibleWithFleet(load, fleetTypes)}
              bidStatus={bidStatusByIndentId.get(load.id)}
              cardBorder={cardBorder}
              colors={colors}
              isDark={isDark}
              onPress={() =>
                router.push(
                  ROUTES.driverAvailableLoad(load.id) as Parameters<
                    typeof router.push
                  >[0],
                )
              }
            />
          ))
        )}
      </View>
    </View>
  );
}

function bidStatusBadgeColor(
  status: MarketBidStatus,
  colors: ReturnType<typeof useDriverThemeColors>,
): string {
  switch (status) {
    case 'accepted':
      return colors.emerald;
    case 'rejected':
      return Theme.negative;
    default:
      return Theme.warning;
  }
}

function LoadCard({
  load,
  compatible,
  bidStatus,
  cardBorder,
  colors,
  isDark,
  onPress,
}: {
  load: FleetOwnerOpenLoad;
  compatible: boolean;
  bidStatus?: MarketBidStatus;
  cardBorder: string;
  colors: ReturnType<typeof useDriverThemeColors>;
  isDark: boolean;
  onPress: () => void;
}) {
  const rate = formatFleetOwnerRateOffer(load.rate_offer);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: cardBorder,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.route, { color: colors.text }]} numberOfLines={2}>
          {fleetOwnerLoadRouteLabel(load)}
        </Text>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>
      {bidStatus ? (
        <View
          style={[
            styles.statusPill,
            { backgroundColor: isDark ? colors.surfaceElevated : Theme.surfaceGray },
          ]}
        >
          <Text style={[styles.statusPillText, { color: bidStatusBadgeColor(bidStatus, colors) }]}>
            {bidStatus === 'pending' ? 'Bid submitted' : marketBidStatusLabel(bidStatus)}
          </Text>
        </View>
      ) : null}
      {rate ? (
        <Text style={[styles.rate, { color: Theme.warning }]}>{rate}</Text>
      ) : (
        <Text style={[styles.meta, { color: colors.textMuted }]}>Rate on request</Text>
      )}
      <View style={styles.metaRow}>
        <Truck size={13} color={colors.textMuted} />
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {load.vehicle_type?.trim() || 'Vehicle TBA'}
          {load.load_type ? ` · ${load.load_type}` : ''}
        </Text>
      </View>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {formatPickupDate(load.pickup_date)} · {fleetOwnerLoadDisplayId(load)}
      </Text>
      {compatible ? (
        <View
          style={[
            styles.fitPill,
            {
              backgroundColor: isDark
                ? colors.emeraldMuted
                : 'rgba(167,243,208,0.45)',
            },
          ]}
        >
          <Text style={[styles.fitText, { color: colors.emerald }]}>
            Fits my fleet
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gateBody: { fontSize: 13, lineHeight: 19 },
  marketSection: { paddingTop: 16, gap: 10, paddingBottom: 4 },
  marketGate: {
    paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  marketListPad: { paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD, gap: 10 },
  sectionHeader: {
    paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    gap: 2,
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: -0.15 },
  sectionSub: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    paddingVertical: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    minHeight: 34,
  },
  filterText: { fontSize: 12, fontWeight: '700' },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  route: { flex: 1, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  rate: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 12, fontWeight: '600' },
  fitPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  fitText: { fontSize: 11, fontWeight: '700' },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  empty: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyBody: { fontSize: 13, lineHeight: 19 },
  cta: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  ctaText: { color: Theme.textOnPrimary, fontSize: 14, fontWeight: '700' },
  errorText: { color: Theme.negative, fontSize: 13, fontWeight: '600' },
});
