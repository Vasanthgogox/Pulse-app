import { useCallback, useState } from 'react';
import {
  assignAggregateTripDriverByPhone,
  assignTripDriverByPhone,
  getActiveDriverAssignments,
  getActiveVehicleAssignments,
  getDriverOngoingTrip,
  getTripUpdatedAt,
  getVehicleOngoingTrip,
  updateTripAssignment,
  type ActiveDriverAssignmentMap,
  type TripRow,
} from '@/features/trips/services/trips.service';
import {
  isTripReassignStaleError,
  TRIP_REASSIGN_STALE_ERROR,
} from '@/features/trips/utils/tripReassignConflict.util';
import { useInvalidateDrivers } from '@/lib/queries/useDriversQuery';
import { useInvalidateVehicles } from '@/lib/queries/useVehiclesQuery';

export type ReassignPayload = {
  driverId: string;
  vehicleId: string | null;
  vehicleDisplayNumber?: string | null;
};

export type ReassignByPhonePayload = {
  phone: string;
  vehicleId?: string | null;
  vehicleDisplayNumber?: string | null;
};

export type ReassignByPhoneResult = {
  ok: boolean;
  trip: TripRow | null;
  otpCode?: string | null;
  driverUpdatedVehicleFailed?: boolean;
  vehicleError?: string;
  staleConflict?: boolean;
};

type Options = {
  trip: TripRow;
  organizationId: string;
  currentUserId: string | null;
  isAggregate: boolean;
  driverAssignOrgId?: string | null;
  /** Snapshot from sheet open / confirm — optimistic lock for concurrent dispatchers. */
  expectedUpdatedAt?: string | null;
};

/**
 * Combined driver + vehicle reassignment.
 * Reassign preserves trip stage — only driver_id and vehicle_id change.
 */
