/**
 * Map client contract lanes → trip / indent form prefill.
 */
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";
import { formatINR } from "@/lib/format";

export type ClientLanePrefill = {
  pickup: string;
  drop: string;
  vehicleType: string | null;
  /** Digits-only amount string for form fields (no ₹ / commas). */
  clientPrice: string | null;
  originWarehouseId: string | null;
  agreementId: string | null;
};

function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isLaneCurrentlyValid(
  lane: ClientLaneRate,
  onDate = todayISO(),
): boolean {
  if (lane.valid_from && lane.valid_from > onDate) return false;
  if (lane.valid_to && lane.valid_to < onDate) return false;
  return true;
}

/** Prefer trip rate, then base, then MT×KM composite when both present. */
export function resolveLaneSaleAmount(lane: ClientLaneRate): number | null {
  if (lane.rate != null && Number.isFinite(lane.rate) && lane.rate > 0) {
    return lane.rate;
  }
  if (lane.base_rate != null && Number.isFinite(lane.base_rate) && lane.base_rate > 0) {
    return lane.base_rate;
  }
  if (
    lane.per_mt_rate != null &&
    lane.per_km_rate != null &&
    lane.distance_km != null &&
    Number.isFinite(lane.per_mt_rate) &&
    Number.isFinite(lane.per_km_rate) &&
    Number.isFinite(lane.distance_km)
  ) {
    // Without weight, use per-km × distance as a usable starting sale.
    const approx = lane.per_km_rate * lane.distance_km;
    return approx > 0 ? approx : null;
  }
  if (lane.per_km_rate != null && lane.distance_km != null) {
    const approx = lane.per_km_rate * lane.distance_km;
    return approx > 0 ? approx : null;
  }
  return null;
}

export function buildClientLanePrefill(lane: ClientLaneRate): ClientLanePrefill {
  const amount = resolveLaneSaleAmount(lane);
  // Drop must come from destination_label (the lane's named destination,
  // e.g. "Bangalore") — this is what the UI shows as `origin → destination`.
  // destination_address is a free-text secondary field (often a state or
  // street) and must never override the label, or the indent captures the
  // wrong drop (e.g. "MAHARASHTRA" instead of "Bangalore").
  const drop =
    lane.destination_label?.trim() ||
    lane.destination_address?.trim() ||
    "";
  return {
    pickup: lane.origin_label?.trim() || "",
    drop,
    vehicleType: lane.vehicle_type?.trim() || null,
    clientPrice: amount != null ? String(Math.round(amount)) : null,
    originWarehouseId: lane.origin_warehouse_id,
    agreementId: lane.agreement_id,
  };
}

export function lanePrimaryRateLabel(lane: ClientLaneRate): string {
  const amount = resolveLaneSaleAmount(lane);
  if (amount == null) return "Rate TBD";
  const type = lane.rate_type?.replace(/_/g, " ") ?? "rate";
  return `${formatINR(amount)} · ${type}`;
}

export function laneValidityLabel(lane: ClientLaneRate): string {
  if (!lane.valid_from && !lane.valid_to) return "Open validity";
  return `${lane.valid_from ?? "—"} → ${lane.valid_to ?? "open"}`;
}

export function filterClientLanes(
  lanes: readonly ClientLaneRate[],
  query: string,
): ClientLaneRate[] {
  const q = query.trim().toLowerCase();
  const sorted = [...lanes].sort((a, b) => {
    const av = isLaneCurrentlyValid(a) ? 0 : 1;
    const bv = isLaneCurrentlyValid(b) ? 0 : 1;
    if (av !== bv) return av - bv;
    return (a.origin_label + a.destination_label).localeCompare(
      b.origin_label + b.destination_label,
    );
  });
  if (!q) return sorted;
  return sorted.filter((lane) => {
    const hay = [
      lane.origin_label,
      lane.destination_label,
      lane.destination_address,
      lane.vehicle_type,
      lane.warehouse_zone,
      lane.rate != null ? String(lane.rate) : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
