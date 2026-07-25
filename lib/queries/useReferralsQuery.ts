import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMyReferralCode,
  getReferralsForOrg,
  getReferrerNameByCode,
  recordReferralByCode,
} from '@/features/reach/services/referrals.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useMyReferralCodeQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.myReferralCode(orgId ?? ''),
    queryFn: async () => {
      const res = await getMyReferralCode(orgId!);
      if (res.error) throw res.error;
      return res.code;
    },
    enabled: !!orgId,
    staleTime: STALE.slow,
  });
}

export function useReferralsForOrgQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.referralsForOrg(orgId ?? ''),
    queryFn: async () => {
      const res = await getReferralsForOrg(orgId!);
      if (res.error) throw res.error;
      return res.referrals;
    },
    enabled: !!orgId,
    staleTime: STALE.frequent,
  });
}

/** Public, pre-auth lookup for the /r/:code landing page. */
export function useReferrerNameByCodeQuery(code: string | null) {
  return useQuery({
    queryKey: queryKeys.reach.referrerName(code ?? ''),
    queryFn: async () => {
      const res = await getReferrerNameByCode(code!);
      if (res.error) throw res.error;
      return res.name;
    },
    enabled: !!code,
    staleTime: STALE.slow,
  });
}

export function useRecordReferralByCodeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, referredOrgId }: { code: string; referredOrgId: string }) =>
      recordReferralByCode(code, referredOrgId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reach.referralsForOrg(variables.referredOrgId) });
    },
  });
}
