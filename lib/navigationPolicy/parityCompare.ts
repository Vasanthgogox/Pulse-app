/**
 * Phase 4 parity: compare policy evaluate() vs legacyPredict().
 */

import { evaluateNavigationPolicy } from '@/lib/navigationPolicy/evaluate';
import {
  legacyPredictionToComparable,
  predictLegacyNavigation,
} from '@/lib/navigationPolicy/legacyPredict';
import { canonicalizePath } from '@/lib/navigationPolicy/pathCanonicalize';
import type { Decision, PolicySnapshot } from '@/lib/navigationPolicy/types';

export type ParityCase = {
  name: string;
  pathname: string;
  snapshot: PolicySnapshot;
};

export type ParityMismatch = {
  name: string;
  pathname: string;
  canonicalPath: string;
  policy: { kind: string; to: string | null; reason: string };
  legacy: { kind: string; to: string | null; reason?: string };
};

function decisionComparable(d: Decision): {
  kind: 'wait' | 'stay' | 'redirect';
  to: string | null;
  reason: string;
} {
  if (d.type === 'wait') return { kind: 'wait', to: null, reason: 'wait' };
  if (d.type === 'allow') {
    return { kind: 'stay', to: null, reason: d.reason };
  }
  return {
    kind: 'redirect',
    to: canonicalizePath(d.to).path,
    reason: d.reason,
  };
}

function redirectTargetsEqual(a: string | null, b: string | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return canonicalizePath(a).path === canonicalizePath(b).path;
}

export function compareParityCase(c: ParityCase): ParityMismatch | null {
  const policyDec = evaluateNavigationPolicy({
    rawPathname: c.pathname,
    snapshot: c.snapshot,
  });
  const legacyPred = predictLegacyNavigation(c.pathname, c.snapshot);
  const policy = decisionComparable(policyDec);
  const legacy = legacyPredictionToComparable(legacyPred);
  const legacyReason =
    legacyPred.type === 'redirect' ? legacyPred.reason : undefined;

  const kindsMatch = policy.kind === legacy.kind;
  const targetsMatch =
    policy.kind !== 'redirect' ||
    redirectTargetsEqual(policy.to, legacy.to);

  if (kindsMatch && targetsMatch) return null;

  return {
    name: c.name,
    pathname: c.pathname,
    canonicalPath: canonicalizePath(c.pathname).path,
    policy: { kind: policy.kind, to: policy.to, reason: policy.reason },
    legacy: {
      kind: legacy.kind,
      to: legacy.to,
      reason: legacyReason,
    },
  };
}

export function runParityMatrix(cases: readonly ParityCase[]): {
  total: number;
  mismatches: ParityMismatch[];
} {
  const mismatches: ParityMismatch[] = [];
  for (const c of cases) {
    const m = compareParityCase(c);
    if (m) mismatches.push(m);
  }
  return { total: cases.length, mismatches };
}
