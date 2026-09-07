/**
 * Phase A/B — load detail with a real Bid flow (submit_market_bid).
 * Accepted bids resolve to the awarded Market trip and render as a job card
 * (same pattern as Reach awarded loads), not a dead-end "View Awards" gate.
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { MarketLoadBidSheet } from '@/features/driver/components/MarketLoadBidSheet';
import {
  fleetOwnerLoadDisplayId,
  formatFleetOwnerRateOffer,
  isLoadCompatibleWithFleet,
} from '@/features/driver/services/fleetOwnerLoads.service';
import {
  formatMarketBidAmount,
  formatMarketBidSubmitError,
  marketBidStatusLabel,
  submitMarketBid,
  type FeePaymentStatus,
} from '@/features/driver/services/marketBids.service';
import {
  calculateMarketplacePlatformFee,
  createMarketplaceFeeOrder,
  createMarketTripAfterFeePayment,
} from '@/features/network/services/marketBids.service';
import {
  RazorpayCheckoutSheet,
  type RazorpayCheckoutResult,
} from '@/features/marketplace/components/RazorpayCheckoutSheet';
import { showAppAlert } from '@/lib/appAlert';
import {
  MarketplaceRouteGrid,
  MarketplaceSpecChips,
} from '@/features/network/components/MarketplaceLoadCardChrome';
import { useFleetOwnerOpenLoadsQuery } from '@/lib/queries/useFleetOwnerOpenLoadsQuery';
import { useMyMarketAwardsQuery } from '@/lib/queries/useMyMarketAwardsQuery';
import { useMyMarketBidForIndentQuery } from '@/lib/queries/useMyMarketBidForIndentQuery';
import { useMyMarketBidsQuery } from '@/lib/queries/useMyMarketBidsQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { formatINR } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import type { DriverTripRow } from '@/types/trip-views';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function isAssignedNotStarted(status: string): boolean {
  const s = (status || '').toLowerCase();
  return s === 'assigned' || s === 'pending' || s === 'scheduled';
}

function isActiveMission(status: string): boolean {
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

function awardedEarningsLabel(trip: DriverTripRow, bidAmount: number | null | undefined): string {
  const commission = trip.driver_commission;
  if (commission != null && Number.isFinite(Number(commission)) && Number(commission) > 0) {
    return formatINR(Number(commission));
  }
  if (bidAmount != null && Number.isFinite(Number(bidAmount)) && Number(bidAmount) > 0) {
    return formatMarketBidAmount(bidAmount) || formatINR(Number(bidAmount));
  }
  if (trip.client_price != null && Number.isFinite(Number(trip.client_price))) {
    return formatINR(Number(trip.client_price));
  }
  return 'Rate on request';
}

export default function AvailableLoadDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const params = useLocalSearchParams<{ indentId?: string | string[] }>();
  const raw = Array.isArray(params.indentId) ? params.indentId[0] : params.indentId;
  const indentId = raw?.trim() || '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { loads, isLoading, error } = useFleetOwnerOpenLoadsQuery(uid);
  const { vehicles } = useOwnerVehiclesQuery(uid);
  const {
    bid: myBid,
    isLoading: bidLoading,
    invalidate: invalidateMyBid,
  } = useMyMarketBidForIndentQuery(indentId, uid);
  const { invalidate: invalidateMyBids } = useMyMarketBidsQuery(uid);
  const {
    awards,
    isLoading: awardsLoading,
    invalidate: invalidateAwards,
  } = useMyMarketAwardsQuery(uid);

  const [bidSheetOpen, setBidSheetOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // A8.6.2 — only show the fee disclosure while a Marketplace fee config is
  // actually active; don't warn pilot users about a hypothetical charge
  // while the fee stays off. Checked once per screen visit, not per keystroke.
  const [feeConfigActive, setFeeConfigActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void calculateMarketplacePlatformFee(1).then(({ calc }) => {
      if (!cancelled) setFeeConfigActive(Boolean(calc?.is_active_config_found));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A8.7 — Marketplace fee checkout state for this bid.
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<{
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
  } | null>(null);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);

  const handlePay = async () => {
    if (!myBid || isStartingPayment) return;
    setIsStartingPayment(true);
    try {
      const { error, order } = await createMarketplaceFeeOrder(myBid.id);
      if (error || !order) {
        showAppAlert('Could not start payment', error?.message ?? 'Please try again.');
        return;
      }
      setCheckoutOrder(order);
    } finally {
      setIsStartingPayment(false);
    }
  };

  // A8.7: the checkout sheet's own result is advisory only, used to decide
  // when to close it and refetch -- only a server-confirmed
  // fee_payment_status (via the webhook) is ever treated as proof of
  // payment. Once that refetch shows 'paid', the driver's own app (as the
  // bidder) triggers create_market_trip_after_fee_payment() -- nothing
  // else in this flow does so for the DCO branch.
  const handleCheckoutClose = (_result: RazorpayCheckoutResult) => {
    setCheckoutOrder(null);
    invalidateMyBid();
    invalidateMyBids();
  };

  const load = useMemo(
    () => loads.find((l) => l.id === indentId) ?? null,
    [loads, indentId],
  );
  const awardedTrip = useMemo(() => {
    if (!indentId) return null;
    let best: DriverTripRow | null = null;
    for (const trip of awards) {
      if (trip.indent_id !== indentId && trip.source_indent_id !== indentId) continue;
      if (!best || (best.status === 'cancelled' && trip.status !== 'cancelled')) {
        best = trip;
      }
    }
    return best;
  }, [awards, indentId]);

  // A8.7: once a refetch shows the fee paid, the driver's own app (as the
  // bidder) triggers create_market_trip_after_fee_payment() -- nothing
  // else in this flow does so for the DCO branch. The RPC itself is
  // idempotent (safe if this fires more than once), and isCreatingTrip
  // guards against overlapping calls from rapid refetches.
  useEffect(() => {
    if (!myBid || myBid.status !== 'accepted' || myBid.fee_payment_status !== 'paid') return;
    if (awardedTrip) return; // trip already exists
    if (isCreatingTrip) return;
    setIsCreatingTrip(true);
    void createMarketTripAfterFeePayment(myBid.id)
      .then(({ error }) => {
        if (error) {
          console.warn('[AvailableLoadDetailScreen] createMarketTripAfterFeePayment failed:', error.message);
          return;
        }
        invalidateAwards();
        invalidateMyBid();
      })
      .finally(() => setIsCreatingTrip(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBid?.id, myBid?.status, myBid?.fee_payment_status, awardedTrip]);
  const compatible = useMemo(
    () =>
      load
        ? isLoadCompatibleWithFleet(
            load,
            vehicles.map((v) => v.vehicle_type),
          )
        : false,
    [load, vehicles],
  );
  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.status === 'active'),
    [vehicles],
  );

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';
  const rate = load ? formatFleetOwnerRateOffer(load.rate_offer) : null;
  const targetRateInr =
    load?.rate_offer != null && Number.isFinite(Number(load.rate_offer))
      ? Number(load.rate_offer)
      : null;

  const handleSubmitAmount = useCallback(
    async (amountInr: number) => {
      setSubmitError(null);
      const preferredVehicle =
        activeVehicles.find((v) =>
          load ? isLoadCompatibleWithFleet(load, [v.vehicle_type]) : false,
        ) ?? activeVehicles[0];
      const { error: bidError } = await submitMarketBid({
        indentId,
        amount: amountInr,
        note: '',
        ownerVehicleId: preferredVehicle?.id ?? null,
      });
      if (bidError) {
        setSubmitError(formatMarketBidSubmitError(bidError.message));
        return false;
      }
      invalidateMyBid();
      invalidateMyBids();
      return true;
    },
    [activeVehicles, indentId, invalidateMyBid, invalidateMyBids, load],
  );

  const openAwardedJob = (trip: DriverTripRow) => {
    // Assigned / in-progress Market awards surface as JobRequestCard on Dashboard.
    // Terminal trips open History detail.
    if (isAssignedNotStarted(trip.status) || isActiveMission(trip.status)) {
      router.replace(ROUTES.DRIVER_ROOT as Href);
      return;
    }
    router.push(`/driver-trip/${trip.id}` as Href);
  };

  const showAwardedJobCard = myBid?.status === 'accepted' && !error;

  useEffect(() => {
    if (!showAwardedJobCard || !awardedTrip) return;
    if (isAssignedNotStarted(awardedTrip.status) || isActiveMission(awardedTrip.status)) {
      router.replace(ROUTES.DRIVER_ROOT as Href);
    }
  }, [showAwardedJobCard, awardedTrip, router]);

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="Load detail"
        subtitle="Market"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(ROUTES.driverAvailableLoads())
        }
      />

      {isLoading || bidLoading || (showAwardedJobCard && awardsLoading && !awardedTrip) ? (
        <ActivityIndicator color={colors.emerald} style={{ marginTop: 40 }} />
      ) : showAwardedJobCard ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            paddingTop: 12,
            gap: 12,
          }}
        >
          <AwardedMarketJobCard
            trip={awardedTrip}
            bidAmount={myBid?.amount}
            feePaymentStatus={myBid?.fee_payment_status ?? 'not_required'}
            platformFeeAmount={myBid?.platform_fee_amount ?? null}
            shipperName={load?.creator_organization_name ?? awardedTrip?.organization_name ?? null}
            isDark={isDark}
            colors={colors}
            onOpenJob={() => {
              if (awardedTrip) openAwardedJob(awardedTrip);
              else router.replace(ROUTES.DRIVER_ROOT as Href);
            }}
            onPay={handlePay}
            isStartingPayment={isStartingPayment}
          />
          {checkoutOrder ? (
            <RazorpayCheckoutSheet
              visible
              orderId={checkoutOrder.orderId}
              amount={checkoutOrder.amount}
              currency={checkoutOrder.currency}
              keyId={checkoutOrder.keyId}
              description="Marketplace fee"
              onClose={handleCheckoutClose}
            />
          ) : null}
        </ScrollView>
      ) : error || !load ? (
        <View style={styles.gate}>
          <Text style={[styles.gateTitle, { color: colors.text }]}>
            {myBid?.status === 'rejected'
              ? 'Not selected'
              : myBid?.status === 'superseded'
                ? 'Bid superseded'
                : 'Load unavailable'}
          </Text>
          <Text style={[styles.gateBody, { color: colors.textMuted }]}>
            {error instanceof Error
              ? error.message
              : myBid?.status === 'rejected'
                ? 'The business selected another bid for this load.'
                : myBid?.status === 'superseded'
                  ? 'Another load was awarded to you, so this bid is no longer active.'
                  : 'It may have closed or been awarded.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            paddingTop: 12,
            gap: 12,
          }}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: isDark ? colors.surface : Theme.cardWhite, borderColor: cardBorder },
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.eyebrow, { color: colors.emerald }]} numberOfLines={1}>
                {fleetOwnerLoadDisplayId(load)} · Open
              </Text>
              {compatible ? (
                <View
                  style={[
                    styles.fitPill,
                    {
                      backgroundColor: isDark
                        ? Theme.positiveMutedDark
                        : 'rgba(21,128,61,0.1)',
                    },
                  ]}
                >
                  <Text style={[styles.fitPillText, { color: colors.emerald }]}>Fleet fit</Text>
                </View>
              ) : null}
            </View>

            {load.creator_organization_name ? (
              <Text style={[styles.shipper, { color: colors.textMuted }]} numberOfLines={1}>
                {load.creator_organization_name}
              </Text>
            ) : null}

            <MarketplaceRouteGrid pickup={load.pickup_area} drop={load.drop_location} />
            <MarketplaceSpecChips
              chips={[
                load.vehicle_type?.trim(),
                load.load_type?.trim(),
              ].filter((v): v is string => Boolean(v))}
              dateLabel={
                load.pickup_date
                  ? new Date(load.pickup_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : null
              }
            />

            <View style={[styles.rateRow, { borderTopColor: cardBorder }]}>
              <Text style={[styles.rateLabel, { color: colors.textMuted }]}>Target rate</Text>
              <Text
                style={[styles.rate, { color: rate ? Theme.accentBrownDeep : colors.textMuted }]}
                numberOfLines={1}
              >
                {rate ?? 'On request'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: isDark ? colors.surface : Theme.cardWhite, borderColor: cardBorder },
            ]}
          >
            {bidLoading ? (
              <ActivityIndicator color={colors.emerald} />
            ) : myBid ? (
              <>
                <Text style={[styles.section, { color: colors.text }]}>Your bid</Text>
                <View style={styles.submittedBidRow}>
                  <Text style={[styles.rateLabel, { color: colors.textMuted }]}>Amount</Text>
                  <Text style={[styles.rate, { color: Theme.accentBrownDeep }]}>
                    {formatMarketBidAmount(myBid.amount)}
                  </Text>
                </View>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {marketBidStatusLabel(myBid.status)}
                </Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  Winning still requires the business to accept your bid — the Driver App never
                  creates trips or indents directly.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.section, { color: colors.text }]}>Bid on this load</Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  Enter your amount on the next screen. Winning still requires the business to
                  accept your bid.
                </Text>
                {feeConfigActive ? (
                  <Text style={[styles.body, { color: colors.textMuted }]}>
                    If awarded, you will pay the Marketplace fee to Pulse separately. The client
                    pays you the full bid amount.
                  </Text>
                ) : null}

                {activeVehicles.length === 0 ? (
                  <View
                    style={[
                      styles.noVehicleWrap,
                      { borderColor: cardBorder, backgroundColor: Theme.surfaceGray },
                    ]}
                  >
                    <Text style={[styles.label, { color: colors.textMuted }]}>Vehicle required</Text>
                    <Text style={[styles.body, { color: colors.textMuted }]}>
                      Add or activate a vehicle in My Fleet before placing a bid.
                    </Text>
                    <Pressable
                      onPress={() =>
                        router.push(ROUTES.driverMyFleet() as Parameters<typeof router.push>[0])
                      }
                      hitSlop={6}
                    >
                      <Text style={[styles.manageFleetLink, { color: colors.emerald }]}>
                        Manage my fleet
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setSubmitError(null);
                      setBidSheetOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.bidCta,
                      {
                        backgroundColor: Theme.buttonPrimary,
                        borderColor: Theme.buttonPrimaryBorder,
                        opacity: pressed ? 0.88 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.bidCtaText}>Place bid</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>

          <MarketLoadBidSheet
            visible={bidSheetOpen && !!load}
            onClose={() => setBidSheetOpen(false)}
            onSubmitAmount={handleSubmitAmount}
            shipperName={load?.creator_organization_name}
            pickup={load?.pickup_area}
            drop={load?.drop_location}
            vehicleType={load?.vehicle_type}
            loadType={load?.load_type}
            targetRateInr={targetRateInr}
            indentDisplayId={load ? fleetOwnerLoadDisplayId(load) : null}
            validationError={submitError ?? undefined}
            onClearValidationError={() => setSubmitError(null)}
          />
        </ScrollView>
      )}
    </View>
  );
}

function feePendingHint(status: FeePaymentStatus, feeAmount: number | null): string {
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

function AwardedMarketJobCard({
  trip,
  bidAmount,
  feePaymentStatus,
  platformFeeAmount,
  shipperName,
  isDark,
  colors,
  onOpenJob,
  onPay,
  isStartingPayment,
}: {
  trip: DriverTripRow | null;
  bidAmount: number | null | undefined;
  feePaymentStatus: FeePaymentStatus;
  platformFeeAmount: number | null;
  shipperName?: string | null;
  isDark: boolean;
  colors: ReturnType<typeof useDriverThemeColors>;
  onOpenJob: () => void;
  onPay?: () => void;
  isStartingPayment?: boolean;
}) {
  const pickup = trip?.pickup_location?.trim() || 'Pickup';
  const drop = trip?.dropoff_location?.trim() || 'Drop';
  const earnings = trip
    ? awardedEarningsLabel(trip, bidAmount)
    : formatMarketBidAmount(bidAmount) || 'Rate on request';
  // A8.6.2 fix: !trip no longer means "still connecting" -- once the
  // Marketplace fee gates trip creation, an accepted-but-unpaid bid stays
  // trip-less indefinitely, so the old unconditional "Connecting your
  // awarded job…" would spin forever. Branch on the actual fee state.
  const feePending = feePaymentStatus !== 'paid' && feePaymentStatus !== 'not_required';
  const statusHint = !trip
    ? feePending
      ? feePendingHint(feePaymentStatus, platformFeeAmount)
      : 'Connecting your awarded job…'
    : isAssignedNotStarted(trip.status)
      ? 'Opening on Dashboard…'
      : isActiveMission(trip.status)
        ? 'In progress — opening Dashboard…'
        : trip.status === 'completed'
          ? 'Completed'
          : marketBidStatusLabel('accepted');

  return (
    <View
      style={[
        styles.jobCard,
        {
          backgroundColor: isDark ? colors.surface : Theme.positiveMuted,
          borderColor: Theme.darkGreen ?? colors.emerald,
        },
      ]}
    >
      <View style={styles.jobTop}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {shipperName ? (
            <Text style={[styles.jobShipper, { color: colors.text }]} numberOfLines={1}>
              {shipperName}
            </Text>
          ) : null}
          <Text style={[styles.jobKicker, { color: colors.emerald }]}>Job · Awarded</Text>
        </View>
        <View style={styles.awardedPill}>
          <Text style={styles.awardedPillText}>Awarded</Text>
        </View>
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeCityCol}>
          <Text style={[styles.routeCity, { color: colors.text }]} numberOfLines={1}>
            {pickup}
          </Text>
          <Text style={[styles.routeMeta, { color: colors.textMuted }]}>Pickup</Text>
        </View>
        <View style={styles.routeArrowWrap}>
          <ArrowRight size={14} color={colors.textMuted} strokeWidth={2.2} />
        </View>
        <View style={[styles.routeCityCol, styles.routeCityColEnd]}>
          <Text style={[styles.routeCity, styles.routeCityEnd, { color: colors.text }]} numberOfLines={1}>
            {drop}
          </Text>
          <Text style={[styles.routeMeta, styles.routeMetaEnd, { color: colors.textMuted }]}>
            Drop
          </Text>
        </View>
      </View>

      <View style={styles.earningsRow}>
        <Text style={[styles.earningsLabel, { color: colors.textMuted }]}>Your payout</Text>
        <Text style={[styles.earningsValue, { color: Theme.accentBrownDeep }]}>{earnings}</Text>
      </View>

      <Text style={[styles.jobHint, { color: colors.textMuted }]}>{statusHint}</Text>

      {/* A8.7: required/failed get a real "Pay" trigger. pending (a
          checkout already in flight, awaiting the webhook) stays
          non-interactive -- retrying while a payment may still confirm
          would start a second, unnecessary attempt. */}
      {!trip && feePending && (feePaymentStatus === 'required' || feePaymentStatus === 'failed') && onPay ? (
        <Pressable
          onPress={onPay}
          disabled={isStartingPayment}
          style={({ pressed }) => [
            styles.bidCta,
            {
              backgroundColor: Theme.buttonPrimary,
              borderColor: Theme.buttonPrimaryBorder,
              opacity: pressed || isStartingPayment ? 0.85 : 1,
              marginTop: 4,
            },
          ]}
        >
          <Text style={styles.bidCtaText}>
            {isStartingPayment ? 'Starting…' : `Pay ${formatMarketBidAmount(platformFeeAmount) || 'fee'}`}
          </Text>
        </Pressable>
      ) : !trip && feePending ? (
        <View
          style={[
            styles.bidCta,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
          ]}
        >
          <Text style={[styles.bidCtaText, { color: colors.textMuted }]}>Awaiting payment</Text>
        </View>
      ) : (
        <Pressable
          onPress={onOpenJob}
          style={({ pressed }) => [
            styles.bidCta,
            {
              backgroundColor: Theme.buttonPrimary,
              borderColor: Theme.buttonPrimaryBorder,
              opacity: pressed ? 0.88 : 1,
              marginTop: 4,
            },
          ]}
        >
          <Text style={styles.bidCtaText}>Open job</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: { padding: 20, gap: 8 },
  gateTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.15 },
  gateBody: { fontSize: 12, lineHeight: 17 },
  jobCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  jobTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  jobShipper: { fontSize: 12, fontWeight: '700' },
  jobKicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    lineHeight: 13,
  },
  awardedPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  awardedPillText: { fontSize: 10, fontWeight: '700', color: Theme.positive },
  routeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeCityCol: { flex: 1, minWidth: 0, gap: 2 },
  routeCityColEnd: { alignItems: 'flex-end' },
  routeCity: { fontSize: 13, fontWeight: '700', letterSpacing: -0.15, lineHeight: 17 },
  routeCityEnd: { textAlign: 'right' },
  routeMeta: { fontSize: 10, fontWeight: '600' },
  routeMetaEnd: { textAlign: 'right' },
  routeArrowWrap: { paddingHorizontal: 2 },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  earningsLabel: { fontSize: 11, fontWeight: '600' },
  earningsValue: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  jobHint: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eyebrow: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    lineHeight: 13,
    includeFontPadding: false,
  },
  shipper: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    lineHeight: 13,
    includeFontPadding: false,
  },
  fitPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  fitPillText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    includeFontPadding: false,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submittedBidRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  rateLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    lineHeight: 12,
    includeFontPadding: false,
  },
  rate: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.25,
    lineHeight: 19,
    includeFontPadding: false,
  },
  section: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 17,
  },
  body: { fontSize: 11, lineHeight: 16, fontWeight: '500' },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    lineHeight: 13,
    includeFontPadding: false,
  },
  noVehicleWrap: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
    gap: 6,
  },
  manageFleetLink: { fontSize: 11, fontWeight: '700' },
  bidCta: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    letterSpacing: -0.1,
  },
});
