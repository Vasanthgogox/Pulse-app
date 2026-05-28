import { useCallback, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useIsOnline } from "@/contexts/NetworkContext";
import { flushOperationsOutbox } from "../offline/sync";
import { useQueryClient } from "@tanstack/react-query";
import {
  invalidateTripOperationalState,
  invalidateReconciliationState,
} from "@/lib/queries/operationalInvalidation";
import { queryKeys } from "@/lib/queryKeys";

export function useTripOperationsSync() {
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();

  const runSync = useCallback(async () => {
    if (!isOnline) return;
    const result = await flushOperationsOutbox();
    for (const tripId of result.processedTripIds) {
      const orgId = String(
        queryClient.getQueryData<{ organization_id?: string | null }>(
          queryKeys.trips.detail(tripId),
        )?.organization_id ?? "",
      );
      invalidateTripOperationalState({
        queryClient,
        tripId,
        organizationId: orgId || undefined,
      });
      if (orgId) {
        invalidateReconciliationState({
          queryClient,
          organizationId: orgId,
          tripId,
        });
      }
    }
    for (const tripId of result.failedTripIds) {
      const orgId = String(
        queryClient.getQueryData<{ organization_id?: string | null }>(
          queryKeys.trips.detail(tripId),
        )?.organization_id ?? "",
      );
      invalidateTripOperationalState({
        queryClient,
        tripId,
        organizationId: orgId || undefined,
      });
      if (orgId) {
        invalidateReconciliationState({
          queryClient,
          organizationId: orgId,
          tripId,
        });
      }
    }
    if (result.processed > 0 || result.failed > 0) {
      queryClient.invalidateQueries({ queryKey: ["q", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["q", "invoicing"] });
      queryClient.invalidateQueries({ queryKey: ["q", "analytics"] });
      queryClient.invalidateQueries({ queryKey: ["q", "operations", "control-center"] });
      queryClient.invalidateQueries({ queryKey: ["q", "operations", "health"] });
    }
  }, [isOnline, queryClient]);

  useEffect(() => {
    if (!isOnline) return;
    void runSync();
  }, [isOnline, runSync]);

  useFocusEffect(
    useCallback(() => {
      if (isOnline) void runSync();
      return undefined;
    }, [isOnline, runSync]),
  );
}
