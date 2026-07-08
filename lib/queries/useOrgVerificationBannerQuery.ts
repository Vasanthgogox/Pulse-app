/**
 * Lightweight org verification status + created_at — drives the persistent
 * "submit for verification" reminder banner. Do not use for the KYC panel
 * itself (see useInlineKycVerification).
 */
import { useQuery } from '@tanstack/react-query';
import {
  getOrgVerificationBannerFields,
  type OrgVerificationBannerFields,
} from '@/features/organization/services/organization.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useOrgVerificationBannerQuery(orgId: string | null) {
  return useQuery<OrgVerificationBannerFields | null, Error>({
    queryKey: queryKeys.workspace.verificationBanner(orgId ?? ''),
    queryFn: async () => {
      const res = await getOrgVerificationBannerFields(orgId!);
      if (res.error) throw res.error;
      return res.fields;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}
