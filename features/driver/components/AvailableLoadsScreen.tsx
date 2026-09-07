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
  formatFleetOwnerRateOffer,
  isLoadCompatibleWithFleet,
  type FleetOwnerOpenLoad,
} from '@/features/driver/services/fleetOwnerLoads.service';
import { marketBidStatusLabel, type MarketBidStatus } from '@/features/driver/services/marketBids.service';
import { MyBidsContent } from '@/features/driver/components/MyBidsScreen';
import {
  MarketplaceRouteGrid,
  MarketplaceSpecChips,
} from '@/features/network/components/MarketplaceLoadCardChrome';
import { cityOf, StoriesContent, type SharedFeedFilters } from '@/features/reach/screens/DriverStoriesScreen';
import { useDriverFleetOwnerQuery } from '@/lib/queries/useDriverFleetOwnerQuery';
import { useFleetOwnerOpenLoadsQuery } from '@/lib/queries/useFleetOwnerOpenLoadsQuery';
import { useMyMarketBidsQuery } from '@/lib/queries/useMyMarketBidsQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { ROUTES } from '@/lib/routes';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, MapPin } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

function formatPickupDate(iso: string | null): string | null {
  if (!iso) return null;
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

/**
 * "Posted", not "Marketplace posted" — created_at is the indent's own
 * creation time, not a dedicated Marketplace-publication timestamp (an
 * indent's circulation_target can start including Marketplace later, with
 * no timestamp recorded for that change). Good enough for freshness
 * display today; don't imply more precision than the field actually has.
 */
function postedAgoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Posted just now';
  if (m < 60) return `Posted ${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Posted ${h}h ago`;
  return `Posted ${Math.floor(h / 24)}d ago`;
}

export default function AvailableLoadsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  // A7.3: the DCO Available surface's "My Bids" entry deep-links here with
  // ?segment=mybids so it lands directly on this segment instead of Find Work.
  const { segment: initialSegment } = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<'find' | 'mybids'>(
    initialSegment === 'mybids' ? 'mybids' : 'find',
  );
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
  const { loads, refetch: refetchLoads } = useFleetOwnerOpenLoadsQuery(uid);
  const { refetch: refetchBids } = useMyMarketBidsQuery(uid);

  // Shared pickup/drop filter chips should represent both sources (see
  // DriverStoriesScreen.tsx's extraPickupCities/extraDropCities) — derived
  // here, at the composition layer, from the same open-Market loads
  // FindLoadsContent already renders. No new query, no DB change.
  const extraPickupCities = useMemo(() => {
    const set = new Set<string>();
    for (const l of loads) {
      const c = cityOf(l.pickup_area);
      if (c) set.add(c);
    }
    return [...set];
  }, [loads]);
  const extraDropCities = useMemo(() => {
    const set = new Set<string>();
    for (const l of loads) {
      const c = cityOf(l.drop_location);
      if (c) set.add(c);
    }
    return [...set];
  }, [loads]);

  return (
    <StoriesContent
      footer={(filters) => <FindLoadsContent uid={uid} filters={filters} />}
      onRefreshExtra={() => {
        void refetchLoads();
        void refetchBids();
      }}
      extraPickupCities={extraPickupCities}
      extraDropCities={extraDropCities}
    />
  );
}

/**
 * Presentation-only content adapter — the same open-Market load list previously rendered inline
 * in this screen, now embeddable at the bottom of the unified Find Work feed as the Marketplace
 * (tender-board) layer. Shared pickup/drop/fits-my-fleet filters come from the parent feed rather
 * than owning a separate filter bar -- this reads as one filtered work surface, not two.
 */
