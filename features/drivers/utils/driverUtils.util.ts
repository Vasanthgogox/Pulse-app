/**
 * Driver app — helpers for trip display.
 * Aggregate trips (supplier_id set) are ad-hoc: finance is handled offline, so we do not show
 * trip rate or commission derived from client_price/supplier_rate to the driver.
 */

import * as driversService from "@/features/drivers/services/drivers.service";

export interface TripWithSupplier {
  supplier_id?: string | null;
  driver_commission?: number | null;
  supplier_rate?: number | null;
  client_price?: number | null;
  distance?: string | number | null;
  odometer_distance_km?: number | null;
  gps_distance_km?: number | null;
}

export interface DriverTripPayoutTerms {
  commissionPercent?: number | null;
  commissionPerKm?: number | null;
}

function pickTripDistanceKm(trip: TripWithSupplier): number {
  const odometer = Number(trip.odometer_distance_km ?? 0);
  if (Number.isFinite(odometer) && odometer > 0) return odometer;
  const gps = Number(trip.gps_distance_km ?? 0);
  if (Number.isFinite(gps) && gps > 0) return gps;
  const fallback = Number(trip.distance ?? 0);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  return 0;
}

/** Trip shape for roster detection (source + driver/vehicle from org). */
export interface TripRosterShape {
  source?: string | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
}

/** True when trip is roster-from-LoadHub (connected/integrated): driver+vehicle from org — no OTP. */
export function isRosterTrip(trip: TripRosterShape | null | undefined): boolean {
  if (!trip) return false;
  return (
    String(trip.source ?? '').trim() === 'direct_quote' &&
    !!(trip.driver_id && String(trip.driver_id).trim()) &&
    !!(trip.vehicle_id && String(trip.vehicle_id).trim())
  );
}

/** True when trip is aggregate (outsourced/partner); driver payment is handled offline. */
export function isAggregateTrip(trip: TripWithSupplier | null | undefined): boolean {
  if (!trip) return false;
  const sid = trip.supplier_id;
  return !!(sid && String(sid).trim());
}

/**
 * Context for the Trips hub / trip-detail **Asset vs Aggregate** pill only.
 * Does not replace {@link isAggregateTrip} for OTP gates, earnings, or ledger logic.
 */
export type AggregateTripKindPillContext = {
  viewerOrganizationId?: string | null;
  supplierLinkedOrganizationId?: string | null;
  /** When true, driver was created for OTP / assign-by-phone — always show Aggregate pill. */
  driverTrackingOnly?: boolean | null;
};

/**
 * Whether the UI should show the **AGGREGATE** (vs ASSET) trip-kind pill for the current viewer.
 *
 * Cross-org partner views (awarded supplier looking at the aggregator's trip) always stay
 * **AGGREGATE** — that tile is settlement-only. The mover's own `mover_asset` trip (owned by
 * the supplier org, supplier_id null) is the ASSET tile where fuel/toll/driver pay live.
 * Do not re-introduce the old "infer Asset for supplier on shipper trip" workaround: it made
 * both tiles look identical and routed movers into a screen with no expense entry.
 */
export function shouldShowAggregateTripKindPill(
  trip: TripWithSupplier &
    TripRosterShape & { organization_id?: string | null },
  ctx?: AggregateTripKindPillContext | null,
): boolean {
  if (!isAggregateTrip(trip)) return false;
  if (ctx?.driverTrackingOnly === true) return true;
  // All remaining supplier-linked trips are Aggregate — including cross-org
  // partner settlement tiles (mover's ASSET job is a separate mover_asset row).
  return true;
}

type TripPayoutShape = TripWithSupplier & {
  trip_payout_mode?: string | null;
};

/**
 * Manifest hero right column: **driver** on asset trips; **supplier** on aggregate/market.
 * Uses explicit payout mode first, then the same Asset vs Aggregate pill rules as Trips hub.
 */
export function shouldShowManifestHeroDriverParty(
  trip: TripWithSupplier &
    TripRosterShape & { organization_id?: string | null },
  ctx?: AggregateTripKindPillContext | null,
): boolean {
  const payoutMode = String((trip as TripPayoutShape).trip_payout_mode ?? "")
    .trim()
    .toLowerCase();

  if (payoutMode === "market") return false;
  if (payoutMode === "asset") return true;
  if (!isAggregateTrip(trip)) return true;
  return !shouldShowAggregateTripKindPill(trip, ctx);
}

