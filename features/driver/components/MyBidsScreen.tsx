/**
 * Phase A/B — My Bids: this DCO's own market_bids rows.
 * Status comes directly from market_bids.status, never inferred from trip
 * existence. Route text for an accepted bid is resolved by matching
 * indent_id against this driver's own awarded trips (trips_driver_view) —
 * market_bids itself carries no route fields, and a DCO cannot read
 * `indents` directly (org-scoped RLS), so this is the only route text
 * available without a backend change.
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
  formatMarketBidAmount,
  marketBidStatusLabel,
  type MarketBidRow,
  type MarketBidStatus,
} from '@/features/driver/services/marketBids.service';
import { useMyMarketAwardsQuery } from '@/lib/queries/useMyMarketAwardsQuery';
import { useMyMarketBidsQuery } from '@/lib/queries/useMyMarketBidsQuery';
import { ROUTES } from '@/lib/routes';
import type { DriverTripRow } from '@/types/trip-views';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight, Inbox } from 'lucide-react-native';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatSubmittedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusColor(status: MarketBidStatus, colors: ReturnType<typeof useDriverThemeColors>) {
  switch (status) {
    case 'accepted':
      return colors.emerald;
    case 'rejected':
      return Theme.negative;
    default:
      return colors.textMuted;
  }
}

export default function MyBidsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

  const { bids, isLoading, isRefetching, refetch, error } = useMyMarketBidsQuery(uid);
  const { awards } = useMyMarketAwardsQuery(uid);

  const awardByIndentId = useMemo(() => {
    const map = new Map<string, DriverTripRow>();
    for (const trip of awards) {
      if (!trip.indent_id) continue;
      const existing = map.get(trip.indent_id);
      // Prefer the non-cancelled canonical trip if a stale cancelled one also matches.
      if (!existing || (existing.status === 'cancelled' && trip.status !== 'cancelled')) {
        map.set(trip.indent_id, trip);
      }
    }
    return map;
  }, [awards]);

  const groups = useMemo(() => {
    const pending: MarketBidRow[] = [];
    const accepted: MarketBidRow[] = [];
    const closed: MarketBidRow[] = [];
    for (const b of bids) {
      if (b.status === 'pending') pending.push(b);
      else if (b.status === 'accepted') accepted.push(b);
      else closed.push(b);
    }
    return { pending, accepted, closed };
  }, [bids]);

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="My Bids"
        subtitle="Market"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(ROUTES.driverAvailableLoads() as Href)
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          paddingTop: 12,
          gap: 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.emerald}
          />
        }
      >
        {error ? (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Could not load your bids.'}
          </Text>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={colors.emerald} style={{ marginTop: 28 }} />
        ) : bids.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
            <Inbox size={22} color={colors.emerald} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No bids yet</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Bid on an open Market load and it will show up here.
            </Text>
          </View>
        ) : (
          <>
            {groups.pending.length > 0 ? (
              <Section title="Pending" count={groups.pending.length} colors={colors}>
                {groups.pending.map((b) => (
                  <BidCard key={b.id} bid={b} colors={colors} isDark={isDark} cardBorder={cardBorder} />
                ))}
              </Section>
            ) : null}

            {groups.accepted.length > 0 ? (
              <Section title="Accepted" count={groups.accepted.length} colors={colors}>
                {groups.accepted.map((b) => (
                  <BidCard
                    key={b.id}
                    bid={b}
                    colors={colors}
                    isDark={isDark}
                    cardBorder={cardBorder}
                    trip={awardByIndentId.get(b.indent_id)}
                    onViewTrip={(tripId) =>
                      router.push(`/(driver)/trip-history/${tripId}` as Href)
                    }
                  />
                ))}
              </Section>
            ) : null}

            {groups.closed.length > 0 ? (
              <Section title="Not selected" count={groups.closed.length} colors={colors}>
                {groups.closed.map((b) => (
                  <BidCard key={b.id} bid={b} colors={colors} isDark={isDark} cardBorder={cardBorder} />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  count,
  colors,
  children,
}: {
  title: string;
  count: number;
  colors: ReturnType<typeof useDriverThemeColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
        {title.toUpperCase()} · {count}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function BidCard({
  bid,
  colors,
  isDark,
  cardBorder,
  trip,
  onViewTrip,
}: {
  bid: MarketBidRow;
  colors: ReturnType<typeof useDriverThemeColors>;
  isDark: boolean;
  cardBorder: string;
  trip?: DriverTripRow;
  onViewTrip?: (tripId: string) => void;
}) {
  const route =
    trip && (trip.pickup_location || trip.dropoff_location)
      ? `${trip.pickup_location?.trim() || 'Pickup'} → ${trip.dropoff_location?.trim() || 'Drop'}`
      : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.amount, { color: colors.text }]}>
          {formatMarketBidAmount(bid.amount) || 'Rate hidden'}
        </Text>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: isDark ? colors.surfaceElevated : Theme.surfaceGray,
            },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor(bid.status, colors) }]}>
            {marketBidStatusLabel(bid.status)}
          </Text>
        </View>
      </View>

      {route ? (
        <Text style={[styles.route, { color: colors.text }]} numberOfLines={1}>
          {route}
        </Text>
      ) : null}

      {bid.note ? (
        <Text style={[styles.note, { color: colors.textMuted }]} numberOfLines={2}>
          {bid.note}
        </Text>
      ) : null}

      <Text style={[styles.meta, { color: colors.textMuted }]}>
        Submitted {formatSubmittedAt(bid.created_at)}
      </Text>

      {trip && onViewTrip ? (
        <Pressable
          onPress={() => onViewTrip(trip.id)}
          style={({ pressed }) => [styles.viewTrip, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.viewTripText, { color: colors.emerald }]}>View Trip</Text>
          <ChevronRight size={14} color={colors.emerald} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  route: { fontSize: 14, fontWeight: '700' },
  note: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  meta: { fontSize: 11, fontWeight: '600' },
  viewTrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  viewTripText: { fontSize: 12, fontWeight: '700' },
  empty: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyBody: { fontSize: 13, lineHeight: 19 },
  errorText: { color: Theme.negative, fontSize: 13, fontWeight: '600' },
});
