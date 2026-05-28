import { useQuery } from "@tanstack/react-query";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { STALE } from "@/lib/queryClient";
import type { ReimbursementState } from "../types";
import {
  buildReimbursementMetrics,
  type ReimbursementMetrics,
} from "./reimbursementMetrics";
import {
  toEnterpriseReimbursementState,
  type EnterpriseReimbursementState,
} from "./reimbursementEngine";

interface ReimbursementQueueItem {
  id: string;
  sourceType: "fuel" | "toll";
  tripId: string;
  tripLabel: string;
  amountInr: number;
  state: EnterpriseReimbursementState;
  enteredAt: string;
  paymentOwner: string | null;
}

interface QueueResult {
  items: ReimbursementQueueItem[];
  metrics: ReimbursementMetrics;
}

export function useReimbursementQueue(input: {
  organizationId: string | null;
  enabled?: boolean;
}) {
  const enabled = (input.enabled ?? true) && !!input.organizationId;
  return useQuery<QueueResult>({
    queryKey: input.organizationId
      ? queryKeys.operations.reimbursementQueue(input.organizationId)
      : ["q", "operations", "reimbursement-queue", "noop"],
    queryFn: async () => {
      const selectFields =
        "id,trip_id,amount_inr,reimbursement_state,approval_state,payment_owner,reimbursement_notes,entered_at,trips!inner(id,organization_id,trip_operational_code,trip_code,display_trip_id,trip_number)";
      const [fuelRes, tollRes] = await Promise.all([
        supabase()
          .from("trip_fuel_entries")
          .select(selectFields)
          .eq("trips.organization_id", input.organizationId!)
          .eq("payment_owner", "driver")
          .order("entered_at", { ascending: false })
          .limit(200),
        supabase()
          .from("trip_toll_entries")
          .select(selectFields)
          .eq("trips.organization_id", input.organizationId!)
          .eq("payment_owner", "driver")
          .order("entered_at", { ascending: false })
          .limit(200),
      ]);
      if (fuelRes.error) throw new Error(fuelRes.error.message);
      if (tollRes.error) throw new Error(tollRes.error.message);
      const fuel = (fuelRes.data ?? []).map((row) => {
        const trip = (
          row as {
            trips?:
              | Array<{
                  id: string;
                  trip_operational_code?: string | null;
                  trip_code?: string | null;
                  display_trip_id?: string | null;
                  trip_number?: string | null;
                }>
              | null;
          }
        ).trips?.[0];
        const state = toEnterpriseReimbursementState({
          reimbursementState: (row as { reimbursement_state?: ReimbursementState | null })
            .reimbursement_state,
          approvalState: (row as { approval_state?: string | null }).approval_state,
          paymentOwner: (row as { payment_owner?: string | null }).payment_owner,
          reimbursementNotes: (row as { reimbursement_notes?: string | null }).reimbursement_notes,
        });
        return {
          id: `fuel:${String((row as { id: string }).id)}`,
          sourceType: "fuel" as const,
          tripId: trip?.id ?? String((row as { trip_id: string }).trip_id),
          tripLabel: getTripOperationalDisplay({
            trip_operational_code: trip?.trip_operational_code ?? null,
            trip_code: trip?.trip_code ?? null,
              display_trip_id: trip?.display_trip_id ?? null,
            trip_number: trip?.trip_number ?? null,
          }),
          amountInr: Number((row as { amount_inr?: number | null }).amount_inr ?? 0),
          state,
          enteredAt: String((row as { entered_at: string }).entered_at),
          paymentOwner: (row as { payment_owner?: string | null }).payment_owner ?? null,
        };
      });
      const toll = (tollRes.data ?? []).map((row) => {
        const trip = (
          row as {
            trips?:
              | Array<{
                  id: string;
                  trip_operational_code?: string | null;
                  trip_code?: string | null;
                  display_trip_id?: string | null;
                  trip_number?: string | null;
                }>
              | null;
          }
        ).trips?.[0];
        const state = toEnterpriseReimbursementState({
          reimbursementState: (row as { reimbursement_state?: ReimbursementState | null })
            .reimbursement_state,
          approvalState: (row as { approval_state?: string | null }).approval_state,
          paymentOwner: (row as { payment_owner?: string | null }).payment_owner,
          reimbursementNotes: (row as { reimbursement_notes?: string | null }).reimbursement_notes,
        });
        return {
          id: `toll:${String((row as { id: string }).id)}`,
          sourceType: "toll" as const,
          tripId: trip?.id ?? String((row as { trip_id: string }).trip_id),
          tripLabel: getTripOperationalDisplay({
            trip_operational_code: trip?.trip_operational_code ?? null,
            trip_code: trip?.trip_code ?? null,
              display_trip_id: trip?.display_trip_id ?? null,
            trip_number: trip?.trip_number ?? null,
          }),
          amountInr: Number((row as { amount_inr?: number | null }).amount_inr ?? 0),
          state,
          enteredAt: String((row as { entered_at: string }).entered_at),
          paymentOwner: (row as { payment_owner?: string | null }).payment_owner ?? null,
        };
      });
      const items = [...fuel, ...toll].sort(
        (a, b) => +new Date(b.enteredAt) - +new Date(a.enteredAt),
      );
      const metrics = buildReimbursementMetrics(
        items.map((item) => ({ amountInr: item.amountInr, state: item.state })),
      );
      return { items, metrics };
    },
    enabled,
    staleTime: STALE.frequent,
  });
}
