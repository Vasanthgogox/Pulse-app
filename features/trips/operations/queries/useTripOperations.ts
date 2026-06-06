import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsOnline } from "@/contexts/NetworkContext";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { getTripById } from "@/features/trips/services/trips.service";
import { computeTripMileageMetrics } from "../mileage/mileageEngine";
import type {
  OperationalApprovalState,
  ReimbursementState,
  SaveFuelEntryInput,
  SaveOtherExpenseInput,
  SaveTollEntryInput,
  UpdateFuelEntryInput,
  UpdateOtherExpenseInput,
  UpdateTollEntryInput,
} from "../types";
import { getTripOperationalCapabilities } from "@/features/trips/capabilities";
import {
  invalidateLedgerState,
  invalidateOperationalIdentity,
  invalidateReconciliationState,
  invalidateTripOperationalState,
} from "@/lib/queries/operationalInvalidation";
import { syncOperationalFinanceProjection } from "@/features/finance/projections/syncOperationalFinanceProjection";
import type {
  TripCostEvent,
  TripCostFinancialSnapshot,
} from "@/features/finance/domain/tripCostEvent";
import {
  deriveTripCostFinancialSnapshot,
  mapTripOperationalRowsToCostEvents,
} from "@/features/finance/mappers/tripCostEventMappers";
import {
  selectAggregateTripBrokerageMargin,
  selectAggregateTripNetMargin,
  selectAggregateTripSupplierCost,
  selectAssetTripActualMargin,
  selectAssetTripCostPerKm,
  selectAssetTripMarginImpact,
  selectAssetTripOutstandingPayables,
  selectAssetTripPostedExpenses,
} from "@/features/finance/selectors/tripAccountingSelectors";
import {
  selectTripAccountingIntegrity,
  selectTripPostingIntegrity,
} from "@/features/finance/selectors/integritySelectors";
import {
  createTripFuelEntry,
  getTripFuelEntries,
  updateTripFuelApprovalState,
  updateTripFuelEntry,
  uploadFuelBillPhoto,
} from "../fuel/fuel.service";
import {
  createTripTollEntry,
  getTripTollEntries,
  updateTripTollApprovalState,
  updateTripTollEntry,
  uploadTollReceiptPhoto,
} from "../toll/toll.service";
import {
  createTripOtherExpense,
  getTripOtherExpenses,
  updateTripOtherExpense,
  updateTripOtherExpenseApprovalState,
  uploadOtherExpenseReceiptPhoto,
} from "../other/otherExpense.service";
import { compressOperationsPhoto } from "../uploads/photoUploads";
import {
  evaluateAndPostFuelEntry,
  evaluateAndPostOtherExpenseEntry,
  evaluateAndPostTollEntry,
} from "@/features/ledger/vehicle";
import {
  describeVehiclePostingFailure,
  isVehiclePostingSuccess,
} from "@/features/ledger/vehicle/postingMessages.util";
import { getTripOperationalTimelineEvents } from "../timeline/timelineEvents.service";
import { getVehicleMaintenanceEntries } from "../maintenance/maintenance.service";
import {
  updateFuelReimbursementState,
  updateOtherReimbursementState,
  updateTollReimbursementState,
} from "../reimbursement/reimbursement.service";
import {
  enqueueFuelMetadata,
  enqueueFuelPhoto,
  enqueueTollMetadata,
  enqueueTollPhoto,
} from "../offline/outbox";
import { supabase } from "@/lib/supabase";
import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";

const reviewInFlightKeys = new Set<string>();

function invalidateTripOperationsQueries(qc: ReturnType<typeof useQueryClient>, tripId: string) {
  invalidateTripOperationalState({ queryClient: qc, tripId });
}

export function useTripFuelEntries(tripId: string | null, opts?: { enabled?: boolean }) {
  const enabled = (opts?.enabled ?? true) && !!tripId;
  return useQuery({
    queryKey: tripId ? queryKeys.trips.fuelEntries(tripId) : ["q", "trips", "fuel", "noop"],
    queryFn: async () => {
      const res = await getTripFuelEntries(tripId!);
      if (res.error) throw res.error;
      return res.entries;
    },
    enabled,
    staleTime: STALE.frequent,
  });
}

