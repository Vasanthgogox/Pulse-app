import type { PolicyRecord } from '@/lib/navigationPolicy/types';

/**
 * Alias policies: pattern inherits from `targetPattern` at merge time.
 * Phase 1 placeholders only.
 */
export type AliasRecord = {
  id: string;
  pattern: string;
  /** Pattern of the policy to inherit (must exist in merged set). */
  targetPattern: string;
  priority: number;
};

export const ALIAS_RECORDS: readonly AliasRecord[] = [
  {
    id: 'alias.network',
    pattern: '/network',
    targetPattern: '/trips',
    priority: 70,
  },
];

export function resolveAliases(
  aliases: readonly AliasRecord[],
  policies: readonly PolicyRecord[],
): PolicyRecord[] {
  const byPattern = new Map(policies.map((p) => [p.pattern, p]));
  const resolved: PolicyRecord[] = [];
  for (const a of aliases) {
    const target = byPattern.get(a.targetPattern);
    if (!target) continue;
    resolved.push({
      ...target,
      id: a.id,
      pattern: a.pattern,
      priority: a.priority,
    });
  }
  return resolved;
}
