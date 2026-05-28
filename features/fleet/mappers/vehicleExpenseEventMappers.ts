import type { VehicleExpenseEvent } from "@/features/fleet/domain/VehicleExpenseEvent";

type VehicleLedgerLike = {
  id: string;
  vehicle_id?: string | null;
  trip_id?: string | null;
  source_type?: string | null;
  amount?: number | string | null;
  created_at?: string | null;
};

function toCategory(sourceType: string): VehicleExpenseEvent["category"] {
  const normalized = sourceType.toLowerCase();
  if (normalized === "insurance") return "insurance";
  if (normalized === "permit") return "permit";
  if (normalized === "service") return "service";
  if (normalized === "repair") return "maintenance";
  if (normalized === "maintenance") return "maintenance";
  return "misc";
}

export function mapVehicleLedgerRowToExpenseEvent(row: VehicleLedgerLike): VehicleExpenseEvent {
  const sourceType = String(row.source_type ?? "").trim();
  const linkedTripId = String(row.trip_id ?? "").trim() || undefined;
  return {
    id: String(row.id),
    vehicleId: String(row.vehicle_id ?? ""),
    category: toCategory(sourceType),
    amount: Math.max(0, Number(row.amount ?? 0) || 0),
    expenseScope: linkedTripId ? "trip_specific" : "common",
    linkedTripId,
    approvalState: "approved",
    postingState: "posted",
    settlementState: "settled",
    ledgerTransactionId: String(row.id),
    affectsVehiclePnL: true,
    affectsTripPnL: !!linkedTripId,
    allocationStrategy: linkedTripId ? "trip_based" : "none",
    allocationStatus: linkedTripId ? "allocated" : "unallocated",
    allocatedAmount: linkedTripId ? Math.max(0, Number(row.amount ?? 0) || 0) : 0,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}
