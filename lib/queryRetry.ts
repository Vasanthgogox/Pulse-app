/**
 * Shared TanStack Query retry policy for Supabase / edge proxy failures.
 * Backs off 15s → 30s → 60s → 120s to avoid client death-spirals during 522/503 storms.
 */

const INFRA_PATTERN =
  /522|520|500|502|503|504|429|timeout|timed out|network|fetch failed|gateway|connection/i;

export function isInfrastructureError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return INFRA_PATTERN.test(msg);
}

/** Max 4 attempts (initial + 3 retries). */
export function infrastructureShouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 4 && isInfrastructureError(error);
}

export function infrastructureRetryDelay(attemptIndex: number): number {
  return Math.min(30_000, 2_000 * 2 ** attemptIndex);
}
