import { getTripById } from "@/features/trips/services/trips.service";
import { getTripFuelEntries, updateTripFuelApprovalState } from "@/features/trips/operations/fuel/fuel.service";
import { getTripTollEntries, updateTripTollApprovalState } from "@/features/trips/operations/toll/toll.service";
import { getTripOperationalCapabilities } from "@/features/trips/capabilities";
import { supabase } from "@/lib/supabase";
import { executeVehiclePostingRuntime } from "../runtime";

type SourceType = "fuel" | "toll";

export type ReconciliationChip =
  | "posted"
  | "awaiting_posting"
  | "retry_needed"
  | "reconciliation_required"
  | "blocked";

export interface PostingMismatch {
  sourceType: SourceType;
  sourceId: string;
  postingState: string;
  ledgerState: string;
  shouldPost: boolean;
  hasLedgerEntry: boolean;
}

function shouldEntryPost(input: {
  approvalState: string | null | undefined;
  paymentOwner: string | null | undefined;
  isAssetTrip: boolean;
}): boolean {
  if (!input.isAssetTrip) return false;
  if (String(input.approvalState ?? "") !== "approved") return false;
  const owner = String(input.paymentOwner ?? "").toLowerCase();
  return owner === "organization" || owner === "fleet_card";
}

export async function detectPostingMismatch(input: {
  sourceType: SourceType;
  sourceId: string;
  postingState: string | null | undefined;
  ledgerState: string | null | undefined;
  shouldPost: boolean;
}): Promise<PostingMismatch> {
  const existing = await supabase()
    .from("vehicle_ledger_entries")
    .select("id")
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .maybeSingle();
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    postingState: String(input.postingState ?? "pending"),
    ledgerState: String(input.ledgerState ?? "not_posted"),
    shouldPost: input.shouldPost,
    hasLedgerEntry: !!existing.data?.id,
  };
}

export async function reconcileVehicleLedgerState(input: {
  tripId: string;
}): Promise<{ error: Error | null; mismatches: PostingMismatch[]; chip: ReconciliationChip }> {
  const [tripRes, fuelRes, tollRes] = await Promise.all([
    getTripById(input.tripId),
    getTripFuelEntries(input.tripId),
    getTripTollEntries(input.tripId),
  ]);
  if (tripRes.error || !tripRes.trip) {
    return { error: tripRes.error ?? new Error("Trip not found"), mismatches: [], chip: "blocked" };
  }
  if (fuelRes.error) return { error: fuelRes.error, mismatches: [], chip: "blocked" };
  if (tollRes.error) return { error: tollRes.error, mismatches: [], chip: "blocked" };
  const capabilities = getTripOperationalCapabilities(tripRes.trip);
  const candidates = [
    ...fuelRes.entries.map((entry) => ({
      sourceType: "fuel" as const,
      sourceId: entry.id,
      postingState: entry.posting_state,
      ledgerState: entry.ledger_state,
      shouldPost: shouldEntryPost({
        approvalState: entry.approval_state,
        paymentOwner: entry.payment_owner,
        isAssetTrip: capabilities.isAssetTrip,
      }),
    })),
    ...tollRes.entries.map((entry) => ({
      sourceType: "toll" as const,
      sourceId: entry.id,
      postingState: entry.posting_state,
      ledgerState: entry.ledger_state,
      shouldPost: shouldEntryPost({
        approvalState: entry.approval_state,
        paymentOwner: entry.payment_owner,
        isAssetTrip: capabilities.isAssetTrip,
      }),
    })),
  ];
  const mismatches: PostingMismatch[] = [];
  for (const candidate of candidates) {
    const mismatch = await detectPostingMismatch(candidate);
    const invariantBroken =
      (mismatch.shouldPost && !mismatch.hasLedgerEntry) ||
      (!mismatch.shouldPost && mismatch.hasLedgerEntry && !capabilities.isAssetTrip) ||
      (mismatch.hasLedgerEntry && mismatch.postingState !== "posted");
    if (invariantBroken) mismatches.push(mismatch);
  }
  const chip: ReconciliationChip =
    mismatches.length === 0
      ? "posted"
      : mismatches.some((m) => m.postingState === "failed")
        ? "retry_needed"
        : mismatches.some((m) => m.shouldPost)
          ? "reconciliation_required"
          : "awaiting_posting";
  return { error: null, mismatches, chip };
}

