/**
 * Boot gate decision logic — pure, so the cold-start invariant is testable
 * without a render harness.
 *
 * WHY THIS IS A SEPARATE MODULE
 * -----------------------------
 * `AppBootGate` covers exactly one transition: native splash -> first paint.
 * The subtle trap is that `status === 'restoring'` is not a cold-start signal —
 * AuthContext re-enters it on sign-out, token refresh and re-auth too. Gating
 * the overlay on it directly makes an in-app logout -> login re-show the
 * cold-start splash, which previously had no path back off screen (the
 * splash-hide was behind a one-way latch) and hung the app on "Loading...".
 *
 * Keeping the rule here as a pure reducer means the monotonic invariant is
 * pinned by unit tests instead of living only in a comment.
 */

/** Auth-derived inputs the gate is allowed to consider. */
export interface BootGateInput {
  /** True while auth has not resolved yet — includes post-boot transitions. */
  restoring: boolean;
  /** True when a session user exists. */
  hasUser: boolean;
  /** True when the user's profile has hydrated. */
  hasProfile: boolean;
  /** True when auth reached a fully authenticated state. */
  authenticated: boolean;
  /** True on routes that render without resolved auth state. */
  publicRoute: boolean;
  /** True once the hard boot timeout has elapsed. */
  timedOut: boolean;
}

/**
 * Whether *cold start* has resolved far enough to paint.
 *
 * Only meaningful before the gate latches; callers must not consult it
 * afterwards (see `nextBootSettled`).
 */
export function isColdStartResolved(input: BootGateInput): boolean {
  // Safety valve first: never let a stalled dependency pin the splash forever.
  if (input.timedOut) return true;
  // Public auth pages render immediately — no need to wait for session restore.
  if (input.publicRoute) return true;
  if (input.restoring) return false;
  // A session user whose profile has not hydrated is still mid-boot.
  if (input.hasUser && !input.hasProfile && !input.authenticated) return false;
  return true;
}

/**
 * Advance the latch. Monotonic by construction: once `settled` is true it can
 * never return to false, so post-boot auth churn cannot re-show the overlay.
 */
export function nextBootSettled(settled: boolean, coldStartResolved: boolean): boolean {
  return settled || coldStartResolved;
}

/**
 * The single render decision: show the blocking overlay?
 *
 * False forever once the gate has settled — this is the property that fixes the
 * logout -> login hang.
 */
export function shouldShowBootOverlay(settled: boolean, coldStartResolved: boolean): boolean {
  return !settled && !coldStartResolved;
}
