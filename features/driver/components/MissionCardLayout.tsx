/**
 * Presentation-only mission info block for DriverTripFlowCard's active-trip
 * view. DriverTripFlowCard remains the workflow owner (state, optimistic
 * updates, handlers, uploads, gestures) — this component owns none of that,
 * only the hero + destination section DriverTripFlowCard passes it data for.
 *
 * Deliberately does NOT show Journey Health tiers or a Timeline — those are
 * dispatch-facing platform concepts. `guidanceMessage` is pre-translated,
 * action-oriented copy (see driverAlertGuidance.util.ts) and only rendered
 * when the caller has something worth telling the driver.
 *
 * Navigate lives outside this component, directly above DriverTripFlowCard's
 * primary CTA — an always-available secondary action next to the button that
 * actually advances the trip, not buried in an info card.
 */
import Theme from '@/constants/Theme';
import { PartyAvatar } from '@/components/PartyAvatar';
import {
  FLOW_EMERALD,
  FLOW_EMERALD_DARK,
  FLOW_MINT,
  HeroAssignerBlock,
  HeroKindBadge,
  TRIP_SHEET_BODY_PAD,
  TRIP_SHEET_HERO_PAD,
} from '@/components/driver/DriverTripSheetLayout';
import type { JobCardAssignerPayload } from '@/features/trips/utils/driverAssignerDisplay.util';
import { AlertTriangle, Route, Wallet } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Hero sits slightly wider than the body content, matching the sheet spec. */
const HERO_INSET = 10;

export interface MissionCardLayoutProps {
  title: string;
  earnings: string;
  assignedBy?: JobCardAssignerPayload | null;
  showHeroAssigner: boolean;
  /** Which stop this stage is oriented toward — drives the destination heading. Null once completed. */
  target: 'pickup' | 'drop' | null;
  pickupLabel: string;
  dropLabel: string;
  /** Road distance remaining to `target`, in km — for the progress bar fill. Null when unknown. */
  remainingKm?: number | null;
  /** Total planned route distance, in km — for the progress bar fill. Null when unknown. */
  routeTotalKm?: number | null;
  /** Pre-formatted fallback/caption (e.g. "12 km to pickup") for when a numeric fraction isn't available. */
  distanceLabel: string;
  etaLabel: string;
  /** trip.client_name — already on the trip row, just not shown until now. */
  customerName?: string | null;
  /** trip.vehicle_display_number — already on the trip row. */
  vehicleNumber?: string | null;
  /** e.g. "At pickup for 12 min" — from computeTripStageMetrics(), only while a dwell is running. Replaces the distance caption when set, since a stationary driver isn't covering distance. */
  dwellLabel?: string | null;
  /** Action-oriented translation of Operational Alerts; null when nothing worth surfacing. */
  guidanceMessage?: string | null;
}

