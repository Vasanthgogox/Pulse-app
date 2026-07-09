/**
 * Auto-presents org verification reminder as a bottom-sheet popup (same
 * interaction model as business connection invites). Shown when the current org
 * is still `unverified`; dismissible per session.
 */
import { OrgVerificationReminderModal } from '@/features/organization/components/workspace/kyc/OrgVerificationReminderModal';
import { getOrgVerificationReminderCopy } from '@/features/organization/components/workspace/kyc/orgVerificationReminder.util';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { useOrgVerificationBannerQuery } from '@/lib/queries/useOrgVerificationBannerQuery';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

export function OrgVerificationReminderProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const { data } = useOrgVerificationBannerQuery(orgId);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  const eligible = !!data && data.verification_status === 'unverified' && !sessionDismissed;

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
