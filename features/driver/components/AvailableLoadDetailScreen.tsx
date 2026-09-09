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
import { DriverWorkOpportunityCard } from '@/features/driver/components/DriverWorkOpportunityCard';
import { MarketLoadBidSheet } from '@/features/driver/components/MarketLoadBidSheet';
import { RazorpayTestPreviewSheet } from '@/features/driver/components/RazorpayTestPreviewSheet';
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
  createTestMarketplaceFeeOrder,
  simulateTestMarketplaceFeePayment,
  type TestMarketplaceFeeProvider,
} from '@/features/network/services/marketBids.service';
import {
  RazorpayCheckoutSheet,
  type RazorpayCheckoutResult,
} from '@/features/marketplace/components/RazorpayCheckoutSheet';
import { showAppAlert } from '@/lib/appAlert';
import { useFleetOwnerOpenLoadsQuery } from '@/lib/queries/useFleetOwnerOpenLoadsQuery';
import { useMyMarketAwardsQuery } from '@/lib/queries/useMyMarketAwardsQuery';
import { useMyMarketBidForIndentQuery } from '@/lib/queries/useMyMarketBidForIndentQuery';
import { useMyMarketBidsQuery } from '@/lib/queries/useMyMarketBidsQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { formatINR } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import type { DriverTripRow } from '@/types/trip-views';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
  const params = useLocalSearchParams<{ indentId?: string | string[]; bid?: string | string[] }>();
  const raw = Array.isArray(params.indentId) ? params.indentId[0] : params.indentId;
  const indentId = raw?.trim() || '';
  const bidParam = Array.isArray(params.bid) ? params.bid[0] : params.bid;
  const wantBidSheet = bidParam === '1' || bidParam === 'true';
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
  const openedBidFromQuery = useRef(false);
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

  // A10.2 — PILOT/TEST ONLY payment methods, alongside real Razorpay.
  // Gated server-side (MARKETPLACE_TEST_PAYMENTS_ENABLED); this UI only
  // makes the pilot options visible and clearly labeled, never the
  // security boundary itself. Remove this block along with the edge
  // function once the pilot's temporary payment methods are retired.
  const [methodSheetOpen, setMethodSheetOpen] = useState(false);
  const [testOrder, setTestOrder] = useState<{ provider: TestMarketplaceFeeProvider; amount: number } | null>(null);
  const [isStartingTestPayment, setIsStartingTestPayment] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleStartTestPayment = async (provider: TestMarketplaceFeeProvider) => {
    if (!myBid || isStartingTestPayment) return;
    setIsStartingTestPayment(true);
    try {
      const { error, order } = await createTestMarketplaceFeeOrder(myBid.id, provider);
      if (error || !order) {
        showAppAlert('Could not start payment', error?.message ?? 'Please try again.');
        return;
      }
      setMethodSheetOpen(false);
      setTestOrder({ provider, amount: order.amount });
    } finally {
      setIsStartingTestPayment(false);
    }
  };

  const handleSimulateOutcome = async (outcome: 'paid' | 'failed') => {
    if (!myBid || isSimulating) return;
    setIsSimulating(true);
    try {
      const { error } = await simulateTestMarketplaceFeePayment(myBid.id, outcome);
      if (error) {
        showAppAlert('Simulation failed', error.message);
        return;
      }
    } finally {
      setIsSimulating(false);
      setTestOrder(null);
      invalidateMyBid();
      invalidateMyBids();
    }
  };

  // A10.2 — used only by RazorpayTestPreviewSheet (the "Razorpay Test
  // Preview" picker option). Same underlying call as handleSimulateOutcome
  // above, but does NOT clear testOrder itself -- the preview sheet stays
  // open to show its own success/failure screen and closes only when the
  // user dismisses it (see onDismiss below).
  const handlePreviewOutcome = async (outcome: 'paid' | 'failed'): Promise<{ error: Error | null }> => {
    if (!myBid) return { error: new Error('No active bid') };
    const { error } = await simulateTestMarketplaceFeePayment(myBid.id, outcome);
    if (!error) {
      invalidateMyBid();
      invalidateMyBids();
    }
    return { error };
  };

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
      if (!indentId) {
        setSubmitError('This load could not be found. Go back and try again.');
        return false;
      }
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
    if (openedBidFromQuery.current) return;
    if (!wantBidSheet || isLoading || bidLoading) return;
    if (!load || showAwardedJobCard) return;
    if (myBid && myBid.status !== 'pending') return;
    if (activeVehicles.length === 0) return;
    openedBidFromQuery.current = true;
    setSubmitError(null);
    setBidSheetOpen(true);
  }, [
    wantBidSheet,
    isLoading,
    bidLoading,
    load,
    showAwardedJobCard,
    myBid,
    activeVehicles.length,
  ]);

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
            orgLogoUrl={load?.creator_organization_logo_url}
            orgAvatarSeed={load?.creator_organization_avatar_seed}
            orgSeed={load?.creator_organization_id}
            vehicleType={load?.vehicle_type}
            material={load?.load_type}
            pickupDate={load?.pickup_date ?? awardedTrip?.pickup_scheduled_at}
            onOpenJob={() => {
              if (awardedTrip) openAwardedJob(awardedTrip);
              else router.replace(ROUTES.DRIVER_ROOT as Href);
            }}
            onPay={() => setMethodSheetOpen(true)}
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
          <PilotPaymentMethodSheet
            visible={methodSheetOpen}
            busy={isStartingPayment || isStartingTestPayment}
            onClose={() => setMethodSheetOpen(false)}
            onRazorpay={() => {
              setMethodSheetOpen(false);
              void handlePay();
            }}
            onTestProvider={(provider) => void handleStartTestPayment(provider)}
          />
          <RazorpayTestPreviewSheet
            order={testOrder?.provider === 'test_online' ? { amount: testOrder.amount } : null}
            onOutcome={handlePreviewOutcome}
            onDismiss={() => setTestOrder(null)}
          />
          <PilotTestCheckoutSheet
            order={testOrder?.provider === 'cash' ? testOrder : null}
            busy={isSimulating}
            onCancel={() => setTestOrder(null)}
            onOutcome={(outcome) => void handleSimulateOutcome(outcome)}
          />
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
          <DriverWorkOpportunityCard
            orgName={(load.creator_organization_name ?? '').trim() || 'Shipper'}
            orgLogoUrl={load.creator_organization_logo_url}
            orgAvatarSeed={load.creator_organization_avatar_seed}
            orgSeed={load.creator_organization_id ?? load.id}
            kicker={
              myBid
                ? myBid.status === 'pending'
                  ? 'Quoted bid'
                  : marketBidStatusLabel(myBid.status)
                : 'Market'
            }
            badge={myBid?.status === 'pending' ? 'quoted' : 'open'}
            origin={load.pickup_area}
            destination={load.drop_location}
            vehicleType={load.vehicle_type}
            material={load.load_type}
            pickupDate={load.pickup_date}
            fleetMatch={compatible}
            targetLabel="Shipper target"
            targetValue={rate}
            primaryCta={
              activeVehicles.length === 0
                ? {
                    title: 'Add a vehicle',
                    hint: 'Required before bidding',
                    onPress: () =>
                      router.push(ROUTES.driverMyFleet() as Parameters<typeof router.push>[0]),
                  }
                : myBid
                  ? {
                      title: 'Revise bid',
                      hint: `Your bid ${formatMarketBidAmount(myBid.amount)}`,
                      variant: 'quoted',
                      onPress: () => {
                        setSubmitError(null);
                        setBidSheetOpen(true);
                      },
                    }
                  : {
                      title: 'Bid Now',
                      hint: rate ? `Shipper target ${rate}` : 'Offer your rate to the shipper',
                      onPress: () => {
                        setSubmitError(null);
                        setBidSheetOpen(true);
                      },
                    }
            }
          />

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
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      )}
      {load && !showAwardedJobCard ? (
        <MarketLoadBidSheet
          visible={bidSheetOpen}
          onClose={() => setBidSheetOpen(false)}
          onSubmitAmount={handleSubmitAmount}
          shipperName={load.creator_organization_name}
          pickup={load.pickup_area}
          drop={load.drop_location}
          vehicleType={load.vehicle_type}
          loadType={load.load_type}
          targetRateInr={targetRateInr}
          indentDisplayId={fleetOwnerLoadDisplayId(load)}
          validationError={submitError ?? undefined}
          onClearValidationError={() => setSubmitError(null)}
        />
      ) : null}
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
  orgLogoUrl,
  orgAvatarSeed,
  orgSeed,
  vehicleType,
  material,
  pickupDate,
  onOpenJob,
  onPay,
  isStartingPayment,
}: {
  trip: DriverTripRow | null;
  bidAmount: number | null | undefined;
  feePaymentStatus: FeePaymentStatus;
  platformFeeAmount: number | null;
  shipperName?: string | null;
  orgLogoUrl?: string | null;
  orgAvatarSeed?: string | null;
  orgSeed?: string | null;
  vehicleType?: string | null;
  material?: string | null;
  pickupDate?: string | null;
  onOpenJob: () => void;
  onPay?: () => void;
  isStartingPayment?: boolean;
}) {
  const pickup = trip?.pickup_location?.trim() || 'Pickup';
  const drop = trip?.dropoff_location?.trim() || 'Drop';
  const earnings = trip
    ? awardedEarningsLabel(trip, bidAmount)
    : formatMarketBidAmount(bidAmount) || 'Rate on request';
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

  const payReady =
    !trip && feePending && (feePaymentStatus === 'required' || feePaymentStatus === 'failed') && onPay;
  const awaitingPayment = !trip && feePending && !payReady;

  return (
    <DriverWorkOpportunityCard
      orgName={(shipperName ?? '').trim() || 'Shipper'}
      orgLogoUrl={orgLogoUrl}
      orgAvatarSeed={orgAvatarSeed}
      orgSeed={orgSeed ?? trip?.id ?? shipperName}
      kicker={
        feePending
          ? 'Job · Payment required'
          : trip?.status === 'completed'
            ? 'Job · Completed'
            : 'Job · Awarded'
      }
      badge="awarded"
      origin={pickup}
      destination={drop}
      vehicleType={vehicleType}
      material={material}
      pickupDate={pickupDate}
      targetLabel="Your payout"
      targetValue={earnings}
      extra={<Text style={[styles.jobHint, { color: Theme.textMuted }]}>{statusHint}</Text>}
      primaryCta={
        payReady
          ? {
              title: isStartingPayment
                ? 'Starting…'
                : `Pay ${formatMarketBidAmount(platformFeeAmount) || 'fee'}`,
              hint: feePendingHint(feePaymentStatus, platformFeeAmount),
              onPress: onPay!,
            }
          : awaitingPayment
            ? {
                title: 'Awaiting payment',
                variant: 'info',
                onPress: onOpenJob,
              }
            : {
                title: 'Open job',
                hint: 'Continue on Dashboard',
                onPress: onOpenJob,
              }
      }
    />
  );
}