export function MissionCardLayout({
  title,
  earnings,
  assignedBy = null,
  showHeroAssigner,
  target,
  pickupLabel,
  dropLabel,
  remainingKm = null,
  routeTotalKm = null,
  distanceLabel,
  etaLabel,
  customerName = null,
  vehicleNumber = null,
  dwellLabel = null,
  guidanceMessage = null,
}: MissionCardLayoutProps) {
  const showCustomerVehicleRow = !!(customerName?.trim() || vehicleNumber?.trim());

  const destinationHeading = target === 'pickup' ? 'PICKUP AT' : target === 'drop' ? 'DELIVER TO' : null;
  const destinationLabel = target === 'pickup' ? pickupLabel : target === 'drop' ? dropLabel : null;

  const progressFraction =
    remainingKm != null && routeTotalKm != null && routeTotalKm > 0
      ? Math.min(1, Math.max(0, 1 - remainingKm / routeTotalKm))
      : null;

  const caption =
    dwellLabel ??
    [distanceLabel, etaLabel !== '—' ? `${etaLabel} remaining` : null]
      .filter(Boolean)
      .join(' • ');

  return (
    <>
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={[FLOW_EMERALD_DARK, FLOW_EMERALD]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.flowHero}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroEyebrowRow}>
              <Route size={13} color={FLOW_MINT} strokeWidth={2.5} />
              <Text style={styles.heroEyebrow}>{title.toUpperCase()}</Text>
            </View>
            {assignedBy ? (
              <HeroKindBadge kind={assignedBy.kind} label={assignedBy.kindLabel} />
            ) : null}
          </View>
          <View style={styles.heroMainRow}>
            <View style={[styles.heroEarningsBlock, !showHeroAssigner && styles.heroEarningsBlockFull]}>
              <View style={styles.heroIconWrap}>
                <Wallet size={16} color={FLOW_EMERALD} strokeWidth={2.2} />
              </View>
              <View style={styles.heroTextBlock}>
                <Text style={styles.heroAmount} numberOfLines={1}>
                  {earnings}
                </Text>
                <Text style={styles.heroAmountLabel}>EST. EARNINGS</Text>
              </View>
            </View>
            {showHeroAssigner && assignedBy ? (
              <>
                <View style={styles.heroColDivider} />
                <HeroAssignerBlock assigner={assignedBy} />
              </>
            ) : null}
          </View>
        </LinearGradient>
      </View>

      <View style={styles.contentWrap}>
        {destinationHeading && destinationLabel ? (
          <View style={styles.destinationBlock}>
            <Text style={[styles.destinationHeading, { color: Theme.textMuted }]}>{destinationHeading}</Text>
            <Text style={[styles.destinationLabel, { color: Theme.textPrimaryDark }]} numberOfLines={2}>
              {destinationLabel}
            </Text>

            {progressFraction != null ? (
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${progressFraction * 100}%`, backgroundColor: FLOW_EMERALD },
                  ]}
                />
                <View
                  style={[
                    styles.progressBarDot,
                    { left: `${progressFraction * 100}%`, borderColor: FLOW_EMERALD },
                  ]}
                />
              </View>
            ) : null}

            <Text style={[styles.destinationCaption, { color: Theme.textMuted }]} numberOfLines={1}>
              {caption}
            </Text>
          </View>
        ) : null}

        {showCustomerVehicleRow ? (
          <View style={styles.metaRow}>
            {customerName?.trim() ? (
              <View style={styles.metaLine}>
                <PartyAvatar name={customerName} entityType="client" size={16} style={styles.metaAvatar} />
                <Text style={[styles.metaValue, { color: Theme.textPrimaryDark }]} numberOfLines={1}>
                  {customerName}
                </Text>
              </View>
            ) : null}
            {vehicleNumber?.trim() ? (
              <Text style={[styles.metaSubValue, { color: Theme.textMuted }]} numberOfLines={1}>
                {vehicleNumber}
              </Text>
            ) : null}
          </View>
        ) : null}

        {guidanceMessage ? (
          <View style={[styles.guidanceBanner, { backgroundColor: Theme.accentGoldMuted }]}>
            <AlertTriangle size={12} color={Theme.accentGold} strokeWidth={2.2} />
            <Text style={[styles.guidanceText, { color: Theme.accentGoldPressed }]} numberOfLines={2}>
              {guidanceMessage}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    paddingHorizontal: HERO_INSET,
  },
  contentWrap: {
    paddingHorizontal: TRIP_SHEET_BODY_PAD.horizontal,
    paddingTop: 16,
    gap: 12,
  },
  flowHero: {
    borderRadius: 16,
    paddingTop: TRIP_SHEET_HERO_PAD.top,
    paddingHorizontal: TRIP_SHEET_HERO_PAD.horizontal,
    paddingBottom: TRIP_SHEET_HERO_PAD.bottom,
    gap: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#fff',
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroEarningsBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  heroEarningsBlockFull: {
    flex: 1,
  },
  heroIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextBlock: {
    gap: 1,
  },
  heroAmount: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    lineHeight: 23,
  },
  heroAmountLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 0.5,
  },
  heroColDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 12,
  },
  destinationBlock: {
    gap: 0,
  },
  destinationHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  destinationLabel: {
    marginTop: 5,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.border,
    marginTop: 14,
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
  },
  progressBarDot: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 3,
    marginLeft: -6,
  },
  destinationCaption: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  metaAvatar: {
    flexShrink: 0,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  metaSubValue: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 0,
  },
  guidanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  guidanceText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
