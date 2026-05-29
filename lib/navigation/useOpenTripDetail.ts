import { useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Stable trip-detail navigation handler for list rows.
 */
export function useOpenTripDetail() {
  const router = useRouter();

  const openTripDetail = useCallback(
    (tripId: string) => {
      const id = tripId.trim();
      if (!id) return;
      router.push(`/trip/${id}` as const);
    },
    [router],
  );

  return { openTripDetail };
}