export function useTripTollEntries(tripId: string | null, opts?: { enabled?: boolean }) {
  const enabled = (opts?.enabled ?? true) && !!tripId;
  return useQuery({
    queryKey: tripId ? queryKeys.trips.tollEntries(tripId) : ["q", "trips", "toll", "noop"],
    queryFn: async () => {
      const res = await getTripTollEntries(tripId!);
      if (res.error) throw res.error;
      return res.entries;
    },
    enabled,
    staleTime: STALE.frequent,
  });
}

export function useTripOtherExpenses(tripId: string | null, opts?: { enabled?: boolean }) {
  const enabled = (opts?.enabled ?? true) && !!tripId;
  return useQuery({
    queryKey: tripId ? queryKeys.trips.otherEntries(tripId) : ["q", "trips", "other", "noop"],
    queryFn: async () => {
      const res = await getTripOtherExpenses(tripId!);
      if (res.error) throw res.error;
      return res.entries;
    },
    enabled,
    staleTime: STALE.frequent,
  });
}

export function useTripOperationsSummary(tripId: string | null, opts?: { enabled?: boolean }) {
  const enabled = (opts?.enabled ?? true) && !!tripId;
  return useQuery({
    queryKey: tripId
      ? queryKeys.trips.operationsSummary(tripId)
      : ["q", "trips", "operations", "summary", "noop"],
    queryFn: async () => {
      const [tripRes, fuelRes, tollRes, otherRes] = await Promise.all([
        getTripById(tripId!),
        getTripFuelEntries(tripId!),
        getTripTollEntries(tripId!),
        getTripOtherExpenses(tripId!),
      ]);
      if (tripRes.error || !tripRes.trip) throw tripRes.error ?? new Error("Trip not found");
      if (fuelRes.error) throw fuelRes.error;
      if (tollRes.error) throw tollRes.error;
      if (otherRes.error) throw otherRes.error;
      const maintenanceRes =
        tripRes.trip.vehicle_id != null
          ? await getVehicleMaintenanceEntries({
              organizationId: tripRes.trip.organization_id,
              vehicleId: tripRes.trip.vehicle_id,
              limit: 200,
            })
          : { error: null, entries: [] };
      if (maintenanceRes.error) throw maintenanceRes.error;
      const { data: ledgerRows, error: ledgerError } = await supabase()
        .from("vehicle_ledger_entries")
        .select("id,source_type,source_id")
        .eq("trip_id", tripId!)
        .in("source_type", ["fuel", "toll", "manual_adjustment"]);
      if (ledgerError) throw new Error(ledgerError.message);
      const ledgerBySource: {
        fuel: Record<string, string>;
        toll: Record<string, string>;
        other: Record<string, string>;
      } = {
        fuel: {},
        toll: {},
        other: {},
      };
      for (const row of ledgerRows ?? []) {
        const sourceType = String((row as { source_type?: string | null }).source_type ?? "").toLowerCase();
        const sourceId = String((row as { source_id?: string | null }).source_id ?? "").trim();
        const ledgerId = String((row as { id?: string | null }).id ?? "").trim();
        if (!sourceId || !ledgerId) continue;
        if (sourceType === "fuel") ledgerBySource.fuel[sourceId] = ledgerId;
        if (sourceType === "toll") ledgerBySource.toll[sourceId] = ledgerId;
        if (sourceType === "manual_adjustment") ledgerBySource.other[sourceId] = ledgerId;
      }
      const mileage = computeTripMileageMetrics({
        trip: tripRes.trip,
        fuelEntries: fuelRes.entries,
        tollEntries: tollRes.entries,
        maintenanceEntries: maintenanceRes.entries,
        capabilities: getTripOperationalCapabilities(tripRes.trip),
      });
      const capabilities = getTripOperationalCapabilities(tripRes.trip);
      const executionModel = getTripExecutionModel(tripRes.trip);
      const costEvents: TripCostEvent[] = mapTripOperationalRowsToCostEvents({
        fuelEntries: fuelRes.entries,
        tollEntries: tollRes.entries,
        otherEntries: otherRes.entries,
        tripDisplay: {
          trip_operational_code: tripRes.trip.trip_operational_code ?? null,
          trip_code: tripRes.trip.trip_code ?? null,
          display_trip_id: tripRes.trip.display_trip_id ?? null,
          trip_number: tripRes.trip.trip_number ?? null,
        },
        ledgerBySource,
      });
      const financialSnapshot: TripCostFinancialSnapshot = deriveTripCostFinancialSnapshot({
        events: costEvents,
        distanceKm: mileage.distanceKm ?? null,
      });
      const assetPnL =
        executionModel === "asset"
          ? {
              actualMarginInr: selectAssetTripActualMargin({
                trip: tripRes.trip,
                events: costEvents,
              }),
              costPerKm: selectAssetTripCostPerKm({
                trip: tripRes.trip,
                events: costEvents,
              }),
              marginImpactPercent: selectAssetTripMarginImpact({
                trip: tripRes.trip,
                events: costEvents,
              }),
            }
          : null;
      const integrity =
        executionModel === "asset"
          ? {
              trip: selectTripAccountingIntegrity({
                trip: tripRes.trip,
                events: costEvents,
              }),
              posting: selectTripPostingIntegrity(costEvents),
            }
          : null;
      const aggregatePnL =
        executionModel === "aggregate"
          ? {
              supplierCostInr: selectAggregateTripSupplierCost({
                trip: tripRes.trip,
                adjustments: [],
              }),
              brokerageMarginInr: selectAggregateTripBrokerageMargin({
                trip: tripRes.trip,
                adjustments: [],
              }),
              netMarginInr: selectAggregateTripNetMargin({
                trip: tripRes.trip,
                adjustments: [],
              }),
            }
          : null;
      return {
        trip: tripRes.trip,
        executionModel,
        capabilities,
        fuelEntries: fuelRes.entries,
        tollEntries: tollRes.entries,
        otherEntries: otherRes.entries,
        maintenanceEntries: maintenanceRes.entries,
        mileage,
        costEvents,
        financialSnapshot,
        assetPnL,
        aggregatePnL,
        integrity,
        lifecycle:
          executionModel === "asset"
            ? {
                approvedCostsInr: financialSnapshot.approvedOperationalCostInr,
                postedToLedgerInr: selectAssetTripPostedExpenses(costEvents),
                pendingPostingInr: Math.max(
                  0,
                  financialSnapshot.approvedOperationalCostInr - selectAssetTripPostedExpenses(costEvents),
                ),
                outstandingReimbursementInr: selectAssetTripOutstandingPayables(costEvents),
                marginImpacted: selectAssetTripMarginImpact({
                  trip: tripRes.trip,
                  events: costEvents,
                }) > 0,
              }
            : null,
      };
    },
    enabled,
    staleTime: STALE.frequent,
  });
}