/**
 * A10.2 — PILOT/TEST ONLY. Lets the bidder pick real Razorpay or one of the
 * two pilot test methods for the Marketplace fee. The methods are clearly
 * labeled; the real protection is the server-side
 * MARKETPLACE_TEST_PAYMENTS_ENABLED gate in the marketplace-test-payment
 * edge function, not this UI. Remove once the pilot's temporary payment
 * methods are retired.
 */
function PilotPaymentMethodSheet({
  visible,
  busy,
  onClose,
  onRazorpay,
  onTestProvider,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onRazorpay: () => void;
  onTestProvider: (provider: TestMarketplaceFeeProvider) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pilotStyles.overlay}>
        <View style={pilotStyles.sheet}>
          <Text style={pilotStyles.title}>Pay Marketplace fee</Text>
          <Pressable disabled={busy} onPress={onRazorpay} style={pilotStyles.option}>
            <Text style={pilotStyles.optionText}>Pay Online</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={() => onTestProvider('test_online')} style={pilotStyles.option}>
            <Text style={pilotStyles.optionText}>Razorpay Test Preview</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={() => onTestProvider('cash')} style={pilotStyles.option}>
            <Text style={pilotStyles.optionText}>Cash — Pilot/Test only</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={onClose} style={pilotStyles.cancel}>
            <Text style={pilotStyles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * A10.2 — PILOT/TEST ONLY fake checkout. For "cash", the bidder self-attests
 * payment (Confirm cash paid); for "test_online", the bidder simulates the
 * outcome a real gateway would return. Either way this only ever calls
 * simulateTestMarketplaceFeePayment(bidId, outcome) -- it never supplies an
 * amount, and the actual state transition still happens inside the
 * unmodified confirm_marketplace_fee_payment() RPC.
 */
function PilotTestCheckoutSheet({
  order,
  busy,
  onCancel,
  onOutcome,
}: {
  order: { provider: TestMarketplaceFeeProvider; amount: number } | null;
  busy: boolean;
  onCancel: () => void;
  onOutcome: (outcome: 'paid' | 'failed') => void;
}) {
  if (!order) return null;
  const isCash = order.provider === 'cash';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={pilotStyles.overlay}>
        <View style={pilotStyles.sheet}>
          <Text style={pilotStyles.title}>{isCash ? 'Cash — Pilot/Test only' : 'Pay Online — Test'}</Text>
          <Text style={pilotStyles.amount}>{formatINR(order.amount)}</Text>
          {isCash ? (
            <Pressable disabled={busy} onPress={() => onOutcome('paid')} style={pilotStyles.option}>
              <Text style={pilotStyles.optionText}>Confirm cash paid</Text>
            </Pressable>
          ) : (
            <>
              <Pressable disabled={busy} onPress={() => onOutcome('paid')} style={pilotStyles.option}>
                <Text style={pilotStyles.optionText}>Simulate success</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => onOutcome('failed')} style={pilotStyles.option}>
                <Text style={pilotStyles.optionText}>Simulate failure</Text>
              </Pressable>
            </>
          )}
          <Pressable disabled={busy} onPress={onCancel} style={pilotStyles.cancel}>
            <Text style={pilotStyles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const pilotStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  amount: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  option: { paddingVertical: 14, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  optionText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  cancel: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: { padding: 20, gap: 8 },
  gateTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.15 },
  gateBody: { fontSize: 12, lineHeight: 17 },
  jobHint: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
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
});
