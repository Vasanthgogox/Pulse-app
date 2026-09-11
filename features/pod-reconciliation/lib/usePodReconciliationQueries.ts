import { useQuery } from '@tanstack/react-query';
import { 
  fetchReconciliationTrips, 
  type PodTab 
} from '../services/podReconciliationService';
import { fetchPodReconciliationSummary } from '@/features/invoicing/services/invoicing.service';
import { queryKeys } from '@/lib/queryKeys';

export function usePodReconciliationTripsQuery(
  orgId: string | null,
  activeTab: PodTab,
  searchTerm: string = '',
  regionFilter: string = 'All'
) {
  return useQuery({
    queryKey: orgId 
      ? [...queryKeys.trips.all(orgId), 'reconciliation', activeTab, searchTerm, regionFilter]
      : ['q', 'trips', 'reconciliation', 'none'],
    queryFn: async () => {
      const { error, trips } = await fetchReconciliationTrips(
        orgId!,
        activeTab,
        searchTerm,
        regionFilter
      );
      if (error) throw error;
      return trips;
    },
    enabled: !!orgId,
    staleTime: 60_000,
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
    staleTime: 60_000,
  });
}
