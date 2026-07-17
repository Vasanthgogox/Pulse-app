/**
 * Auto-presents org verification reminder as a bottom-sheet popup (same
 * interaction model as business connection invites). Shown when the current org
 * is still `unverified`; dismissible per session.
 *
 * Mounted at root (inside AppBootGate) so `sessionDismissed` survives
 * `(tabs)/_layout` remounts. Visibility is gated by auth + `(tabs)` segment.
 */
import { OrgVerificationReminderModal } from '@/features/organization/components/workspace/kyc/OrgVerificationReminderModal';
import { getOrgVerificationReminderCopy } from '@/features/organization/components/workspace/kyc/orgVerificationReminder.util';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { useOrgVerificationBannerQuery } from '@/lib/queries/useOrgVerificationBannerQuery';
import { useRouter, useSegments } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

export function OrgVerificationReminderProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { user, profile, status } = useAuth();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const [sessionDismissed, setSessionDismissed] = useState(false);

  const isInTabs = segments.includes('(tabs)');
  const isEligibleUser =
    status === 'authenticated' && !!user && !!profile && profile.role !== 'driver';
  const shouldFetch = isInTabs && isEligibleUser && !sessionDismissed;

  const { data } = useOrgVerificationBannerQuery(orgId, { enabled: shouldFetch });

  const eligible =
    shouldFetch && !!data && data.verification_status === 'unverified';

  const copy = useMemo(
    () => (data ? getOrgVerificationReminderCopy(data) : null),
    [data],
  );

  const onVerify = useCallback(() => {
    setSessionDismissed(true);
    router.push('/workspace?panel=kyc' as Parameters<typeof router.push>[0]);
  }, [router]);

  const onLater = useCallback(() => {
    setSessionDismissed(true);
  }, []);

  return (
    <>
      {children}
      {eligible && copy ? (
        <OrgVerificationReminderModal
          visible={eligible}
          copy={copy}
          onVerify={onVerify}
          onLater={onLater}
        />
      ) : null}
    </>
  );
}
