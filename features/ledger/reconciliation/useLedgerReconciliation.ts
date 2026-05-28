import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { appendTripOperationalTimelineEventSafe } from "@/features/trips/operations/timeline/timelineEvents.service";
import {
  reconcileOperationalPosting,
  reconcileVehicleLedgerState,
} from "@/features/ledger/vehicle/reconciliation/reconciliation.service";
import { getTripsByOrganization } from "@/features/trips/services/trips.service";
import { queryKeys } from "@/lib/queryKeys";
import { syncOperationalFinanceProjection } from "@/features/finance/projections";
import { invalidateReconciliationState } from "@/lib/queries/operationalInvalidation";

const MARKS_KEY = "ledger_reconciliation_marks_v1";

type MarkState = "ignored" | "resolved";

interface MarkRecord {
  sourceType: string;
  sourceId: string;
  state: MarkState;
  updatedAt: string;
}

export interface ReconciliationMismatchView {
  mismatchId: string;
  tripId: string;
  tripLabel: string;
  sourceType: "fuel" | "toll";
  sourceId: string;
  postingState: string;
  ledgerState: string;
  shouldPost: boolean;
  hasLedgerEntry: boolean;
  markState: MarkState | null;
}

async function readMarks(): Promise<Record<string, MarkRecord>> {
  try {
    const raw = await AsyncStorage.getItem(MARKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, MarkRecord>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function writeMark(key: string, mark: MarkRecord): Promise<void> {
  const current = await readMarks();
  current[key] = mark;
  await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(current));
}

function markKey(sourceType: string, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

export function useLedgerReconciliation(input: {
  organizationId: string | null;
  tripId?: string | null;
  enabled?: boolean;
}) {
  const enabled =
    (input.enabled ?? true) && (!!input.tripId || !!input.organizationId);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: input.tripId
      ? queryKeys.operations.ledgerReconciliationByTrip(input.tripId)
      : input.organizationId
        ? queryKeys.operations.ledgerReconciliationByOrg(input.organizationId)
        : ["q", "operations", "ledger-reconciliation", "noop"],
    queryFn: async () => {
      const marks = await readMarks();
      const tripCandidates: Array<{
        tripId: string;
        tripLabel: string;
      }> = [];
      if (input.tripId) {
        if (input.organizationId) {
          const tripRes = await getTripsByOrganization(input.organizationId, {
            limit: 40,
            offset: 0,
          });
          if (!tripRes.error) {
            const trip = tripRes.trips.find((row) => row.id === input.tripId);
            if (trip) {
              tripCandidates.push({
                tripId: trip.id,
                tripLabel: getTripOperationalDisplay({
                  trip_operational_code: trip.trip_operational_code,
                  trip_code: trip.trip_code,
                  display_trip_id: trip.display_trip_id,
                  trip_number: trip.trip_number,
                }),
              });
            } else {
              tripCandidates.push({
                tripId: input.tripId,
                tripLabel: input.tripId,
              });
            }
          }
        } else {
          tripCandidates.push({
            tripId: input.tripId,
            tripLabel: input.tripId,
          });
        }
      } else {
        const tripsRes = await getTripsByOrganization(input.organizationId!, {
          limit: 60,
          offset: 0,
        });
        if (tripsRes.error) throw tripsRes.error;
        for (const trip of tripsRes.trips) {
          const mode = String(trip.trip_payout_mode ?? "").toLowerCase();
          const isAssetTrip = mode === "asset" || (!mode && !trip.supplier_id);
          if (!isAssetTrip) continue;
          tripCandidates.push({
            tripId: trip.id,
            tripLabel: getTripOperationalDisplay({
              trip_operational_code: trip.trip_operational_code,
              trip_code: trip.trip_code,
              display_trip_id: trip.display_trip_id,
              trip_number: trip.trip_number,
            }),
          });
        }
      }
      const rows: ReconciliationMismatchView[] = [];
      for (const trip of tripCandidates.slice(0, 30)) {
        const recon = await reconcileVehicleLedgerState({ tripId: trip.tripId });
        if (recon.error) continue;
        for (const mismatch of recon.mismatches) {
          const key = markKey(mismatch.sourceType, mismatch.sourceId);
          rows.push({
            mismatchId: `${trip.tripId}:${key}`,
            tripId: trip.tripId,
            tripLabel: trip.tripLabel,
            sourceType: mismatch.sourceType,
            sourceId: mismatch.sourceId,
            postingState: mismatch.postingState,
            ledgerState: mismatch.ledgerState,
            shouldPost: mismatch.shouldPost,
            hasLedgerEntry: mismatch.hasLedgerEntry,
            markState: marks[key]?.state ?? null,
          });
        }
      }
      return rows.filter((row) => row.markState !== "resolved");
    },
    enabled,
    staleTime: 20_000,
  });

  const retryPosting = useMutation({
    mutationFn: async (rows: ReconciliationMismatchView[]) => {
      const tripIds = Array.from(new Set(rows.map((row) => row.tripId)));
      for (const tripId of tripIds) {
        const res = await reconcileOperationalPosting({
          tripId,
          actorUserId: null,
        });
        if (res.error) throw res.error;
      }
    },
    onSuccess: () => {
      if (input.tripId && input.organizationId) {
        syncOperationalFinanceProjection({
          queryClient: qc,
          organizationId: input.organizationId,
          tripId: input.tripId,
        });
      } else if (input.organizationId) {
        invalidateReconciliationState({
          queryClient: qc,
          organizationId: input.organizationId,
        });
      }
    },
  });

  const markIgnored = useMutation({
    mutationFn: async (rows: ReconciliationMismatchView[]) => {
      for (const row of rows) {
        const key = markKey(row.sourceType, row.sourceId);
        await writeMark(key, {
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          state: "ignored",
          updatedAt: new Date().toISOString(),
        });
        await appendTripOperationalTimelineEventSafe({
          tripId: row.tripId,
          eventType: "reimbursement_flagged",
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          actorUserId: null,
          payload: { action: "reconciliation_ignored", reason: "operator_marked_ignored" },
        });
      }
    },
    onSuccess: () => {
      if (input.tripId && input.organizationId) {
        syncOperationalFinanceProjection({
          queryClient: qc,
          organizationId: input.organizationId,
          tripId: input.tripId,
        });
      } else if (input.organizationId) {
        invalidateReconciliationState({
          queryClient: qc,
          organizationId: input.organizationId,
        });
      }
    },
  });

  const markResolved = useMutation({
    mutationFn: async (rows: ReconciliationMismatchView[]) => {
      for (const row of rows) {
        const key = markKey(row.sourceType, row.sourceId);
        await writeMark(key, {
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          state: "resolved",
          updatedAt: new Date().toISOString(),
        });
        await appendTripOperationalTimelineEventSafe({
          tripId: row.tripId,
          eventType: "posting_completed",
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          actorUserId: null,
          payload: { action: "reconciliation_resolved", reason: "operator_marked_resolved" },
        });
      }
    },
    onSuccess: () => {
      if (input.tripId && input.organizationId) {
        syncOperationalFinanceProjection({
          queryClient: qc,
          organizationId: input.organizationId,
          tripId: input.tripId,
        });
      } else if (input.organizationId) {
        invalidateReconciliationState({
          queryClient: qc,
          organizationId: input.organizationId,
        });
      }
    },
  });

  return {
    ...query,
    retryPosting,
    markIgnored,
    markResolved,
  };
}
