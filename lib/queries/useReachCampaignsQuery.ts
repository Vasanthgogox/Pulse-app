import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getReachPlans,
  getReachCampaignsForOrg,
  publishReachCampaign,
  upgradeReachCampaign,
  cancelReachCampaign,
  type ReachPaymentMethod,
} from '@/features/reach/services/campaigns.service';
import { getReachCampaignMetrics, getReachOrgSummary } from '@/features/reach/services/analytics.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useReachPlansQuery() {
  return useQuery({
    queryKey: queryKeys.reach.plans(),
    queryFn: async () => {
      const res = await getReachPlans();
      if (res.error) throw res.error;
      return res.plans;
    },
    staleTime: STALE.slow, // admin-editable, changes rarely
  });
}

export function useReachCampaignsQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.campaignsForOrg(orgId ?? ''),
    queryFn: async () => {
      const res = await getReachCampaignsForOrg(orgId!);
      if (res.error) throw res.error;
      return res.campaigns;
    },
    enabled: !!orgId,
    staleTime: STALE.frequent,
  });
}

export function useReachCampaignMetricsQuery(campaignId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.campaignMetrics(campaignId ?? ''),
    queryFn: async () => {
      const res = await getReachCampaignMetrics(campaignId!);
      if (res.error) throw res.error;
      return res.metrics;
    },
    enabled: !!campaignId,
    staleTime: STALE.frequent,
  });
}

export function useReachOrgSummaryQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.orgSummary(orgId ?? ''),
    queryFn: async () => {
      const res = await getReachOrgSummary(orgId!);
      if (res.error) throw res.error;
      return res.summary;
    },
    enabled: !!orgId,
    staleTime: STALE.frequent,
  });
}

export function usePublishReachCampaignMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      postId,
      planId,
      paymentMethod,
    }: {
      orgId: string;
      postId: string;
      planId: string;
      paymentMethod: ReachPaymentMethod;
    }) => publishReachCampaign(orgId, postId, planId, paymentMethod),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignsForOrg(variables.orgId) });
    },
  });
}

export function useUpgradeReachCampaignMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      newPlanId,
      paymentMethod,
    }: {
      campaignId: string;
      newPlanId: string;
      paymentMethod: ReachPaymentMethod;
      orgId: string; // only used to invalidate the right query below
    }) => upgradeReachCampaign(campaignId, newPlanId, paymentMethod),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignsForOrg(variables.orgId) });
    },
  });
}

export function useCancelReachCampaignMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      reason,
    }: {
      campaignId: string;
      reason: string;
      orgId: string; // only used to invalidate the right query below
    }) => cancelReachCampaign(campaignId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.campaignsForOrg(variables.orgId) });
    },
  });
}
