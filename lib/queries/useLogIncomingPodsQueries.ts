import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  executeLogIncomingPods,
  fetchCourierPartners,
  fetchTripsForLogPods,
  ensureCustomCourierPartner,
  type CourierPartnerRow,
  type LogPodsPayload,
  type LogPodsTripView,
} from '@/services/logPodsService';
import { queryKeys } from '@/lib/queryKeys';

export function useLogIncomingPodsTripsQuery(orgId: string | null) {
  return useQuery({
    queryKey: orgId ? queryKeys.logPods.trips(orgId) : ['q', 'log-pods', 'trips', 'none'],
    queryFn: async () => {
      const { error, trips } = await fetchTripsForLogPods(orgId!);
      if (error) throw error;
      return trips;
    },
    enabled: !!orgId,
    staleTime: 300_000,
  });
}

export function useCourierPartnersQuery() {
  return useQuery({
    queryKey: queryKeys.logPods.courierPartners(),
    queryFn: async () => {
      const { error, partners } = await fetchCourierPartners();
      if (error) throw error;
      return partners;
    },
    staleTime: 300_000,
  });
}

export function useAddCourierPartnerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customName: string) => {
      const result = await ensureCustomCourierPartner('custom', customName);
      if (result.error) throw result.error;
      return result.partner;
    },
    onSuccess: (newPartner) => {
      if (newPartner) {
        queryClient.setQueryData(
          queryKeys.logPods.courierPartners(),
          (old: CourierPartnerRow[] | undefined) => {
            if (!old) return [newPartner];
            if (old.some(p => p.value === newPartner.value)) return old;
            return [...old, newPartner];
          }
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.logPods.courierPartners() });
    },
  });
}

export function useLogIncomingPodsMutation(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LogPodsPayload) => {
      const result = await executeLogIncomingPods(payload);
      if (result.error) throw result.error;
      return result;
    },
    onSuccess: () => {
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.logPods.trips(orgId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.whereOrgIsSupplier(orgId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.whereOrgIsClient(orgId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.logPods.courierPartners() });
    },
  });
}

export type { LogPodsTripView };
