import { ROUTES } from "@/lib/routes";
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
      router.push(ROUTES.tripDetail(id) as never);
    },
    [router],
  );

  return { openTripDetail };
}