export async function rebuildOperationalLedgerState(input: {
  tripId: string;
}): Promise<{ error: Error | null; updated: number }> {
  const recon = await reconcileVehicleLedgerState({ tripId: input.tripId });
  if (recon.error) return { error: recon.error, updated: 0 };
  let updated = 0;
  for (const mismatch of recon.mismatches) {
    if (mismatch.sourceType === "fuel") {
      const state = mismatch.hasLedgerEntry ? "posted" : mismatch.shouldPost ? "not_posted" : "void";
      const res = await updateTripFuelApprovalState({
        entryId: mismatch.sourceId,
        approvalState: "approved",
        ledgerState: state,
      });
      if (!res.error) updated += 1;
    } else {
      const state = mismatch.hasLedgerEntry ? "posted" : mismatch.shouldPost ? "not_posted" : "void";
      const res = await updateTripTollApprovalState({
        entryId: mismatch.sourceId,
        approvalState: "approved",
        ledgerState: state,
      });
      if (!res.error) updated += 1;
    }
  }
  return { error: null, updated };
}

export async function reconcileOperationalPosting(input: {
  tripId: string;
  actorUserId: string | null;
}): Promise<{ error: Error | null; posted: number; failed: number; chip: ReconciliationChip }> {
  const [tripRes, fuelRes, tollRes] = await Promise.all([
    getTripById(input.tripId),
    getTripFuelEntries(input.tripId),
    getTripTollEntries(input.tripId),
  ]);
  if (tripRes.error || !tripRes.trip) {
    return { error: tripRes.error ?? new Error("Trip missing"), posted: 0, failed: 0, chip: "blocked" };
  }
  if (fuelRes.error) return { error: fuelRes.error, posted: 0, failed: 0, chip: "blocked" };
  if (tollRes.error) return { error: tollRes.error, posted: 0, failed: 0, chip: "blocked" };
  let posted = 0;
  let failed = 0;
  for (const entry of fuelRes.entries) {
    const shouldPost = shouldEntryPost({
      approvalState: entry.approval_state,
      paymentOwner: entry.payment_owner,
      isAssetTrip: getTripOperationalCapabilities(tripRes.trip).isAssetTrip,
    });
    if (!shouldPost) continue;
    const post = await executeVehiclePostingRuntime({
      orgId: tripRes.trip.organization_id,
      tripId: tripRes.trip.id,
      vehicleId: tripRes.trip.vehicle_id ?? "",
      sourceType: "fuel",
      sourceId: entry.id,
      amount: Number(entry.amount_inr ?? 0),
      approvedBy: input.actorUserId,
      approvalState: entry.approval_state,
      paymentOwner: entry.payment_owner,
      metadata: { reconciliation: true },
    });
    if (post.error) failed += 1;
    if (post.posted) posted += 1;
  }
  for (const entry of tollRes.entries) {
    const shouldPost = shouldEntryPost({
      approvalState: entry.approval_state,
      paymentOwner: entry.payment_owner,
      isAssetTrip: getTripOperationalCapabilities(tripRes.trip).isAssetTrip,
    });
    if (!shouldPost) continue;
    const post = await executeVehiclePostingRuntime({
      orgId: tripRes.trip.organization_id,
      tripId: tripRes.trip.id,
      vehicleId: tripRes.trip.vehicle_id ?? "",
      sourceType: "toll",
      sourceId: entry.id,
      amount: Number(entry.amount_inr ?? 0),
      approvedBy: input.actorUserId,
      approvalState: entry.approval_state,
      paymentOwner: entry.payment_owner,
      metadata: { reconciliation: true },
    });
    if (post.error) failed += 1;
    if (post.posted) posted += 1;
  }
  const chip: ReconciliationChip =
    failed > 0 ? "retry_needed" : posted > 0 ? "posted" : "awaiting_posting";
  return { error: null, posted, failed, chip };
}
