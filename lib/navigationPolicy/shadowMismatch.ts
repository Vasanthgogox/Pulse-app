/**
 * Phase 3 shadow mismatch collector.
 * Evaluates every navigation; never redirects. Compares policy expected
 * redirect vs observed pathname after settle (legacy remains authoritative).
 */

import { canonicalizePath } from '@/lib/navigationPolicy/pathCanonicalize';
import type { Decision } from '@/lib/navigationPolicy/types';
import { SIGN_IN_PATH } from '@/lib/navigationPolicy/types';

export type ShadowMismatchKind =
  | 'policy_redirect_legacy_stayed'
  | 'policy_allow_legacy_left'
  | 'policy_redirect_legacy_different_target'
  | 'none';

export type ShadowObservation = {
  id: number;
  pathname: string;
  canonicalPath: string;
  decision: Decision['type'];
  reason: string;
  /** Where policy would send the user (null if allow/wait). */
  expectedRedirect: string | null;
  /** Path after settle — legacy outcome. */
  currentPathAfterSettle: string | null;
  /** Canonical form of currentPathAfterSettle. */
  currentRedirect: string | null;
  mismatch: ShadowMismatchKind;
  settled: boolean;
  at: number;
  settledAt: number | null;
};

export type ShadowMismatchReport = {
  totalObservations: number;
  settledCount: number;
  mismatchCount: number;
  byKind: Record<ShadowMismatchKind, number>;
  mismatches: ShadowObservation[];
  recent: ShadowObservation[];
};

const MAX_BUFFER = 200;
let nextId = 1;
const buffer: ShadowObservation[] = [];
let pending: ShadowObservation | null = null;

function canonical(path: string): string {
  return canonicalizePath(path).path;
}

function classifyMismatch(
  obs: ShadowObservation,
  settledPath: string,
): ShadowMismatchKind {
  const settledCanon = canonical(settledPath);
  const startCanon = obs.canonicalPath;

  if (obs.decision === 'wait') return 'none';

  if (obs.decision === 'redirect' && obs.expectedRedirect) {
    const expectedCanon = canonical(obs.expectedRedirect);
    if (settledCanon === startCanon) {
      return 'policy_redirect_legacy_stayed';
    }
    if (settledCanon === expectedCanon) {
      return 'none'; // legacy agreed (or arrived at same place)
    }
    // Legacy moved somewhere else
    return 'policy_redirect_legacy_different_target';
  }

  if (obs.decision === 'allow') {
    if (settledCanon === startCanon) return 'none';
    // Left the page — often legacy auth bounce
    if (settledCanon === SIGN_IN_PATH || settledCanon === '/terminal-website') {
      return 'policy_allow_legacy_left';
    }
    // In-app navigation is fine
    return 'none';
  }

  return 'none';
}

/** Record a shadow evaluation. Call settleShadowPath on pathname changes. */
export function recordShadowDecision(input: {
  pathname: string;
  canonicalPath: string;
  decision: Decision;
  reason: string;
}): ShadowObservation {
  // Settle previous against this new path if still pending
  if (pending && !pending.settled) {
    settleShadowPath(input.pathname);
  }

  const expectedRedirect =
    input.decision.type === 'redirect' ? input.decision.to : null;

  const obs: ShadowObservation = {
    id: nextId++,
    pathname: input.pathname,
    canonicalPath: input.canonicalPath,
    decision: input.decision.type,
    reason: input.reason,
    expectedRedirect,
    currentPathAfterSettle: null,
    currentRedirect: null,
    mismatch: 'none',
    settled: false,
    at: Date.now(),
    settledAt: null,
  };

  pending = obs;
  buffer.push(obs);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  return obs;
}

/**
 * Finalize the pending observation using the path we landed on
 * (legacy navigation outcome).
 */
export function settleShadowPath(pathname: string): void {
  if (!pending || pending.settled) return;
  if (pathname === pending.pathname) {
    // Same path — use delayed settle via settleShadowIfStable
    return;
  }
  pending.currentPathAfterSettle = pathname;
  pending.currentRedirect = canonical(pathname);
  pending.mismatch = classifyMismatch(pending, pathname);
  pending.settled = true;
  pending.settledAt = Date.now();
  pending = null;
}

/**
 * If we are still on the same path after a settle window, mark as stayed.
 * Call from a timeout when pathname unchanged.
 */
export function settleShadowIfStable(pathname: string): void {
  if (!pending || pending.settled) return;
  if (pathname !== pending.pathname) return;
  pending.currentPathAfterSettle = pathname;
  pending.currentRedirect = canonical(pathname);
  pending.mismatch = classifyMismatch(pending, pathname);
  pending.settled = true;
  pending.settledAt = Date.now();
  pending = null;
}

export function getShadowMismatchReport(): ShadowMismatchReport {
  const settled = buffer.filter((o) => o.settled);
  const mismatches = settled.filter((o) => o.mismatch !== 'none');
  const byKind: Record<ShadowMismatchKind, number> = {
    none: 0,
    policy_redirect_legacy_stayed: 0,
    policy_allow_legacy_left: 0,
    policy_redirect_legacy_different_target: 0,
  };
  for (const o of settled) {
    byKind[o.mismatch] += 1;
  }
  return {
    totalObservations: buffer.length,
    settledCount: settled.length,
    mismatchCount: mismatches.length,
    byKind,
    mismatches: [...mismatches],
    recent: buffer.slice(-50),
  };
}

export function clearShadowObservations(): void {
  buffer.length = 0;
  pending = null;
  nextId = 1;
}

/** Test helper */
export function __getShadowPendingForTests(): ShadowObservation | null {
  return pending;
}