export function useTripOperationalTimeline(tripId: string | null, opts?: { enabled?: boolean }) {
  const enabled = (opts?.enabled ?? true) && !!tripId;
  return useQuery({
    queryKey: tripId
      ? queryKeys.trips.operationsTimeline(tripId)
      : ["q", "trips", "operations", "timeline", "noop"],
    queryFn: async () => {
      const res = await getTripOperationalTimelineEvents({ tripId: tripId!, limit: 80 });
      if (res.error) throw res.error;
      return res.events;
    },
    enabled,
    staleTime: STALE.frequent,
  });
}

export function useSaveTripFuelEntry() {
  const isOnline = useIsOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveFuelEntryInput) => {
      const basePayload = {
        tripId: input.tripId,
        amountInr: input.amountInr,
        liters: input.liters,
        fuelType: input.fuelType,
        stationName: input.stationName,
        notes: input.notes,
        enteredBy: input.enteredBy,
        actorRole: input.actorRole ?? null,
        paymentOwner: input.paymentOwner ?? null,
        paymentMode: input.paymentMode ?? null,
      };

      if (!isOnline) {
        await enqueueFuelMetadata(basePayload);
        if (input.billPhotoLocalUri) {
          await enqueueFuelPhoto({
            tripId: input.tripId,
            userId: input.enteredBy,
            localUri: input.billPhotoLocalUri,
          });
        }
        return { queued: true };
      }

      let billStoragePath: string | null = null;
      if (input.billPhotoLocalUri && input.enteredBy) {
        try {
          const arrayBuffer = await compressOperationsPhoto(input.billPhotoLocalUri);
          const upload = await uploadFuelBillPhoto({
            tripId: input.tripId,
            userId: input.enteredBy,
            arrayBuffer,
            fileName: `fuel-bill-${Date.now()}.jpg`,
          });
          if (!upload.error) billStoragePath = upload.storagePath;
          else {
            await enqueueFuelPhoto({
              tripId: input.tripId,
              userId: input.enteredBy,
              localUri: input.billPhotoLocalUri,
            });
          }
        } catch {
          await enqueueFuelPhoto({
            tripId: input.tripId,
            userId: input.enteredBy,
            localUri: input.billPhotoLocalUri,
          });
        }
      }

      const save = await createTripFuelEntry({ ...basePayload, billStoragePath });
      if (save.error) {
        await enqueueFuelMetadata(basePayload);
        return { queued: true };
      }
      return { queued: false };
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      qc.invalidateQueries({ queryKey: queryKeys.operations.observabilityByTrip(vars.tripId) });
    },
  });
}