export function useReassignTrip({
  trip,
  organizationId,
  currentUserId,
  isAggregate,
  driverAssignOrgId,
  expectedUpdatedAt,
}: Options) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidateDrivers = useInvalidateDrivers();
  const invalidateVehicles = useInvalidateVehicles();

  const auditOptions =
    currentUserId != null
      ? {
          changedBy: currentUserId,
          driverIdPrev: trip.driver_id ?? null,
          vehicleIdPrev: trip.vehicle_id ?? null,
          forceOtpClaim: isAggregate,
          trackingOnly: isAggregate,
          expectedUpdatedAt: expectedUpdatedAt ?? undefined,
        }
      : expectedUpdatedAt
        ? { expectedUpdatedAt }
        : undefined;

  const assertTripNotStale = useCallback(async (): Promise<string | null> => {
    const expected = expectedUpdatedAt?.trim();
    if (!expected) return null;
    const { error: readErr, updatedAt } = await getTripUpdatedAt(trip.id);
    if (readErr) return readErr.message;
    if (updatedAt !== expected) {
      return TRIP_REASSIGN_STALE_ERROR;
    }
    return null;
  }, [expectedUpdatedAt, trip.id]);

  const validateConflicts = useCallback(
    async (driverId: string, vehicleId: string | null) => {
      if (driverId && driverId !== trip.driver_id) {
        const { error: dErr, trip: ongoing } = await getDriverOngoingTrip(
          driverId,
          trip.id,
        );
        if (dErr) return dErr.message;
        if (ongoing) {
          const label = ongoing.trip_number ?? 'another trip';
          return `Driver is already assigned to ${label}. Complete or unassign that trip first.`;
        }
      }
      if (vehicleId && vehicleId !== trip.vehicle_id) {
        const { error: vErr, trip: busy } = await getVehicleOngoingTrip(
          vehicleId,
          trip.id,
        );
        if (vErr) return vErr.message;
        if (busy) {
          const label = busy.trip_number ?? 'another trip';
          return `Vehicle is already assigned to ${label}. Complete or unassign that trip first.`;
        }
      }
      return null;
    },
    [trip.driver_id, trip.id, trip.vehicle_id],
  );

  const reassignCombined = useCallback(
    async (payload: ReassignPayload): Promise<{ ok: boolean; trip: TripRow | null; staleConflict?: boolean }> => {
      setSaving(true);
      setError(null);
      try {
        const stale = await assertTripNotStale();
        if (stale) {
          setError(stale);
          return { ok: false, trip: null, staleConflict: isTripReassignStaleError(stale) };
        }
        const conflict = await validateConflicts(payload.driverId, payload.vehicleId);
        if (conflict) {
          setError(conflict);
          return { ok: false, trip: null };
        }

        const update: Parameters<typeof updateTripAssignment>[1] = {
          driver_id: payload.driverId,
          vehicle_id: payload.vehicleId,
        };
        if (payload.vehicleId == null && payload.vehicleDisplayNumber) {
          update.vehicle_id = null;
          update.vehicle_display_number = payload.vehicleDisplayNumber;
        }

        const { error: saveErr, trip: updated } = await updateTripAssignment(
          trip.id,
          update,
          auditOptions,
        );
        if (saveErr) {
          setError(saveErr.message);
          return {
            ok: false,
            trip: null,
            staleConflict: isTripReassignStaleError(saveErr.message),
          };
        }
        invalidateDrivers(organizationId);
        invalidateVehicles(organizationId);
        return { ok: true, trip: updated };
      } finally {
        setSaving(false);
      }
    },
    [
      assertTripNotStale,
      auditOptions,
      invalidateDrivers,
      invalidateVehicles,
      organizationId,
      trip.id,
      validateConflicts,
    ],
  );

  const applyFleetVehicleAfterPhone = useCallback(
    async (
      updated: TripRow,
      vehicleId: string,
    ): Promise<{ ok: boolean; trip: TripRow | null; vehicleError?: string; staleConflict?: boolean }> => {
      if (updated.vehicle_id === vehicleId) {
        return { ok: true, trip: updated };
      }
      const stale = await assertTripNotStale();
      if (stale) {
        return { ok: false, trip: updated, vehicleError: stale, staleConflict: true };
      }
      const conflict = await validateConflicts(updated.driver_id ?? '', vehicleId);
      if (conflict) {
        setError(conflict);
        return {
          ok: false,
          trip: updated,
          vehicleError: conflict,
        };
      }
      const { error: vErr, trip: withVehicle } = await updateTripAssignment(
        trip.id,
        { vehicle_id: vehicleId },
        auditOptions,
      );
      if (vErr) {
        return {
          ok: false,
          trip: updated,
          vehicleError: vErr.message,
          staleConflict: isTripReassignStaleError(vErr.message),
        };
      }
      return { ok: true, trip: withVehicle ?? updated };
    },
    [assertTripNotStale, auditOptions, trip.id, validateConflicts],
  );

  const reassignByPhone = useCallback(
    async (payload: ReassignByPhonePayload): Promise<ReassignByPhoneResult> => {
      setSaving(true);
      setError(null);
      try {
        const stale = await assertTripNotStale();
        if (stale) {
          setError(stale);
          return { ok: false, trip: null, staleConflict: true };
        }

        const orgForDriver = (driverAssignOrgId ?? organizationId).trim() || organizationId;
        if (isAggregate) {
          const { error: rpcErr, trip: updated } = await assignAggregateTripDriverByPhone(
            trip.id,
            orgForDriver,
            payload.phone,
            payload.vehicleDisplayNumber ?? null,
            payload.vehicleId ?? null,
            trip.driver_id ?? null,
          );
          if (rpcErr) {
            setError(rpcErr.message);
            return { ok: false, trip: null };
          }
          if (!updated) {
            setError('Assignment failed');
            return { ok: false, trip: null };
          }

          let finalTrip = updated;
          if (
            payload.vehicleId &&
            updated.vehicle_id !== payload.vehicleId
          ) {
            const vehicleStep = await applyFleetVehicleAfterPhone(
              updated,
              payload.vehicleId,
            );
            if (!vehicleStep.ok) {
              setError(null);
              return {
                ok: false,
                trip: vehicleStep.trip,
                driverUpdatedVehicleFailed: true,
                vehicleError:
                  vehicleStep.vehicleError ??
                  'Vehicle update failed after driver was assigned.',
                staleConflict: vehicleStep.staleConflict,
              };
            }
            finalTrip = vehicleStep.trip ?? updated;
          }

          invalidateDrivers(organizationId);
          invalidateVehicles(organizationId);
          return { ok: true, trip: finalTrip };
        }

        const { error: phoneErr, trip: updated, otp } = await assignTripDriverByPhone(
          trip.id,
          orgForDriver,
          payload.phone,
          auditOptions,
        );
        if (phoneErr || !updated) {
          setError(phoneErr?.message ?? 'Assignment failed');
          return {
            ok: false,
            trip: null,
            staleConflict: isTripReassignStaleError(phoneErr?.message),
          };
        }
        let finalTrip = updated;
        if (payload.vehicleId && updated.vehicle_id !== payload.vehicleId) {
          const vehicleStep = await applyFleetVehicleAfterPhone(
            updated,
            payload.vehicleId,
          );
          if (!vehicleStep.ok) {
            setError(null);
            return {
              ok: false,
              trip: vehicleStep.trip,
              driverUpdatedVehicleFailed: true,
              vehicleError:
                vehicleStep.vehicleError ??
                'Vehicle update failed after driver was assigned.',
              staleConflict: vehicleStep.staleConflict,
            };
          }
          finalTrip = vehicleStep.trip ?? updated;
        }
        invalidateDrivers(organizationId);
        invalidateVehicles(organizationId);
        return { ok: true, trip: finalTrip, otpCode: otp?.code ?? null };
      } finally {
        setSaving(false);
      }
    },
    [
      applyFleetVehicleAfterPhone,
      assertTripNotStale,
      auditOptions,
      driverAssignOrgId,
      invalidateDrivers,
      isAggregate,
      organizationId,
      trip.id,
    ],
  );

  const retryVehicleOnly = useCallback(
    async (vehicleId: string): Promise<{ ok: boolean; trip: TripRow | null; staleConflict?: boolean }> => {
      setSaving(true);
      setError(null);
      try {
        const stale = await assertTripNotStale();
        if (stale) {
          setError(stale);
          return { ok: false, trip: null, staleConflict: true };
        }
        const conflict = await validateConflicts(trip.driver_id ?? '', vehicleId);
        if (conflict) {
          setError(conflict);
          return { ok: false, trip: null };
        }
        const { error: vErr, trip: updated } = await updateTripAssignment(
          trip.id,
          { vehicle_id: vehicleId },
          auditOptions,
        );
        if (vErr) {
          setError(vErr.message);
          return {
            ok: false,
            trip: null,
            staleConflict: isTripReassignStaleError(vErr.message),
          };
        }
        invalidateVehicles(organizationId);
        return { ok: true, trip: updated };
      } finally {
        setSaving(false);
      }
    },
    [
      assertTripNotStale,
      auditOptions,
      invalidateVehicles,
      organizationId,
      trip.driver_id,
      trip.id,
      validateConflicts,
    ],
  );

  const loadBusyDriverIds = useCallback(async (): Promise<ActiveDriverAssignmentMap> => {
    const { map } = await getActiveDriverAssignments(organizationId, trip.id);
    return map;
  }, [organizationId, trip.id]);

  const loadBusyVehicleAssignments = useCallback(async () => {
    const { error: loadErr, map } = await getActiveVehicleAssignments(
      organizationId,
      trip.id,
    );
    if (loadErr) {
      return {
        busyVehicleIds: new Set<string>(),
        tripLabelByVehicleId: {} as Record<string, string>,
      };
    }
    return map;
  }, [organizationId, trip.id]);

  return {
    saving,
    error,
    setError,
    reassignCombined,
    reassignByPhone,
    retryVehicleOnly,
    loadBusyDriverIds,
    loadBusyVehicleAssignments,
  };
}
