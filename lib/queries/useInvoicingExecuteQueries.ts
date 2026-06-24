import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchInvoicingTrips,
  fetchPodReconciliationSummary,
  executeInvoiceCreation,
  type InvoicingTripView,
  type PodReconciliationSummary,
} from '@/features/invoicing/services/invoicing.service';
import { queryKeys } from '@/lib/queryKeys';

export function useInvoicingExecuteTripsQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? queryKeys.invoicing.trips(orgId) : ['q', 'invoicing', 'trips', 'none'],
    queryFn: async () => {
      const { error, trips } = await fetchInvoicingTrips(orgId!);
      if (error) throw error;
      return trips;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

export function usePodReconciliationSummaryQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? queryKeys.invoicing.summary(orgId) : ['q', 'invoicing', 'summary', 'none'],
    queryFn: async () => {
      const { error, summary } = await fetchPodReconciliationSummary(orgId);
      if (error) throw error;
      return summary;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

export function useExecuteInvoiceMutation(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ internalIds, payload }: { internalIds: string[]; payload?: any }) => {
      const result = await executeInvoiceCreation(internalIds, payload);
      if (result.error) throw result.error;
      return result;
    },
    onSuccess: (_result, { internalIds }) => {
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.trips(orgId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.summary(orgId) });
      }
      for (const tripId of internalIds) {
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
      }
    },
  });
}

export type { InvoicingTripView, PodReconciliationSummary };