export function useUpdateTripFuelEntry() {
  const isOnline = useIsOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateFuelEntryInput) => {
      if (!isOnline) {
        throw new Error("Editing fuel entries requires an internet connection.");
      }
      let billStoragePath: string | undefined;
      if (input.billPhotoLocalUri && input.enteredBy) {
        const arrayBuffer = await compressOperationsPhoto(input.billPhotoLocalUri);
        const upload = await uploadFuelBillPhoto({
          tripId: input.tripId,
          userId: input.enteredBy,
          arrayBuffer,
          fileName: `fuel-bill-${Date.now()}.jpg`,
        });
        if (upload.error) throw upload.error;
        billStoragePath = upload.storagePath ?? undefined;
      }
      const save = await updateTripFuelEntry({ ...input, billStoragePath });
      if (save.error) throw save.error;
      return save.entry;
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      qc.invalidateQueries({ queryKey: queryKeys.operations.observabilityByTrip(vars.tripId) });
    },
  });
}

export function useSaveTripTollEntry() {
  const isOnline = useIsOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveTollEntryInput) => {
      const basePayload = {
        tripId: input.tripId,
        amountInr: input.amountInr,
        plazaName: input.plazaName,
        notes: input.notes,
        isEstimated: input.isEstimated,
        enteredBy: input.enteredBy,
        actorRole: input.actorRole ?? null,
        paymentOwner: input.paymentOwner ?? null,
        paymentMode: input.paymentMode ?? null,
      };

      if (!isOnline) {
        await enqueueTollMetadata(basePayload);
        if (input.receiptLocalUri) {
          await enqueueTollPhoto({
            tripId: input.tripId,
            userId: input.enteredBy,
            localUri: input.receiptLocalUri,
          });
        }
        return { queued: true };
      }

      let receiptStoragePath: string | null = null;
      if (input.receiptLocalUri && input.enteredBy) {
        try {
          const arrayBuffer = await compressOperationsPhoto(input.receiptLocalUri);
          const upload = await uploadTollReceiptPhoto({
            tripId: input.tripId,
            userId: input.enteredBy,
            arrayBuffer,
            fileName: `toll-receipt-${Date.now()}.jpg`,
          });
          if (!upload.error) receiptStoragePath = upload.storagePath;
          else {
            await enqueueTollPhoto({
              tripId: input.tripId,
              userId: input.enteredBy,
              localUri: input.receiptLocalUri,
            });
          }
        } catch {
          await enqueueTollPhoto({
            tripId: input.tripId,
            userId: input.enteredBy,
            localUri: input.receiptLocalUri,
          });
        }
      }

      const save = await createTripTollEntry({ ...basePayload, receiptStoragePath });
      if (save.error) {
        await enqueueTollMetadata(basePayload);
        return { queued: true };
      }
      return { queued: false };
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      qc.invalidateQueries({ queryKey: queryKeys.operations.observabilityByTrip(vars.tripId) });
    },
  });
}

