import { backfillVehicleOperationalCashLedger } from "@/features/ledger/vehicle/syncOperationalExpenseToCashLedger.service";
import { supabase } from "@/lib/supabase";
import {
  isVehicleOperationLedgerSourceType,
  syncVehicleOperationLedgerFromPostedSource,
} from "./vehicleOperationsLedger.service";

/** Align vehicle_operation_ledger_entries and cash ledger with vehicle_ledger_entries. */
export async function syncPostedTripExpensesToOperationLedger(tripId: string): Promise<void> {
  const tripRes = await supabase()
    .from("trips")
    .select("organization_id, vehicle_id")
    .eq("id", tripId)
    .maybeSingle();
  const orgId = String(
    (tripRes.data as { organization_id?: string | null } | null)?.organization_id ?? "",
  ).trim();
  const vehicleId = String(
    (tripRes.data as { vehicle_id?: string | null } | null)?.vehicle_id ?? "",
  ).trim();

  const { data, error } = await supabase()
    .from("vehicle_ledger_entries")
    .select("source_type,source_id,trip_id,amount,metadata,posted_at")
    .eq("trip_id", tripId)
    .in("source_type", ["fuel", "toll", "manual_adjustment"]);
  if (error || !data?.length) {
    if (orgId && vehicleId) {
      await backfillVehicleOperationalCashLedger({
        organizationId: orgId,
        vehicleId,
        tripIds: [tripId],
      });
    }
    return;
  }
  for (const row of data) {
    const sourceType = String((row as { source_type?: string | null }).source_type ?? "");
    const sourceId = String((row as { source_id?: string | null }).source_id ?? "").trim();
    if (!sourceId || !isVehicleOperationLedgerSourceType(sourceType)) continue;
    await syncVehicleOperationLedgerFromPostedSource({
      sourceType,
      sourceId,
      tripId,
      amount: Math.max(0, Number((row as { amount?: number | null }).amount ?? 0) || 0),
      approvedBy: null,
    });
  }

  if (orgId && vehicleId) {
    await backfillVehicleOperationalCashLedger({
      organizationId: orgId,
      vehicleId,
      tripIds: [tripId],
    });
  }
}
