/**
 * Navigation Policy System (RFC) — public exports.
 *
 * Navigation ≠ Authorization. Supabase RLS remains the data boundary.
 *
 * Runtime: `NavigationPolicyShadowHost` in `app/_layout.tsx`.
 * Kill switch: EXPO_PUBLIC_NAV_POLICY_ENFORCE=0|false|off
 * Authenticated cold boot (suite / last-tab) remains in `app/index.tsx`.
 * Onboarding resumes: policy predicates → Actor.
 */

export type {
  CanonicalPath,
  Decision,
  Experience,
  Grant,
  GrantSet,
  OnDenyTarget,
  PlatformKind,
  PolicyRecord,
  PolicySnapshot,
  Principal,
  SessionPosture,
} from '@/lib/navigationPolicy/types';

export {
  DRIVER_HOME_PATH,
  FAIL_CLOSED_HOME_PATH,
  ORG_HOME_PATH,
  SIGN_IN_PATH,
  TERMINAL_WEBSITE_PATH,
} from '@/lib/navigationPolicy/types';

export {
  canonicalizePath,
  matchPattern,
  stripExpoGroups,
} from '@/lib/navigationPolicy/pathCanonicalize';

export {
  buildGrantSet,
  buildPrincipal,
  grantsSatisfy,
} from '@/lib/navigationPolicy/grants';

export {
  evaluate,
  evaluateNavigationPolicy,
} from '@/lib/navigationPolicy/evaluate';

export {
  getRegistry,
  findMatchingPolicy,
  findUnmappedRoutes,
  buildRegistryCoverageReport,
  ROUTE_INVENTORY,
} from '@/lib/navigationPolicy/registry';
export type { RouteInventoryEntry } from '@/lib/navigationPolicy/registry';

export {
  NavigationActor,
  type NavigateFn,
  type ActorApplyResult,
} from '@/lib/navigationPolicy/NavigationActor';

export {
  emitNavigationDecision,
  subscribeNavigationDecisions,
  type NavigationDecisionEvent,
} from '@/lib/navigationPolicy/telemetry';

export {
  NavigationPolicyProvider,
  useNavigationPolicyDecision,
  type NavigationPolicyProviderProps,
} from '@/lib/navigationPolicy/NavigationPolicyProvider';

export { NavigationPolicyShadowHost } from '@/lib/navigationPolicy/NavigationPolicyShadowHost';

export { authStatusToSessionPosture } from '@/lib/navigationPolicy/sessionPosture';

export { isNavigationPolicyEnforceEnabled } from '@/lib/navigationPolicy/enforceFlag';

export {
  buildSignInHrefWithReturnTo,
  sanitizeReturnTo,
} from '@/lib/navigationPolicy/returnTo';

export {
  bumpPredicateSignals,
  getPredicateSignalVersion,
  subscribePredicateSignals,
} from '@/lib/navigationPolicy/predicateSignals';
