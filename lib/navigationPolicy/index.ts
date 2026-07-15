/**
 * Navigation Policy System (RFC) — public exports.
 *
 * Navigation ≠ Authorization. Supabase RLS remains the data boundary.
 *
 * Phase 3: Shadow host mounted in app/_layout (enforce=false). Never redirects.
 * Phase 4: Parity matrix vs legacyPredict — soft flags for ungated stack.
 * Phase 5: enable enforce + remove legacy auth replaces.
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

export {
  clearShadowObservations,
  getShadowMismatchReport,
  recordShadowDecision,
  settleShadowIfStable,
  settleShadowPath,
  type ShadowMismatchKind,
  type ShadowMismatchReport,
  type ShadowObservation,
} from '@/lib/navigationPolicy/shadowMismatch';
export {
  predictLegacyNavigation,
  legacyPredictionToComparable,
  type LegacyPrediction,
} from '@/lib/navigationPolicy/legacyPredict';

export {
  compareParityCase,
  runParityMatrix,
  type ParityCase,
  type ParityMismatch,
} from '@/lib/navigationPolicy/parityCompare';
