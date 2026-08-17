// Phase 2 aliases — inherit target policy at merge
import type { PolicyRecord } from '@/lib/navigationPolicy/types';

export type AliasRecord = {
  id: string;
  pattern: string;
  targetPattern: string;
  priority: number;
};

export const ALIAS_RECORDS: readonly AliasRecord[] = [
  { id: 'alias.account', pattern: '/account', targetPattern: '/workspace', priority: 95 },
  {
    id: 'alias.branding-settings',
    pattern: '/branding-settings',
    targetPattern: '/workspace',
    priority: 95,
  },
  {
    id: 'alias.business-verify',
    pattern: '/business-verify',
    targetPattern: '/workspace',
    priority: 95,
  },
  {
    id: 'alias.business-pulse',
    pattern: '/business-pulse',
    targetPattern: '/network/hub',
    priority: 95,
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
