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
  type FeePaymentStatus,
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
    case 'superseded':
      return colors.textMuted;
    default:
      return colors.textMuted;
  }
}

function statusPillBackground(
  status: MarketBidStatus,
  opts: { awarded: boolean; isDark: boolean; colors: ReturnType<typeof useDriverThemeColors> },
) {
  if (opts.awarded) {
    return opts.isDark ? Theme.positiveMutedDark : 'rgba(21,128,61,0.1)';
  }
  switch (status) {
    case 'rejected':
      return opts.isDark ? 'rgba(232,33,39,0.16)' : Theme.negativeMuted;
    case 'pending':
      return opts.isDark ? 'rgba(245,158,11,0.16)' : Theme.warningMuted;
    default:
      return opts.isDark ? opts.colors.surfaceElevated : Theme.surfaceGray;
  }
}

/** A6.4: explain *why* a bid stopped mattering — 'superseded' is not a business
 * decision (rejected) or a driver choice (withdrawn), it just became moot
 * because the driver was awarded a different load. */
function statusExplanation(status: MarketBidStatus): string | null {
  if (status === 'superseded') {
    return 'Another load was awarded to you, so this bid is no longer active.';
  }
  return null;
}

/** A8.6.2 — the Marketplace fee gates trip creation now, not just award. */
function feePaymentGateSatisfied(status: FeePaymentStatus): boolean {
  return status === 'paid' || status === 'not_required';
}

function feePendingLabel(status: FeePaymentStatus, feeAmount: number | null): string {
  const feeLabel = feeAmount != null ? formatMarketBidAmount(feeAmount) : 'the Marketplace fee';
  switch (status) {
    case 'pending':
      return `Payment of ${feeLabel} is processing…`;
    case 'failed':
      return `Payment of ${feeLabel} failed — retry to unlock this job.`;
    case 'required':
    default:
      return `Pay ${feeLabel} to Pulse to unlock this job.`;
  }
}

function isAssignedLike(status: string): boolean {
  const s = (status || '').toLowerCase();
  return s === 'assigned' || s === 'pending' || s === 'scheduled';
}

function isActiveLike(status: string): boolean {
  const s = (status || '').toLowerCase();
  return (
    s === 'in_progress' ||
    s === 'in_transit' ||
    s === 'transit' ||
    s === 'picked_up' ||
    s === 'pickup' ||
    s === 'started'
  );
}

/**
 * Shared My Bids content — used both by the standalone My Bids route (kept,
 * unlinked from primary nav) and inline as Market's "My Bids" segment.
 * No header/root background here; the caller owns the shell.
 */
