/**
 * Trip-detail feedback modals inside chat — reuses TripRatingsBlock auto-popup
 * (supplier / driver / client) when a completed trip conversation opens.
 */
import { TripRatingsBlock } from "@/features/ratings/components/TripRatingsBlock";
import { getTripById } from "@/features/trips/services/trips.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useEffect, useState } from "react";

export type ChatTripFeedbackOverlayProps = {
  tripId: string;
  organizationId: string;
  partnerName?: string | null;
  driverName?: string | null;
  clientName?: string | null;
};

export function ChatTripFeedbackOverlay({
  tripId,
  organizationId,
  partnerName,
  driverName,
  clientName,
}: ChatTripFeedbackOverlayProps) {
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTrip(null);
    setLoadError(null);
    void getTripById(tripId).then(({ trip: row, error }) => {
      if (cancelled) return;
      if (error || !row) {
        setLoadError(error?.message ?? "Trip not found");
        return;
      }
      setTrip(row);
    });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (loadError) {
    if (__DEV__) console.warn("[ChatTripFeedbackOverlay]", loadError);
    return null;
  }

  if (!trip) return null;

  return (
    <TripRatingsBlock
      trip={trip}
      organizationId={organizationId}
      partnerName={partnerName}
      driverName={driverName}
      clientName={clientName}
      surface="modalOnly"
    />
  );
}
