/** Canonical ID format validators — aligned with platform schema CHECK constraints. */

export const CANONICAL_ID_PATTERNS = {
  TENANT: /^TENANT-\d{6}$/,
  ORG:    /^ORG-\d{6}$/,
  BU:     /^BU-\d{6}$/,
  WH:     /^WH-\d{6}$/,
  USR:    /^USR-\d{6}$/,
  MEM:    /^MEM-\d{6}$/,
  INV:    /^INV-\d{6}$/,
} as const;

export type CanonicalPrefix = keyof typeof CANONICAL_ID_PATTERNS;

export function assertCanonicalId(value: string, prefix: CanonicalPrefix): void {
  const pattern = CANONICAL_ID_PATTERNS[prefix];
  if (!pattern.test(value)) {
    throw new Error(`Expected ${prefix} canonical ID, got "${value}"`);
  }
}

export function isCanonicalId(value: string, prefix: CanonicalPrefix): boolean {
  return CANONICAL_ID_PATTERNS[prefix].test(value);
}
