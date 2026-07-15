import {
  isParameterizedPattern,
  matchPattern,
} from '@/lib/navigationPolicy/pathCanonicalize';
import { ALIAS_RECORDS, resolveAliases } from '@/lib/navigationPolicy/registry/aliases';
import { DRIVER_POLICIES } from '@/lib/navigationPolicy/registry/driver';
import { ORG_POLICIES } from '@/lib/navigationPolicy/registry/org';
import { PUBLIC_POLICIES } from '@/lib/navigationPolicy/registry/public';
import type { PolicyRecord } from '@/lib/navigationPolicy/types';

function sortPolicies(policies: PolicyRecord[]): PolicyRecord[] {
  return [...policies].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    // Exact before parameterized at same priority
    const aParam = isParameterizedPattern(a.pattern) ? 1 : 0;
    const bParam = isParameterizedPattern(b.pattern) ? 1 : 0;
    if (aParam !== bParam) return aParam - bParam;
    return b.pattern.length - a.pattern.length;
  });
}

function mergeContributors(): PolicyRecord[] {
  const base = [...PUBLIC_POLICIES, ...DRIVER_POLICIES, ...ORG_POLICIES];
  const aliases = resolveAliases(ALIAS_RECORDS, base);
  return sortPolicies([...base, ...aliases]);
}

let cachedRegistry: readonly PolicyRecord[] | null = null;

export function getRegistry(): readonly PolicyRecord[] {
  if (!cachedRegistry) cachedRegistry = mergeContributors();
  return cachedRegistry;
}

/** Test-only: reset merge cache after injecting fixtures. */
export function __resetRegistryCacheForTests(): void {
  cachedRegistry = null;
}

export type MatchedPolicy = {
  policy: PolicyRecord;
  params: Record<string, string>;
};

/**
 * First matching policy in priority order.
 */
export function findMatchingPolicy(
  canonicalPath: string,
  registry: readonly PolicyRecord[] = getRegistry(),
): MatchedPolicy | null {
  for (const policy of registry) {
    const params = matchPattern(canonicalPath, policy.pattern);
    if (params != null) {
      return { policy, params };
    }
  }
  return null;
}
