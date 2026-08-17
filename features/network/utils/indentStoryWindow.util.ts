/** Default Pulse LOAD story window after create or reboost. */
export const INDENT_STORY_TTL_MS = 24 * 60 * 60 * 1000;

export function indentStoryExpiresAt(fromMs: number = Date.now()): string {
  return new Date(fromMs + INDENT_STORY_TTL_MS).toISOString();
}

/**
 * Story-reel window only — not Get Load / bid visibility (indent lifecycle owns that).
 * Legacy posts with no `expires_at` stay live until `is_active` is cleared.
 */
export function isIndentStoryLive(row: {
  is_active?: boolean | null;
  expires_at?: string | null;
}): boolean {
  if (row.is_active !== true) return false;
  if (!row.expires_at) return true;
  const expires = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expires)) return false;
  return expires > Date.now();
}
