/**
 * Polling utilities for eventually-consistent assertions.
 * DB triggers that provision profiles/orgs run asynchronously after Supabase
 * auth user creation, so tests must poll instead of asserting immediately.
 */

export interface RetryOptions {
  /** Maximum wait time in milliseconds. Default: 10_000. */
  timeoutMs?: number;
  /** Polling interval in milliseconds. Default: 500. */
  intervalMs?: number;
  /** Human-readable description used in the timeout error message. */
  description?: string;
}

/**
 * Polls `fn` every `intervalMs` until it returns a truthy value or `timeoutMs` elapses.
 * Throws with a descriptive error on timeout.
 */
export async function retryUntil<T>(
  fn: () => Promise<T | null | undefined | false>,
  options: RetryOptions = {},
): Promise<T> {
  const { timeoutMs = 10_000, intervalMs = 500, description = 'condition' } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result as T;
    await sleep(intervalMs);
  }

  throw new Error(
    `[retryUntil] Timed out after ${timeoutMs}ms waiting for: ${description}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Domain-specific polling ──────────────────────────────────────────────────

import {
  getMembershipByUserId,
  getOrgByOwnerId,
  getProfileByEmail,
  type MembershipRow,
  type OrganizationRow,
  type ProfileRow,
} from './supabase.admin';

export interface ProvisioningResult {
  profile: ProfileRow;
  org: OrganizationRow;
  membership: MembershipRow;
}

/**
 * Polls until profile, organization, AND organization_members rows all exist
 * for the given user. The DB trigger that creates these runs after auth.users
 * INSERT so there may be a short delay (typically < 2s in dev, up to ~5s in CI).
 *
 * @param email - The user's email (used to look up the profile).
 * @param userId - The auth user's UUID (used to look up org + membership).
 * @param timeoutMs - How long to wait before failing. Default: 10_000.
 */
export async function waitForProvisioning(
  email: string,
  userId: string,
  timeoutMs = 10_000,
): Promise<ProvisioningResult> {
  return retryUntil<ProvisioningResult>(
    async () => {
      const profile = await getProfileByEmail(email);
      if (!profile) return null;

      const membership = await getMembershipByUserId(userId);
      if (!membership) return null;

      const org = await getOrgByOwnerId(userId);
      if (!org) return null;

      return { profile, org, membership };
    },
    {
      timeoutMs,
      intervalMs: 500,
      description: `provisioning (profile + org + membership) for user ${userId}`,
    },
  );
}

/**
 * Polls until a profile row exists for the given email.
 * For driver users who don't get an org row.
 */
export async function waitForProfile(email: string, timeoutMs = 10_000): Promise<ProfileRow> {
  return retryUntil<ProfileRow>(
    () => getProfileByEmail(email),
    {
      timeoutMs,
      intervalMs: 500,
      description: `profile row for ${email}`,
    },
  );
}
