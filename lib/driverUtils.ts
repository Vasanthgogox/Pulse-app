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
 * Trip earnings shown to driver. Returns 0 for aggregate trips (offline payment).
 * Otherwise: driver_commission, else 10% supplier_rate, else 10% client_price (matches finance aggregation).
 */
export function tripEarningsForDriver(trip: TripWithSupplier | null | undefined): number {
  if (!trip) return 0;
  const commission = Number(trip.driver_commission ?? 0) || 0;
  if (commission > 0) return commission;
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