function FindLoadsContent({ uid, filters }: { uid: string; filters: SharedFeedFilters }) {
  const router = useRouter();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const { isFleetOwner, isLoading: ownerLoading } = useDriverFleetOwnerQuery(uid);
  const { loads, isLoading, error, refetch: refetchLoads } = useFleetOwnerOpenLoadsQuery(uid);
  const { vehicles } = useOwnerVehiclesQuery(uid);
  const { bids } = useMyMarketBidsQuery(uid);
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

  // refetchOnWindowFocus is inert on React Native without an app-wide
  // TanStack Query focus manager registered (none exists in this app), so
  // returning to Find Work -- including right after completing a trip --
  // otherwise shows stale indents until a manual pull-to-refresh. Mirrors
  // the same useFocusEffect pattern DriverTripHistoryScreen.tsx already
  // uses for itself.
  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      void refetchLoads();
    }, [uid, refetchLoads]),
  );

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
    return loads.filter((l) => {
      if (filters.pickup) {
        const origin = cityOf(l.pickup_area);
        if (origin.toLowerCase() !== filters.pickup.toLowerCase()) return false;
      }
      if (filters.drop) {
        const dest = cityOf(l.drop_location);
        if (dest.toLowerCase() !== filters.drop.toLowerCase()) return false;
      }
      if (filters.fitsFleet && !isLoadCompatibleWithFleet(l, fleetTypes)) return false;
      return true;
    });
  }, [loads, filters, fleetTypes]);

  if (!ownerLoading && !isFleetOwner) {
    return (
      <View style={styles.marketGate}>
        <Text style={[styles.marketplaceLabel, { color: colors.textMuted }]}>MARKETPLACE</Text>
        <Text style={[styles.gateBody, { color: colors.textMuted }]}>
          Open marketplace demand comes from businesses. Become a Fleet Owner
          to also bid in the Marketplace here.
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
      <View style={styles.marketplaceDivider} />
      <Text style={[styles.marketplaceLabel, { color: colors.textMuted }]}>MARKETPLACE</Text>

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
              {
                backgroundColor: isDark ? colors.surface : Theme.cardWhite,
                borderColor: cardBorder,
              },
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
    // A6.4: superseded is not "still pending" — must not share pending's
    // warning/amber color, which reads as "awaiting decision".
    case 'superseded':
      return colors.textMuted;
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
  const postedLabel = postedAgoLabel(load.created_at);
  const shipper = (load.creator_organization_name ?? '').trim() || 'Shipper';
  const displayId = fleetOwnerLoadDisplayId(load);
  const dateLabel = formatPickupDate(load.pickup_date);
  const specChips = [
    load.vehicle_type?.trim(),
    load.load_type?.trim(),
  ].filter((v): v is string => Boolean(v));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          // Light: white cards on slate page BG (driverDetailPageBackground).
          // Dark: keep theme surface.
          backgroundColor: isDark ? colors.surface : Theme.cardWhite,
          borderColor: cardBorder,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${shipper}, ${load.pickup_area ?? 'Pickup'} to ${load.drop_location ?? 'Drop'}, ${rate ?? 'rate on request'}`}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTopText}>
          <Text style={[styles.shipper, { color: colors.textMuted }]} numberOfLines={1}>
            {shipper}
          </Text>
          <Text style={[styles.metaLine, { color: colors.textMuted }]} numberOfLines={1}>
            {[displayId, postedLabel].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {compatible || bidStatus ? (
          <View style={styles.badgeStack}>
            {compatible ? (
              <View
                style={[
                  styles.fitPill,
                  { backgroundColor: isDark ? Theme.positiveMutedDark : 'rgba(21,128,61,0.1)' },
                ]}
              >
                <Text style={[styles.fitText, { color: colors.emerald }]}>Fleet fit</Text>
              </View>
            ) : null}
            {bidStatus ? (
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: isDark ? colors.surfaceElevated : Theme.surfaceGray },
                ]}
              >
                <Text
                  style={[styles.statusPillText, { color: bidStatusBadgeColor(bidStatus, colors) }]}
                >
                  {bidStatus === 'pending' ? 'Bid in' : marketBidStatusLabel(bidStatus)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <MarketplaceRouteGrid pickup={load.pickup_area} drop={load.drop_location} />
      <MarketplaceSpecChips chips={specChips} dateLabel={dateLabel} />

      <View style={[styles.cardFooter, { borderTopColor: cardBorder }]}>
        <View style={styles.rateBlock}>
          <Text style={[styles.rateLabel, { color: colors.textMuted }]}>Target rate</Text>
          <Text
            style={[styles.rate, { color: rate ? Theme.accentBrownDeep : colors.textMuted }]}
            numberOfLines={1}
          >
            {rate ?? 'On request'}
          </Text>
        </View>
        <View style={styles.cardCta}>
          <Text style={[styles.cardCtaText, { color: colors.emerald }]}>View</Text>
          <ChevronRight size={13} color={colors.emerald} strokeWidth={2.4} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gateBody: { fontSize: 12, lineHeight: 17 },
  marketSection: { paddingTop: 16, gap: 10, paddingBottom: 8 },
  marketGate: {
    paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  marketListPad: { paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD, gap: 8 },
  marketplaceDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148,163,184,0.35)',
    marginHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    marginBottom: 2,
  },
  marketplaceLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    marginBottom: 2,
  },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
    marginTop: 10,
    marginBottom: 2,
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
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1, lineHeight: 15 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 10,
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTopText: { flex: 1, minWidth: 0, gap: 2 },
  shipper: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    lineHeight: 13,
    includeFontPadding: false,
  },
  metaLine: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 13,
    includeFontPadding: false,
  },
  badgeStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 5,
    flexShrink: 0,
    maxWidth: '42%',
  },
  rate: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.25,
    lineHeight: 18,
    includeFontPadding: false,
  },
  rateLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    lineHeight: 12,
    includeFontPadding: false,
  },
  rateBlock: { flex: 1, minWidth: 0, gap: 1 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    flexShrink: 0,
  },
  cardCtaText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    includeFontPadding: false,
  },
  fitPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  fitText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    includeFontPadding: false,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    includeFontPadding: false,
  },
  empty: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
  },
  emptyTitle: { fontSize: 13, fontWeight: '700', letterSpacing: -0.15 },
  emptyBody: { fontSize: 12, lineHeight: 17 },
  cta: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ctaText: { color: Theme.textOnPrimary, fontSize: 13, fontWeight: '700' },
  errorText: { color: Theme.negative, fontSize: 12, fontWeight: '600' },
});
