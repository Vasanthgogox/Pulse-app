/**
 * Auto-presents org verification reminder as a bottom-sheet popup (same
 * interaction model as business connection invites). Shown when the current org
 * is still `unverified`; dismissible per session.
 *
 * Mounted at root (inside AppBootGate) so `sessionDismissed` survives
 * `(tabs)/_layout` remounts. Visibility is gated by auth + `(tabs)` segment +
 * business capabilities (not profile.role).
 *
 * Keep the modal mounted while data is eligible so Later can flip `visible`
 * false without unmounting mid-animation (avoids reopen races).
 */
import { OrgVerificationReminderModal } from '@/features/organization/components/workspace/kyc/OrgVerificationReminderModal';
import { getOrgVerificationReminderCopy } from '@/features/organization/components/workspace/kyc/orgVerificationReminder.util';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { hasBusinessCapabilities } from '@/lib/capabilities';
import { useCapabilities } from '@/lib/useCapabilities';
import { useOrgVerificationBannerQuery } from '@/lib/queries/useOrgVerificationBannerQuery';
import { useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

export function OrgVerificationReminderProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { user, status } = useAuth();
  const capabilities = useCapabilities();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const [sessionDismissed, setSessionDismissed] = useState(false);

  // New workspace → allow reminder again for that org.
  useEffect(() => {
    setSessionDismissed(false);
  }, [orgId]);

  // `useSegments()` is typed as a union of per-route segment tuples, so
  // `.includes('(tabs)')` narrows the argument to `never`. Segments are plain
  // strings at runtime, so check membership against a string[] view (accurate
  // runtime type — not a type escape).
  const isInTabs = (segments as readonly string[]).includes('(tabs)');
  const isEligibleUser =
    status === 'authenticated' && !!user && hasBusinessCapabilities(capabilities);
  const shouldFetch = isInTabs && isEligibleUser;

  const { data } = useOrgVerificationBannerQuery(orgId, { enabled: shouldFetch });

  const dataEligible =
    shouldFetch && !!data && data.verification_status === 'unverified';
  const showModal = dataEligible && !sessionDismissed;

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
      {dataEligible && copy ? (
        <OrgVerificationReminderModal
          visible={showModal}
          copy={copy}
          onVerify={onVerify}
          onLater={onLater}
        />
      ) : null}
    </>
  );
}
