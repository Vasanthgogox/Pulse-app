import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { recordReferralByCode } from '@/features/reach/services/referrals.service';

/** AsyncStorage key the /r/:code landing page writes before sending the
 * visitor to sign up — read once here, after the user is authenticated and
 * their (new) organization is known, then cleared regardless of outcome
 * (record_referral is idempotent — first write wins, ON CONFLICT DO NOTHING). */
export const PENDING_REFERRAL_CODE_KEY = 'q:pending-referral-code';

/**
 * After authentication, if the user arrived via a /r/:code invite link,
 * records the referral once their organization exists. Mirrors
 * PendingInviteResumeGate.tsx's shape (resume-after-auth, ref-guarded,
 * renders nothing) — deliberately not touching the signup trigger
 * (handle_new_user) or the multi-step signup screens themselves.
 */
export function ReferralCaptureGate() {
  const { user, status } = useAuth();
  const orgCtx = useOptionalOrganization();
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    const orgId = orgCtx?.currentOrganization?.id;
    if (status !== 'authenticated' || !uid || !orgId) return;
    if (attemptedRef.current === uid) return;

    attemptedRef.current = uid;

    void (async () => {
      const code = await AsyncStorage.getItem(PENDING_REFERRAL_CODE_KEY);
      if (!code) return;
      await recordReferralByCode(code, orgId);
      await AsyncStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
    })();
  }, [status, user?.uid, orgCtx?.currentOrganization?.id]);

  return null;
}
