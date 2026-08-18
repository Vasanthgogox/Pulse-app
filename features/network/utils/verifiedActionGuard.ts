/**
 * Gate for Network actions that require a KYC-verified org: connect, give load
 * (post to marketplace), get load (bid). Verified orgs run the action; everyone
 * else is prompted with a "verify your business" dialog whose confirm opens the
 * KYC panel — same destination the OrgVerificationReminder modal uses
 * (`/workspace?panel=kyc`).
 *
 * Uses `confirmDialog` (not raw `Alert.alert`, which is a no-op on
 * react-native-web) so the prompt is actually visible on web AND native.
 *
 * Usage:
 *   const guard = useVerifiedActionGuard();
 *   <Pressable onPress={() => guard(openLoadCenter)} />
 */
import { confirmDialog } from '@/lib/confirmDialog';
import { useIsOrgVerified } from '@/lib/queries/useIsOrgVerified';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

const KYC_PANEL_ROUTE = '/workspace?panel=kyc';
const PROMPT_TITLE = 'Verify your business';
const PROMPT_BODY =
  'Verify your business to connect with other organisations and trade loads.';

export function useVerifiedActionGuard() {
  const ensure = useEnsureVerified();

  return useCallback(
    (action: () => void) => {
      void ensure().then((ok) => {
        if (ok) action();
      });
    },
    [ensure],
  );
}

/**
 * Imperative variant for async handlers that can't wrap their body in a
 * callback (e.g. `handleConnect` that already awaits a service call). Returns a
 * promise: `true` when the org is verified and the caller should proceed;
 * `false` when it should abort (a "Verify now" dialog was shown, and on confirm
 * the KYC panel was opened). Resolves `false` while status is still loading.
 *
 *   const ensureVerified = useEnsureVerified();
 *   if (!(await ensureVerified())) return;
 */
export function useEnsureVerified() {
  const router = useRouter();
  const { isVerified, isLoading } = useIsOrgVerified();

  return useCallback(async (): Promise<boolean> => {
    // A tap during load is a no-op, not a false denial — abort without prompting.
    if (isLoading) return false;
    if (isVerified) return true;
    const ok = await confirmDialog({
      title: PROMPT_TITLE,
      message: PROMPT_BODY,
      confirmLabel: 'Verify now',
    });
    if (ok) router.push(KYC_PANEL_ROUTE as Parameters<typeof router.push>[0]);
    return false;
  }, [isVerified, isLoading, router]);
}
