export type PodOperatorLane = "asset" | "market";

export function podTripLane(trip: {
  supplier_id?: unknown;
  trip_payout_mode?: unknown;
}): PodOperatorLane {
  const raw = String(trip.trip_payout_mode ?? "").trim().toLowerCase();
  if (raw === "market" || raw === "asset") return raw;
  return String(trip.supplier_id ?? "").trim() ? "market" : "asset";
}

/** List/detail label: driver for asset trips, supplier for market trips. */
export function podOperatorDisplayName(args: {
  lane: PodOperatorLane;
  supplierName?: string | null;
  driverName?: string | null;
}): string {
  const driver = (args.driverName ?? "").trim();
  const supplier = (args.supplierName ?? "").trim();
  if (args.lane === "asset") return driver || supplier;
  return supplier || driver;
}
