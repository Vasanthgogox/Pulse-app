import { useCallback, useEffect, useState } from "react";
import * as tripsService from "@/features/trips/services/trips.service";
import * as driversService from "@/features/drivers/services/drivers.service";

export const STEPS = [
  { id: "accepted", label: "Start", icon: "compass" as const },
  { id: "pickup", label: "Pickup", icon: "archive" as const },
  { id: "transit", label: "Transit", icon: "truck" as const },
  { id: "completed", label: "Complete", icon: "check-circle" as const },
] as const;

export type StepId = (typeof STEPS)[number]["id"] | "reached";

export function useTripControl(tripId: string | undefined) {
  const [trip, setTrip] = useState<tripsService.TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepId>("accepted");
  const [stepLoading, setStepLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [acceptedOffer, setAcceptedOffer] =
    useState<driversService.DriverOffer | null>(null);
  const [tripDriver, setTripDriver] = useState<driversService.DriverRow | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!tripId) {
      setLoading(false);
      return;
    }
    setStepError(null);
    setLoading(true);
    try {
      const res = await tripsService.getTripById(tripId);
      setTrip(res.trip ?? null);

      if (res.trip) {
        const s = (res.trip.status ?? "").toLowerCase();
        const hasStarted = !!res.trip.started_at;

        if (s === "completed" || s === "delivered" || s === "done") {
          setStep("completed");
        } else if (s === "at_drop") {
          setStep("reached");
        } else if (
          s === "in_transit" ||
          s === "transit" ||
          (s === "in_progress" && hasStarted)
        ) {
          setStep("transit");
        } else if (s === "picked_up" || s === "pickup" || s === "in_progress") {
          setStep("pickup");
        } else {
          setStep("accepted");
        }
      }
    } catch (error) {
      console.error("Failed to load trip:", error);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!trip?.organization_id) {
      setAcceptedOffer(null);
      return;
    }
    driversService
      .getAcceptedDriverOfferForOrganization(trip.organization_id)
      .then((res) => {
        if (cancelled) return;
        if (res.error) return;
        setAcceptedOffer(res.offer ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.organization_id]);

  useEffect(() => {
    let cancelled = false;
    if (!trip?.driver_id || !trip?.organization_id) {
      setTripDriver(null);
      return;
    }
    driversService
      .getDriverById(trip.organization_id, trip.driver_id)
      .then((res) => {
        if (cancelled) return;
        setTripDriver(res.driver ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.driver_id, trip?.organization_id]);

  const confirmArrival = async () => {
    const id = trip?.id ?? tripId;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    setStep("pickup");
    // Optimistic UI update for immediate feedback
    setTrip((prev) =>
      prev
        ? {
            ...prev,
            status: "in_progress",
            updated_at: new Date().toISOString(),
          }
        : prev,
    );
    const { error, trip: updated } = await tripsService.updateTripStatus(id, {
      status: "in_progress",
    });
    setStepLoading(false);
    if (error) {
      setStepError(error.message);
      setStep("accepted");
      setTrip((prev) => (prev ? { ...prev, status: "assigned" } : prev));
      return;
    }
    // Sync with server state or fallback to full reload if update didn't return a row
    if (updated) setTrip(updated);
    else await load();
  };

  const engageTransit = async () => {
    const id = trip?.id ?? tripId;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    const now = new Date().toISOString();
    setStep("transit");
    // Optimistic UI update for immediate feedback
    setTrip((prev) =>
      prev
        ? { ...prev, status: "in_progress", started_at: now, updated_at: now }
        : prev,
    );
    const { error, trip: updated } = await tripsService.updateTripStatus(id, {
      status: "in_progress",
      started_at: now,
    });
    setStepLoading(false);
    if (error) {
      setStepError(error.message);
      setStep("pickup");
      // Fallback on error is handled by not calling setTrip with the partial update anymore
      // or we could revert here if needed. The current logic in the screen re-loads on error if trip is null.
      return;
    }
    // Sync with server state or fallback to full reload if update didn't return a row
    if (updated) setTrip(updated);
    else await load();
  };

  const confirmReached = async () => {
    const id = trip?.id ?? tripId;
    if (!id || stepLoading) return;
    setStepError(null);
    setStepLoading(true);
    const { error, trip: updated } = await tripsService.updateTripStatus(id, {
      status: "at_drop",
    });
    setStepLoading(false);
    if (error) {
      const isStatusCheckError =
        /trips_status_check|check constraint/i.test(error.message);
      if (isStatusCheckError) {
        setStep("reached");
        setTrip((prev) =>
          prev ? { ...prev, updated_at: new Date().toISOString() } : prev,
        );
        setStepError(null);
        return;
      }
      setStepError(error.message);
      return;
    }
    setStep("reached");
    if (updated) setTrip(updated);
    else await load();
  };

  const completeTrip = async () => {
    const id = trip?.id ?? tripId;
    if (!id) return;
    const now = new Date().toISOString();
    setStep("completed");
    setTrip((prev) =>
      prev
        ? { ...prev, status: "completed", completed_at: now, updated_at: now }
        : prev,
    );
    const { error, trip: updated } = await tripsService.updateTripStatus(id, {
      status: "completed",
      completed_at: now,
    });
    if (error) {
      setStepError(error.message);
      setStep("reached");
      return;
    }
    if (updated) setTrip(updated);
    else await load();
  };

  return {
    trip,
    setTrip,
    loading,
    step,
    setStep,
    stepLoading,
    stepError,
    setStepError,
    acceptedOffer,
    tripDriver,
    load,
    confirmArrival,
    engageTransit,
    confirmReached,
    completeTrip,
  };
}