export function useUpdateTripTollEntry() {
  const isOnline = useIsOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTollEntryInput) => {
      if (!isOnline) {
        throw new Error("Editing toll entries requires an internet connection.");
      }
      let receiptStoragePath: string | undefined;
      if (input.receiptLocalUri && input.enteredBy) {
        const arrayBuffer = await compressOperationsPhoto(input.receiptLocalUri);
        const upload = await uploadTollReceiptPhoto({
          tripId: input.tripId,
          userId: input.enteredBy,
          arrayBuffer,
          fileName: `toll-receipt-${Date.now()}.jpg`,
        });
        if (upload.error) throw upload.error;
        receiptStoragePath = upload.storagePath ?? undefined;
      }
      const save = await updateTripTollEntry({ ...input, receiptStoragePath });
      if (save.error) throw save.error;
      return save.entry;
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      qc.invalidateQueries({ queryKey: queryKeys.operations.observabilityByTrip(vars.tripId) });
    },
  });
}

export function useReviewTripFuelEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tripId: string;
      fuelEntryId: string;
      approvalState: OperationalApprovalState;
      reviewerUserId: string | null;
    }) => {
      const opKey = `fuel:${input.tripId}:${input.fuelEntryId}:${input.approvalState}`;
      if (reviewInFlightKeys.has(opKey)) return null;
      reviewInFlightKeys.add(opKey);
      try {
      const nextLedgerState =
        input.approvalState === "approved" ? "not_posted" : "void";
      const approvalRes = await updateTripFuelApprovalState({
        entryId: input.fuelEntryId,
        approvalState: input.approvalState,
        approvedBy: input.reviewerUserId,
        ledgerState: nextLedgerState,
      });
      if (approvalRes.error) throw approvalRes.error;
      if (input.approvalState === "approved") {
        const postRes = await evaluateAndPostFuelEntry({
          tripId: input.tripId,
          fuelEntryId: input.fuelEntryId,
          approvedBy: input.reviewerUserId,
        });
        if (postRes.error) throw postRes.error;
        if (!isVehiclePostingSuccess(postRes.reason, postRes.posted)) {
          throw new Error(describeVehiclePostingFailure(postRes.reason));
        }
      }
      return approvalRes.entry;
      } finally {
        reviewInFlightKeys.delete(opKey);
      }
    },
    onSuccess: (_result, vars) => {
      const summary = qc.getQueryData<{
        trip?: { organization_id?: string | null; vehicle_id?: string | null };
      }>(queryKeys.trips.operationsSummary(vars.tripId));
      const orgId = String(summary?.trip?.organization_id ?? "");
      const vehicleId = qc.getQueryData<{
        trip?: { vehicle_id?: string | null };
      }>(queryKeys.trips.operationsSummary(vars.tripId))?.trip?.vehicle_id;
      invalidateTripOperationsQueries(qc, vars.tripId);
      if (orgId) {
        syncOperationalFinanceProjection({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
          vehicleId: vehicleId ?? null,
        });
        invalidateLedgerState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
      }
    },
  });
}

