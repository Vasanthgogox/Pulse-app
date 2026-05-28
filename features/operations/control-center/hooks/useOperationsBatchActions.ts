import { useMutation, useQueryClient } from "@tanstack/react-query";
import { evaluateAndPostFuelEntry, evaluateAndPostTollEntry } from "@/features/ledger/vehicle";
import { reconcileOperationalPosting } from "@/features/ledger/vehicle/reconciliation/reconciliation.service";
import { updateTripFuelApprovalState } from "@/features/trips/operations/fuel/fuel.service";
import { updateTripTollApprovalState } from "@/features/trips/operations/toll/toll.service";
import {
  updateFuelReimbursementState,
  updateTollReimbursementState,
} from "@/features/trips/operations/reimbursement/reimbursement.service";
import { queryKeys } from "@/lib/queryKeys";
import { syncOperationalFinanceProjection } from "@/features/finance/projections";
import {
  invalidateOperationalIdentity,
  invalidateReconciliationState,
  invalidateTripOperationalState,
} from "@/lib/queries/operationalInvalidation";
import type { OperationalQueueItem } from "../types";

function uniqueTripIds(items: OperationalQueueItem[]): string[] {
  return Array.from(
    new Set(
      items
        .map((item) => item.trip?.tripId ?? null)
        .filter((id): id is string => !!id),
    ),
  );
}

function invalidateControlCenter(qc: ReturnType<typeof useQueryClient>, orgId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.operations.controlCenter(orgId) });
  qc.invalidateQueries({ queryKey: queryKeys.operations.healthSnapshot(orgId) });
}

export function useOperationsBatchActions(input: {
  organizationId: string | null;
  actorUserId: string | null;
}) {
  const qc = useQueryClient();

  const approveSelected = useMutation({
    mutationFn: async (items: OperationalQueueItem[]) => {
      for (const item of items) {
        if (!item.trip) continue;
        if (item.sourceType === "fuel") {
          const approval = await updateTripFuelApprovalState({
            entryId: item.sourceId,
            approvalState: "approved",
            approvedBy: input.actorUserId,
            ledgerState: "not_posted",
          });
          if (approval.error) throw approval.error;
          await evaluateAndPostFuelEntry({
            tripId: item.trip.tripId,
            fuelEntryId: item.sourceId,
            approvedBy: input.actorUserId,
          });
        } else if (item.sourceType === "toll") {
          const approval = await updateTripTollApprovalState({
            entryId: item.sourceId,
            approvalState: "approved",
            approvedBy: input.actorUserId,
            ledgerState: "not_posted",
          });
          if (approval.error) throw approval.error;
          await evaluateAndPostTollEntry({
            tripId: item.trip.tripId,
            tollEntryId: item.sourceId,
            approvedBy: input.actorUserId,
          });
        }
      }
    },
    onSuccess: (_result, vars) => {
      if (!input.organizationId) return;
      for (const tripId of uniqueTripIds(vars)) {
        const vehicleId =
          vars.find((item) => item.trip?.tripId === tripId)?.trip?.vehicleId ?? null;
        syncOperationalFinanceProjection({
          queryClient: qc,
          organizationId: input.organizationId,
          tripId,
          vehicleId,
        });
      }
      invalidateControlCenter(qc, input.organizationId);
    },
  });

  const rejectSelected = useMutation({
    mutationFn: async (items: OperationalQueueItem[]) => {
      for (const item of items) {
        if (item.sourceType === "fuel") {
          const approval = await updateTripFuelApprovalState({
            entryId: item.sourceId,
            approvalState: "rejected",
            approvedBy: input.actorUserId,
            ledgerState: "void",
          });
          if (approval.error) throw approval.error;
        } else if (item.sourceType === "toll") {
          const approval = await updateTripTollApprovalState({
            entryId: item.sourceId,
            approvalState: "rejected",
            approvedBy: input.actorUserId,
            ledgerState: "void",
          });
          if (approval.error) throw approval.error;
        }
      }
    },
    onSuccess: (_result, vars) => {
      if (!input.organizationId) return;
      for (const tripId of uniqueTripIds(vars)) {
        invalidateTripOperationalState({
          queryClient: qc,
          tripId,
          organizationId: input.organizationId,
        });
      }
      invalidateControlCenter(qc, input.organizationId);
    },
  });

  const reconcileSelected = useMutation({
    mutationFn: async (items: OperationalQueueItem[]) => {
      const tripIds = uniqueTripIds(items);
      for (const tripId of tripIds) {
        const res = await reconcileOperationalPosting({
          tripId,
          actorUserId: input.actorUserId,
        });
        if (res.error) throw res.error;
      }
    },
    onSuccess: (_result, vars) => {
      if (!input.organizationId) return;
      for (const tripId of uniqueTripIds(vars)) {
        invalidateReconciliationState({
          queryClient: qc,
          organizationId: input.organizationId,
          tripId,
        });
        invalidateTripOperationalState({
          queryClient: qc,
          tripId,
          organizationId: input.organizationId,
        });
      }
      invalidateControlCenter(qc, input.organizationId);
    },
  });

  const markReimbursed = useMutation({
    mutationFn: async (items: OperationalQueueItem[]) => {
      for (const item of items) {
        if (!item.trip) continue;
        if (item.sourceType === "fuel") {
          const res = await updateFuelReimbursementState({
            entryId: item.sourceId,
            actorUserId: input.actorUserId,
            nextState: "reimbursed",
          });
          if (res.error) throw res.error;
        } else if (item.sourceType === "toll") {
          const res = await updateTollReimbursementState({
            entryId: item.sourceId,
            actorUserId: input.actorUserId,
            nextState: "reimbursed",
          });
          if (res.error) throw res.error;
        }
      }
    },
    onSuccess: (_result, vars) => {
      if (!input.organizationId) return;
      for (const tripId of uniqueTripIds(vars)) {
        invalidateTripOperationalState({
          queryClient: qc,
          tripId,
          organizationId: input.organizationId,
        });
        invalidateOperationalIdentity({
          queryClient: qc,
          organizationId: input.organizationId,
          tripId,
        });
      }
      invalidateControlCenter(qc, input.organizationId);
    },
  });

  return {
    approveSelected,
    rejectSelected,
    reconcileSelected,
    markReimbursed,
  };
}
