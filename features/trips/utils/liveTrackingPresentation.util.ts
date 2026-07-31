/**
 * Single presentation model shared by LiveTrackingModal and
 * TripDetailTrackingHub, computed once in TripDetailScreen from the Trip
 * Operations Platform (docs/TRIP_OPERATIONS_PLATFORM.md) instead of each
 * screen independently deriving stage/progress/ETA. Replaces:
 *   - manifestDeliveryPlan.util.ts's estimatedDeliveryAt / distance / pace
 *     (a static plan with no live-progress or future-check -- see
 *     liveTrackingEta.util.ts for the replacement)
 *   - LiveTrackingModal's own trackingStepAndLabel()/trackingStatusHeadline()
 *     (a second, independent trip.status -> stage interpretation)
 *
 * Audience note: this is customer/business-facing presentation, not the
 * driver app -- wording here is deliberately different from
 * tripStageMetadata.ts's driver-instruction titles ("GO TO PICKUP" tells a
 * driver what to do; a customer wants a status, "Assigned"). Same principle
 * as driverAlertGuidance.util.ts: platform computes the truth once, each
 * audience gets its own thin translation, not its own derivation.
 */
import type { TripRow } from "@/features/trips/services/trips.service";
import { deriveTripStage, type TripStage } from "@/features/trips/domain/tripStage";
import type { TripStageMetrics } from "@/features/trips/domain/tripStageMetrics";
import type { JourneyMetrics } from "@/features/trips/domain/tripJourneyMetrics";
import { resolveLiveTrackingEta, type LiveTrackingEta } from "./liveTrackingEta.util";

const CUSTOMER_STAGE_TITLE: Record<TripStage, string> = {
  accepted: "ASSIGNED",
  pickup: "AT PICKUP",
  // 'lr' is a driver-app-only client-side sub-step of 'pickup' (see
  // tripStage.ts) -- deriveTripStage() never actually returns it, but the
  // type includes it, so this entry exists only to satisfy Record<TripStage, _>.
  lr: "AT PICKUP",
  transit: "IN TRANSIT",
  reached: "AT DROP",
  completed: "DELIVERED",
};

export interface LiveTrackingPresentation {
  stage: TripStage;
  statusTitle: string;
  distanceRemainingLabel: string | null;
  distanceTravelledLabel: string | null;
  eta: LiveTrackingEta;
  /** False once delivered -- an ETA row has nothing left to say. */
  showEta: boolean;
  /** 0..1. Distance-based once journeyMetrics exists; a coarse stage-based estimate before departure. */
  progressFraction: number;
  originLabel: string;
  destinationLabel: string;
}

export function locationPrimaryLine(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const comma = raw.indexOf(",");
  return comma > 0 ? raw.slice(0, comma).trim() : raw;
}

function formatKm(km: number): string {
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${rounded} km`;
}

/** Coarse, honest fallback before journeyMetrics exists (no departure yet to measure real progress against). */
const STAGE_PROGRESS_FALLBACK: Record<TripStage, number> = {
  accepted: 0.1,
  pickup: 0.25,
  lr: 0.25,
  transit: 0.5,
  reached: 0.9,
  completed: 1,
};

export function buildLiveTrackingPresentation(params: {
  trip: TripRow;
  stageMetrics: TripStageMetrics;
  journeyMetrics: JourneyMetrics | null;
  routeEtaSeconds?: number | null;
  nowMs?: number;
}): LiveTrackingPresentation {
  const stage = deriveTripStage(params.trip);
  const journeyMetrics = params.journeyMetrics;

  const distanceRemainingLabel =
    journeyMetrics != null ? `${formatKm(journeyMetrics.remainingDistanceKm)} remaining` : null;
  const distanceTravelledLabel =
    journeyMetrics != null ? `${formatKm(journeyMetrics.completedDistanceKm)} travelled` : null;

  const progressFraction =
    journeyMetrics != null && journeyMetrics.routeDistanceKm > 0
      ? Math.min(1, Math.max(0, journeyMetrics.completedDistanceKm / journeyMetrics.routeDistanceKm))
      : STAGE_PROGRESS_FALLBACK[stage];

  return {
    stage,
    statusTitle: CUSTOMER_STAGE_TITLE[stage],
    distanceRemainingLabel,
    distanceTravelledLabel,
    eta: resolveLiveTrackingEta({
      trip: params.trip,
      stageMetrics: params.stageMetrics,
      journeyMetrics,
      routeEtaSeconds: params.routeEtaSeconds,
      nowMs: params.nowMs,
    }),
    showEta: stage !== "completed",
    progressFraction,
    originLabel: locationPrimaryLine(params.trip.pickup_area),
    destinationLabel: locationPrimaryLine(params.trip.drop_location),
  };
}
