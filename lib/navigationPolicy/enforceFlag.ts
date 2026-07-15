/**
 * Enforce kill switch (PRV High).
 * Default: enforce ON.
 * Disable: EXPO_PUBLIC_NAV_POLICY_ENFORCE=0|false|off
 */

export function isNavigationPolicyEnforceEnabled(): boolean {
  const raw = (
    process.env.EXPO_PUBLIC_NAV_POLICY_ENFORCE ??
    process.env.NAV_POLICY_ENFORCE ??
    '1'
  )
    .toString()
    .trim()
    .toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') {
    return false;
  }
  return true;
}