export function useReviewTripTollEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tripId: string;
      tollEntryId: string;
      approvalState: OperationalApprovalState;
      reviewerUserId: string | null;
    }) => {
      const opKey = `toll:${input.tripId}:${input.tollEntryId}:${input.approvalState}`;
      if (reviewInFlightKeys.has(opKey)) return null;
      reviewInFlightKeys.add(opKey);
      try {
      const nextLedgerState =
        input.approvalState === "approved" ? "not_posted" : "void";
      const approvalRes = await updateTripTollApprovalState({
        entryId: input.tollEntryId,
        approvalState: input.approvalState,
        approvedBy: input.reviewerUserId,
        ledgerState: nextLedgerState,
      });
      if (approvalRes.error) throw approvalRes.error;
      if (input.approvalState === "approved") {
        const postRes = await evaluateAndPostTollEntry({
          tripId: input.tripId,
          tollEntryId: input.tollEntryId,
          approvedBy: input.reviewerUserId,
        });
        if (postRes.error) throw postRes.error;
        if (!isVehiclePostingSuccess(postRes.reason, postRes.posted)) {
          throw new Error(describeVehiclePostingFailure(postRes.reason));
        }
      }
      return approvalRes.entry;
      } finally {
        reviewInFlightKeys.delete(opKey);
      }
    },
    onSuccess: (_result, vars) => {
      const orgId = String(
        qc.getQueryData<{ trip?: { organization_id?: string | null } }>(
          queryKeys.trips.operationsSummary(vars.tripId),
        )?.trip?.organization_id ?? "",
      );
      const vehicleId =
        qc.getQueryData<{ trip?: { vehicle_id?: string | null } }>(
          queryKeys.trips.operationsSummary(vars.tripId),
        )?.trip?.vehicle_id ?? null;
      invalidateTripOperationsQueries(qc, vars.tripId);
      if (orgId) {
        syncOperationalFinanceProjection({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
          vehicleId,
        });
        invalidateLedgerState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
      }
    },
  });
}

export function useSetTripFuelReimbursementState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tripId: string;
      fuelEntryId: string;
      nextState: ReimbursementState;
      actorUserId: string | null;
      notes?: string | null;
    }) => {
      const res = await updateFuelReimbursementState({
        entryId: input.fuelEntryId,
        nextState: input.nextState,
        actorUserId: input.actorUserId,
        notes: input.notes,
      });
      if (res.error) throw res.error;
      return res.entry;
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      const summary = qc.getQueryData<{ trip?: { organization_id?: string | null } }>(
        queryKeys.trips.operationsSummary(vars.tripId),
      );
      const orgId = String(summary?.trip?.organization_id ?? "");
      if (orgId) {
        invalidateLedgerState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
        invalidateReconciliationState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
      }
    },
  });
}

export function useSetTripTollReimbursementState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tripId: string;
      tollEntryId: string;
      nextState: ReimbursementState;
      actorUserId: string | null;
      notes?: string | null;
    }) => {
      const res = await updateTollReimbursementState({
        entryId: input.tollEntryId,
        nextState: input.nextState,
        actorUserId: input.actorUserId,
        notes: input.notes,
      });
      if (res.error) throw res.error;
      return res.entry;
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      const summary = qc.getQueryData<{ trip?: { organization_id?: string | null } }>(
        queryKeys.trips.operationsSummary(vars.tripId),
      );
      const orgId = String(summary?.trip?.organization_id ?? "");
      if (orgId) {
        invalidateLedgerState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
        invalidateReconciliationState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
        invalidateOperationalIdentity({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
      }
    },
  });
}

export function useSaveTripOtherExpense() {
  const isOnline = useIsOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveOtherExpenseInput) => {
      if (!isOnline) {
        throw new Error("Other trip expenses require an internet connection.");
      }
      let receiptStoragePath: string | null = null;
      if (input.receiptLocalUri && input.enteredBy) {
        const arrayBuffer = await compressOperationsPhoto(input.receiptLocalUri);
        const upload = await uploadOtherExpenseReceiptPhoto({
          tripId: input.tripId,
          userId: input.enteredBy,
          arrayBuffer,
          fileName: `trip-expense-${Date.now()}.jpg`,
        });
        if (upload.error) throw upload.error;
        receiptStoragePath = upload.storagePath;
      }
      const save = await createTripOtherExpense({
        tripId: input.tripId,
        expenseCategory: input.expenseCategory,
        amountInr: input.amountInr,
        description: input.description,
        locationName: input.locationName,
        notes: input.notes,
        enteredBy: input.enteredBy,
        actorRole: input.actorRole ?? null,
        paymentOwner: input.paymentOwner ?? null,
        paymentMode: input.paymentMode ?? null,
        receiptStoragePath,
      });
      if (save.error) throw save.error;
      return { queued: false };
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      qc.invalidateQueries({ queryKey: queryKeys.operations.observabilityByTrip(vars.tripId) });
    },
  });
}

