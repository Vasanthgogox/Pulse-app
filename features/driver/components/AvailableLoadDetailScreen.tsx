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
import {
  fleetOwnerLoadDisplayId,
  fleetOwnerLoadRouteLabel,
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
  ownerVehicleSubtitle,
  ownerVehicleTitle,
} from '@/features/driver/services/ownerVehicles.service';
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
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
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
  const inputBg = isDark ? colors.surfaceElevated : Theme.surfaceGray;
  const rate = load ? formatFleetOwnerRateOffer(load.rate_offer) : null;

  // amountText holds digits only -- see handleAmountChange. The input's displayed `value` is a
  // separately-computed formatted string (formatMarketBidAmount), so the RPC always gets a clean
  // number regardless of what's shown on screen.
  const parsedAmount = amountText ? Number(amountText) : NaN;
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  /**
   * Strips anything that isn't a digit on every change -- covers typed input AND pasted text
   * identically, since paste fires this same handler with the full new value. Non-numeric
   * characters never make it into state, so there's nothing left to validate away later; the
   * only remaining invalid state is "empty" or "0", both handled by amountValid.
   */
  const handleAmountChange = (text: string) => {
    setAmountText(text.replace(/[^0-9]/g, ''));
  };

  const handleSubmitBid = async () => {
    if (!amountValid) {
      setSubmitError('Enter a bid amount greater than ₹0.');
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const { error: bidError } = await submitMarketBid({
        indentId,
        amount: parsedAmount,
        note,
        ownerVehicleId: vehicleId,
      });
      if (bidError) {
        setSubmitError(formatMarketBidSubmitError(bidError.message));
        return;
      }
      setJustSubmitted(true);
      invalidateMyBid();
      invalidateMyBids();
    } finally {
      setBusy(false);
    }
  };

  const openAwardedJob = (trip: DriverTripRow) => {
    // Assigned / in-progress Market awards surface as JobRequestCard on Dashboard.
    // Terminal trips open History detail.
    if (isAssignedNotStarted(trip.status) || isActiveMission(trip.status)) {
      router.replace(ROUTES.DRIVER_ROOT as Href);
      return;
    }
    router.push(`/(driver)/trip-history/${trip.id}` as Href);
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
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <Text style={[styles.eyebrow, { color: colors.emerald }]}>
              {fleetOwnerLoadDisplayId(load)} · OPEN
            </Text>
            <Text style={[styles.route, { color: colors.text }]}>
              {fleetOwnerLoadRouteLabel(load)}
            </Text>
            <Text style={[styles.rate, { color: Theme.warning }]}>
              {rate ?? 'Rate on request'}
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {[
                load.vehicle_type?.trim() || 'Vehicle TBA',
                load.load_type?.trim() || null,
                load.pickup_date
                  ? new Date(load.pickup_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Date TBA',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {load.creator_organization_name ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                Posted by {load.creator_organization_name}
              </Text>
            ) : null}
            {compatible ? (
              <Text style={[styles.fit, { color: colors.emerald }]}>
                Compatible with a vehicle in My Fleet
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            {bidLoading ? (
              <ActivityIndicator color={colors.emerald} />
            ) : myBid || justSubmitted ? (
              <>
                <Text style={[styles.section, { color: colors.text }]}>Your bid</Text>
                <Text style={[styles.rate, { color: Theme.warning }]}>
                  {formatMarketBidAmount(myBid?.amount) || amountText}
                </Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {myBid ? marketBidStatusLabel(myBid.status) : 'Submitted — awaiting the business.'}
                </Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  Winning still requires the business to accept your bid — the
                  Driver App never creates trips or indents directly.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.section, { color: colors.text }]}>Bid</Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  Winning still requires the business to accept your bid — the
                  Driver App never creates trips or indents directly.
                </Text>
                {feeConfigActive ? (
                  <Text style={[styles.body, { color: colors.textMuted }]}>
                    If your bid is awarded, you will pay the Marketplace fee to
                    Pulse separately. The client will pay you the full bid amount.
                  </Text>
                ) : null}

                <Text style={[styles.label, { color: colors.textMuted }]}>
                  Your amount
                </Text>
                <TextInput
                  value={amountText ? formatMarketBidAmount(parsedAmount) : ''}
                  onChangeText={handleAmountChange}
                  placeholder={rate ? `e.g. ${rate}` : 'e.g. ₹18,500'}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: inputBg,
                      borderColor: amountText.length > 0 && !amountValid ? Theme.negative : cardBorder,
                    },
                  ]}
                />
                {amountText.length > 0 && !amountValid ? (
                  <Text style={styles.error}>Enter a bid amount greater than ₹0.</Text>
                ) : null}

                <Text style={[styles.label, { color: colors.textMuted, marginTop: 10 }]}>
                  Note (optional)
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Anything the business should know"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[
                    styles.input,
                    styles.noteInput,
                    { color: colors.text, backgroundColor: inputBg, borderColor: cardBorder },
                  ]}
                />

                {activeVehicles.length > 0 ? (
                  <>
                    <Text style={[styles.label, { color: colors.textMuted, marginTop: 10 }]}>
                      Vehicle (optional)
                    </Text>
                    <View style={styles.vehicleList}>
                      {activeVehicles.map((v) => {
                        const on = vehicleId === v.id;
                        return (
                          <Pressable
                            key={v.id}
                            onPress={() => setVehicleId(on ? null : v.id)}
                            style={[
                              styles.vehicleChip,
                              {
                                borderColor: on ? colors.emerald : cardBorder,
                                backgroundColor: on
                                  ? isDark
                                    ? colors.emeraldMuted
                                    : 'rgba(167,243,208,0.4)'
                                  : inputBg,
                              },
                            ]}
                          >
                            <Text style={[styles.vehicleTitle, { color: colors.text }]}>
                              {ownerVehicleTitle(v)}
                            </Text>
                            <Text style={[styles.vehicleSub, { color: colors.textMuted }]}>
                              {ownerVehicleSubtitle(v)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={[styles.hint, { color: colors.textMuted }]}>
                      {vehicleId ? 'Tap again to skip vehicle.' : 'No vehicle selected — that’s fine.'}
                    </Text>
                  </>
                ) : (
                  <View style={[styles.noVehicleWrap, { borderColor: cardBorder, backgroundColor: inputBg }]}>
                    <Text style={[styles.label, { color: colors.textMuted }]}>Vehicle</Text>
                    <Text style={[styles.body, { color: colors.textMuted }]}>
                      No active vehicles. Add or activate a vehicle to place a bid on this load.
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
                )}

                {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

                <Pressable
                  onPress={() => void handleSubmitBid()}
                  disabled={busy || !amountValid}
                  style={[
                    styles.bidCta,
                    {
                      backgroundColor: Theme.buttonPrimary,
                      borderColor: Theme.buttonPrimaryBorder,
                      opacity: busy || !amountValid ? 0.65 : 1,
                    },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={Theme.buttonPrimaryText} />
                  ) : (
                    <Text style={styles.bidCtaText}>Submit Bid</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
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
        <Text style={[styles.earningsValue, { color: Theme.warning }]}>{earnings}</Text>
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
  gateTitle: { fontSize: 17, fontWeight: '800' },
  gateBody: { fontSize: 13, lineHeight: 19 },
  jobCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  jobTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  jobShipper: { fontSize: 14, fontWeight: '700' },
  jobKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  awardedPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  awardedPillText: { fontSize: 11, fontWeight: '800', color: Theme.positive },
  routeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeCityCol: { flex: 1, minWidth: 0, gap: 2 },
  routeCityColEnd: { alignItems: 'flex-end' },
  routeCity: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  routeCityEnd: { textAlign: 'right' },
  routeMeta: { fontSize: 11, fontWeight: '600' },
  routeMetaEnd: { textAlign: 'right' },
  routeArrowWrap: { paddingHorizontal: 2 },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  earningsLabel: { fontSize: 12, fontWeight: '600' },
  earningsValue: { fontSize: 22, fontWeight: '800' },
  jobHint: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  route: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  rate: { fontSize: 24, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '600' },
  fit: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  section: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  bidDisabled: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidDisabledText: { fontSize: 14, fontWeight: '700' },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    minHeight: 40,
  },
  noteInput: { minHeight: 64, textAlignVertical: 'top' },
  vehicleList: { gap: 8 },
  vehicleChip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  vehicleTitle: { fontSize: 12, fontWeight: '700' },
  vehicleSub: { fontSize: 10, fontWeight: '500' },
  hint: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  noVehicleWrap: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 6,
  },
  manageFleetLink: { fontSize: 12, fontWeight: '700' },
  error: { fontSize: 12, fontWeight: '600', color: Theme.negative, marginTop: 8 },
  bidCta: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidCtaText: { fontSize: 14, fontWeight: '700', color: Theme.buttonPrimaryText },
});