/**
 * Trips hub violet pill (Integrated vs Manual): **Integrated** only when the trip is aggregate and was
 * created via Load Hub (`source === direct_quote`). Aggregate trips with `manual` (or any other) source
 * show **Manual** — matches DB `trips.source`; does not change {@link isAggregateTrip} or ledger behavior.
 */
export function shouldShowIntegratedSubtypePillForHub(
  trip: TripWithSupplier & TripRosterShape,
): boolean {
  if (!isAggregateTrip(trip)) return false;
  return String(trip.source ?? "").trim() === "direct_quote";
}

/**
 * Trip earnings shown to driver.
 * Priority:
 * 1) explicit `driver_commission` on trip
 * 2) accepted invite per-km payout (odometer distance first, then GPS, then trip distance)
 * 3) accepted invite trip-level commission %
 * 4) legacy fallback (10% supplier_rate, else 10% client_price)
 */
export function tripEarningsForDriver(
  trip: TripWithSupplier | null | undefined,
  payoutTerms?: DriverTripPayoutTerms | null,
): number {
  if (!trip) return 0;
  const commission = Number(trip.driver_commission ?? 0) || 0;
  if (commission > 0) return Math.round(commission);

  const perKm = Number(payoutTerms?.commissionPerKm ?? 0) || 0;
  if (perKm > 0) {
    const km = pickTripDistanceKm(trip);
    if (km > 0) return Math.round(km * perKm);
  }

  const commissionPercent = Number(payoutTerms?.commissionPercent ?? 0) || 0;
  if (commissionPercent > 0) {
    const ratio = Math.min(100, commissionPercent) / 100;
    const supplierRate = Number(trip.supplier_rate ?? 0) || 0;
    if (supplierRate > 0) return Math.round(supplierRate * ratio);
    const clientPrice = Number(trip.client_price ?? 0) || 0;
    if (clientPrice > 0) return Math.round(clientPrice * ratio);
  }

  const supplierRate = Number(trip.supplier_rate ?? 0) || 0;
  if (supplierRate > 0) return Math.round(supplierRate * 0.1);
  const clientPrice = Number(trip.client_price ?? 0) || 0;
  if (clientPrice > 0) return Math.round(clientPrice * 0.1);
  return 0;
}

export function isAssignedNotStarted(status: string) {
  const s = (status || "").toLowerCase();
  return s === "assigned" || s === "pending" || s === "scheduled";
}

export function isActiveMission(status: string) {
  const s = (status || "").toLowerCase();
  return (
    s === "in_progress" ||
    s === "in_transit" ||
    s === "transit" ||
    s === "picked_up" ||
    s === "pickup" ||
    s === "started" ||
    s === "at_drop"
  );
}

export function isCompletedStatus(status: string) {
  const s = (status || "").toLowerCase();
  return s === "completed" || s === "delivered" || s === "done";
}

export function buildInviteOfferText(inv: driversService.DriverInviteRow): string {
  const parts: string[] = [];
  if (inv.payable_amount != null && inv.payable_amount > 0) {
    parts.push(`₹${Number(inv.payable_amount).toLocaleString("en-IN")}`);
  }
  if (inv.commission_percent != null && inv.commission_percent > 0) {
    parts.push(`${inv.commission_percent}% commission`);
  }
  if (inv.commission_per_km != null && inv.commission_per_km > 0) {
    parts.push(`₹${inv.commission_per_km}/km`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Offer on accept";
}

export function isCompleted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

export function buildOfferText(inv: driversService.DriverInviteRow): string {
  const parts: string[] = [];
  if (inv.payable_amount != null && inv.payable_amount > 0) {
    parts.push(`₹${Number(inv.payable_amount).toLocaleString('en-IN')}`);
  }
  if (inv.commission_percent != null && inv.commission_percent > 0) {
    parts.push(`${inv.commission_percent}% commission`);
  }
  if (inv.commission_per_km != null && inv.commission_per_km > 0) {
    parts.push(`₹${inv.commission_per_km}/km`);
  }
  return parts.length ? parts.join(' · ') : 'Offer on accept';
}
