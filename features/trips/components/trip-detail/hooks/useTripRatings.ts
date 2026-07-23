/**
 * useTripRatings — driver rating average for a trip.
 *
 * MIGRATION STEP 2 (docs/TRIP_DETAIL_ARCHITECTURE.md): first slice pulled OUT of
 * the useTripDetail god-hook. Fully self-contained — one effect, one service call,
 * depends only on trip id + completion. Extracted verbatim; behavior identical.
 */
import { useEffect, useMemo, useState } from "react";

import {
  averageScore,
  getRatingsForTrip,
} from "@/features/ratings/services/ratings.service";

export function useTripRatings(
  tripId: string | null | undefined,
  tripCompleted: boolean,
) {
  const [tripRatings, setTripRatings] = useState<{ score: number }[]>([]);

  // Ratings (completed trips only)
  useEffect(() => {
    if (!tripId || !tripCompleted) {
      setTripRatings([]);
      return;
    }
    let isActive = true;
    getRatingsForTrip(tripId).then(({ error, ratings }) => {
      if (!isActive || error) return;
      const driverRatings = (ratings ?? []).filter(
        (r) => r.rated_type === "driver",
      );
      setTripRatings(driverRatings);
    });
    return () => {
      isActive = false;
    };
  }, [tripId, tripCompleted]);

  const driverRatingAvg = useMemo(
    () => averageScore(tripRatings),
    [tripRatings],
  );

  return { driverRatingAvg };
}