export function MyBidsContent({ uid }: { uid: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
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

  // Lifecycle fix: `market_bids.status` never leaves 'accepted' once
  // awarded — the trip's own status is the only real signal of what
  // happened next, and it's already available here via awardByIndentId.
  // A completed trip must not keep showing under Awarded; a cancelled
  // trip is no longer actionable either, but isn't "Completed" -- it goes
  // to the closed/"Not selected" bucket, where BidCard renders it as
  // "Cancelled" without needing a new DB status.
  const groups = useMemo(() => {
    const pending: MarketBidRow[] = [];
    const awarded: MarketBidRow[] = [];
    const completed: MarketBidRow[] = [];
    const closed: MarketBidRow[] = [];
    for (const b of bids) {
      if (b.status === 'pending') {
        pending.push(b);
      } else if (b.status === 'accepted') {
        const trip = awardByIndentId.get(b.indent_id);
        if (trip?.status === 'completed') completed.push(b);
        else if (trip?.status === 'cancelled') closed.push(b);
        else awarded.push(b);
      } else {
        closed.push(b);
      }
    }
    return { pending, awarded, completed, closed };
  }, [bids, awardByIndentId]);

  const renderAwardCard = (b: MarketBidRow) => {
    const trip = awardByIndentId.get(b.indent_id);
    return (
      <BidCard
        key={b.id}
        bid={b}
        colors={colors}
        isDark={isDark}
        cardBorder={cardBorder}
        trip={trip}
        onViewTrip={(tripId) => {
          const t = awardByIndentId.get(b.indent_id);
          if (t && (isAssignedLike(t.status) || isActiveLike(t.status))) {
            router.replace(ROUTES.DRIVER_ROOT as Href);
            return;
          }
          router.push(`/driver-trip/${tripId}` as Href);
        }}
        onPress={
          trip
            ? () => {
                if (isAssignedLike(trip.status) || isActiveLike(trip.status)) {
                  router.replace(ROUTES.DRIVER_ROOT as Href);
                  return;
                }
                router.push(`/driver-trip/${trip.id}` as Href);
              }
            : () => router.push(ROUTES.driverAvailableLoad(b.indent_id) as Href)
        }
      />
    );
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
        paddingBottom: Math.max(insets.bottom, 16) + 24,
        paddingTop: 10,
        gap: 14,
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
        <View style={[styles.empty, { backgroundColor: isDark ? colors.surface : Theme.cardWhite, borderColor: cardBorder }]}>
          <Inbox size={22} color={colors.emerald} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No bids yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Bid on an open Market load and it will show up here.
          </Text>
        </View>
      ) : (
        <>
          {groups.awarded.length > 0 ? (
            <Section title="Awarded" count={groups.awarded.length} colors={colors}>
              {groups.awarded.map(renderAwardCard)}
            </Section>
          ) : null}

          {groups.completed.length > 0 ? (
            <Section title="Completed" count={groups.completed.length} colors={colors}>
              {groups.completed.map(renderAwardCard)}
            </Section>
          ) : null}

          {groups.pending.length > 0 ? (
            <Section title="Pending" count={groups.pending.length} colors={colors}>
              {groups.pending.map((b) => (
                <BidCard
                  key={b.id}
                  bid={b}
                  colors={colors}
                  isDark={isDark}
                  cardBorder={cardBorder}
                  onPress={() =>
                    router.push(ROUTES.driverAvailableLoad(b.indent_id) as Href)
                  }
                />
              ))}
            </Section>
          ) : null}

          {groups.closed.length > 0 ? (
            <Section title="Not selected" count={groups.closed.length} colors={colors}>
              {groups.closed.map((b) => (
                <BidCard
                  key={b.id}
                  bid={b}
                  colors={colors}
                  isDark={isDark}
                  cardBorder={cardBorder}
                  onPress={() =>
                    router.push(ROUTES.driverAvailableLoad(b.indent_id) as Href)
                  }
                />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/** Standalone route wrapper — kept, but unlinked from primary Market nav now that My Bids is a Market segment. */
export default function MyBidsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);

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
      {uid ? <MyBidsContent uid={uid} /> : null}
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
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
        {title.toUpperCase()} · {count}
      </Text>
      <View style={styles.sectionCards}>{children}</View>
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
  onPress,
}: {
  bid: MarketBidRow;
  colors: ReturnType<typeof useDriverThemeColors>;
  isDark: boolean;
  cardBorder: string;
  trip?: DriverTripRow;
  onViewTrip?: (tripId: string) => void;
  onPress?: () => void;
}) {
  const route =
    trip && (trip.pickup_location || trip.dropoff_location)
      ? `${trip.pickup_location?.trim() || 'Pickup'} → ${trip.dropoff_location?.trim() || 'Drop'}`
      : null;
  // Lifecycle fix: bid.status alone can't distinguish these -- it stays
  // 'accepted' forever once awarded. The associated trip's own status is
  // the real signal for what this card should say.
  const rawAccepted = bid.status === 'accepted';
  const isCompleted = rawAccepted && trip?.status === 'completed';
  const isCancelledTrip = rawAccepted && trip?.status === 'cancelled';
  const isActiveAward = rawAccepted && !isCompleted && !isCancelledTrip;
  const showAwardedStyling = isActiveAward || isCompleted;
  const feePending = isActiveAward && !feePaymentGateSatisfied(bid.fee_payment_status);
  const statusLabel = isCompleted
    ? 'Completed'
    : isCancelledTrip
      ? 'Cancelled'
      : isActiveAward
        ? 'Awarded'
        : marketBidStatusLabel(bid.status);
  const statusTextColor = isCompleted
    ? colors.emerald
    : isCancelledTrip
      ? colors.textMuted
      : statusColor(bid.status, colors);
  const explanation = statusExplanation(bid.status);
  const ctaLabel =
    trip && onViewTrip
      ? isAssignedLike(trip.status) || isActiveLike(trip.status)
        ? 'Open job'
        : 'View trip'
      : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        showAwardedStyling && styles.cardAwarded,
        {
          backgroundColor: isDark ? colors.surface : Theme.cardWhite,
          borderColor: showAwardedStyling
            ? isDark
              ? Theme.positiveMutedDarkBorder
              : 'rgba(21,128,61,0.28)'
            : cardBorder,
          opacity: pressed && onPress ? 0.92 : 1,
        },
      ]}
    >
      {showAwardedStyling ? (
        <View style={[styles.cardAccent, { backgroundColor: colors.emerald }]} />
      ) : null}

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.amount, { color: colors.text }]} numberOfLines={1}>
            {formatMarketBidAmount(bid.amount) || 'Rate hidden'}
          </Text>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: statusPillBackground(bid.status, {
                  awarded: showAwardedStyling,
                  isDark,
                  colors,
                }),
              },
            ]}
          >
            <Text style={[styles.statusText, { color: statusTextColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {showAwardedStyling ? (
          <Text style={[styles.jobKicker, { color: colors.emerald }]}>
            {isCompleted
              ? 'Job · Completed'
              : feePending
                ? 'Job · Payment required'
                : 'Job · Awarded'}
          </Text>
        ) : null}

        {feePending ? (
          <Text style={[styles.note, styles.noteEmphasis, { color: colors.textMuted }]}>
            {feePendingLabel(bid.fee_payment_status, bid.platform_fee_amount)}
          </Text>
        ) : null}

        {route ? (
          <Text style={[styles.route, { color: colors.text }]} numberOfLines={2}>
            {route}
          </Text>
        ) : null}

        {bid.note ? (
          <Text style={[styles.note, { color: colors.textMuted }]} numberOfLines={2}>
            {bid.note}
          </Text>
        ) : null}

        {explanation ? (
          <Text style={[styles.note, { color: colors.textMuted }]} numberOfLines={2}>
            {explanation}
          </Text>
        ) : null}

        <View style={[styles.cardFooter, { borderTopColor: cardBorder }]}>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            Submitted {formatSubmittedAt(bid.created_at)}
          </Text>
          {trip && onViewTrip && ctaLabel ? (
            <Pressable
              onPress={() => onViewTrip(trip.id)}
              hitSlop={8}
              style={({ pressed }) => [styles.viewTrip, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={[styles.viewTripText, { color: colors.emerald }]}>{ctaLabel}</Text>
              <ChevronRight size={12} color={colors.emerald} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: { gap: 7 },
  sectionCards: { gap: 8 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.55,
    lineHeight: 13,
    includeFontPadding: false,
  },
  card: {
    position: 'relative',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardAwarded: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardBody: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    paddingLeft: 14,
    gap: 4,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 22,
  },
  amount: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.25,
    lineHeight: 20,
    includeFontPadding: false,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    lineHeight: 13,
    includeFontPadding: false,
  },
  jobKicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    lineHeight: 13,
    includeFontPadding: false,
  },
  route: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: 16,
    includeFontPadding: false,
  },
  note: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
    includeFontPadding: false,
  },
  noteEmphasis: { fontWeight: '600' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 13,
    includeFontPadding: false,
  },
  viewTrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    flexShrink: 0,
  },
  viewTripText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    includeFontPadding: false,
  },
  empty: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 6,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.15 },
  emptyBody: { fontSize: 12, lineHeight: 17 },
  errorText: { color: Theme.negative, fontSize: 12, fontWeight: '600' },
});