export function useUpdateTripOtherExpense() {
  const isOnline = useIsOnline();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateOtherExpenseInput) => {
      if (!isOnline) {
        throw new Error("Editing trip expenses requires an internet connection.");
      }
      let receiptStoragePath: string | undefined;
      if (input.receiptLocalUri && input.enteredBy) {
        const arrayBuffer = await compressOperationsPhoto(input.receiptLocalUri);
        const upload = await uploadOtherExpenseReceiptPhoto({
          tripId: input.tripId,
          userId: input.enteredBy,
          arrayBuffer,
          fileName: `trip-expense-${Date.now()}.jpg`,
        });
        if (upload.error) throw upload.error;
        receiptStoragePath = upload.storagePath ?? undefined;
      }
      const save = await updateTripOtherExpense({ ...input, receiptStoragePath });
      if (save.error) throw save.error;
      return save.entry;
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      qc.invalidateQueries({ queryKey: queryKeys.operations.observabilityByTrip(vars.tripId) });
    },
  });
}

export function useReviewTripOtherExpenseEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tripId: string;
      otherEntryId: string;
      approvalState: OperationalApprovalState;
      reviewerUserId: string | null;
    }) => {
      const opKey = `other:${input.tripId}:${input.otherEntryId}:${input.approvalState}`;
      if (reviewInFlightKeys.has(opKey)) return null;
      reviewInFlightKeys.add(opKey);
      try {
        const nextLedgerState =
          input.approvalState === "approved" ? "not_posted" : "void";
        const approvalRes = await updateTripOtherExpenseApprovalState({
          entryId: input.otherEntryId,
          approvalState: input.approvalState,
          approvedBy: input.reviewerUserId,
          ledgerState: nextLedgerState,
        });
        if (approvalRes.error) throw approvalRes.error;
        if (input.approvalState === "approved") {
          const postRes = await evaluateAndPostOtherExpenseEntry({
            tripId: input.tripId,
            otherEntryId: input.otherEntryId,
            approvedBy: input.reviewerUserId,
          });
          if (postRes.error) throw postRes.error;
          if (!isVehiclePostingSuccess(postRes.reason, postRes.posted)) {
            throw new Error(describeVehiclePostingFailure(postRes.reason));
          }
        }
        return approvalRes.entry;
      } finally {
        reviewInFlightKeys.delete(opKey);
      }
    },
    onSuccess: (_result, vars) => {
      const orgId = String(
        qc.getQueryData<{ trip?: { organization_id?: string | null } }>(
          queryKeys.trips.operationsSummary(vars.tripId),
        )?.trip?.organization_id ?? "",
      );
      const vehicleId =
        qc.getQueryData<{ trip?: { vehicle_id?: string | null } }>(
          queryKeys.trips.operationsSummary(vars.tripId),
        )?.trip?.vehicle_id ?? null;
      invalidateTripOperationsQueries(qc, vars.tripId);
      if (orgId) {
        syncOperationalFinanceProjection({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
          vehicleId,
        });
        invalidateLedgerState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
      }
    },
  });
}

export function useSetTripOtherReimbursementState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tripId: string;
      otherEntryId: string;
      nextState: ReimbursementState;
      actorUserId: string | null;
      notes?: string | null;
    }) => {
      const res = await updateOtherReimbursementState({
        entryId: input.otherEntryId,
        nextState: input.nextState,
        actorUserId: input.actorUserId,
        notes: input.notes,
      });
      if (res.error) throw res.error;
      return res.entry;
    },
    onSuccess: (_result, vars) => {
      invalidateTripOperationsQueries(qc, vars.tripId);
      const summary = qc.getQueryData<{ trip?: { organization_id?: string | null } }>(
        queryKeys.trips.operationsSummary(vars.tripId),
      );
      const orgId = String(summary?.trip?.organization_id ?? "");
      if (orgId) {
        invalidateLedgerState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
        invalidateReconciliationState({
          queryClient: qc,
          organizationId: orgId,
          tripId: vars.tripId,
        });
      }
    },
  });
}
