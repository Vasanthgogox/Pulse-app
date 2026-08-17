import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Database-truth reader for organization_members.permissions.
 *
 * WHY THIS EXISTS — the escalation of the previous run.
 * The earlier harness verified restoration by reading the owner's UI. The UI said
 * "Sales off, surface off"; the database held 48 grants instead of 20. The UI is a
 * rendering of state, not the state. Every assertion that matters in the probe is
 * therefore made against this module, and the UI is treated purely as the input
 * device that drives the change.
 *
 * CREDENTIAL WARNING — READ THIS BEFORE CHANGING ANYTHING HERE.
 * This uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS and CAN WRITE. It is used
 * here only because no read-only credential is available to a Node process (the
 * read-only path used during investigation was an MCP connection the test runner
 * cannot call). The mitigation is structural, not conventional:
 *
 *   - This module exports NO write function. There is no update/insert/delete call
 *     anywhere in this file, so the probe has no code path that can write to the DB
 *     even by mistake. All mutation happens through the owner's browser UI, exactly
 *     as a real administrator would do it.
 *   - assertServiceKeyIsReadPathOnly() is called on construction as a tripwire.
 *
 * If you add a write helper here, you have removed the only thing keeping a
 * service-role key safe in a test harness. Don't.
 */

const PERMISSIONS_TABLE = 'organization_members';

/** Loads .env (gitignored) without disturbing the e2e/.env.e2e that playwright.config.ts loads. */
function readRootEnv(key: string): string | undefined {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      if (!/^\s*[A-Z]/.test(line)) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      if (line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim();
    }
  } catch {
    /* fall through to process.env */
  }
  return process.env[key];
}

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (client) return client;

  const url = readRootEnv('EXPO_PUBLIC_SUPABASE_URL') ?? readRootEnv('SUPABASE_URL');
  const key = readRootEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      'permissionsDb: missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env — ' +
        'the probe cannot verify database truth without them, and must not run on UI evidence alone.',
    );
  }

  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export type PermissionsSnapshot = {
  /** The parsed permissions object exactly as persisted. */
  permissions: Record<string, unknown>;
  /** md5 of the canonical serialisation — the restore criterion. */
  md5: string;
  /** Canonical JSON string used to produce the md5, key-sorted for stability. */
  canonical: string;
  surfaces: Record<string, boolean>;
  domains: Record<string, boolean>;
  /** Surface keys whose value is true. Sorted. */
  granted: string[];
};

/**
 * Stable serialisation. Postgres does not guarantee jsonb key order on read, so the
 * md5 of a raw JSON.stringify would be non-deterministic across reads of identical
 * data. Sorting every object key makes the hash a property of the DATA, not of the
 * transport. The stored baseline md5 was produced the same way.
 */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalise((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function snapshotOf(permissions: Record<string, unknown>): PermissionsSnapshot {
  const canonical = JSON.stringify(canonicalise(permissions));
  const surfaces = (permissions.surfaces ?? {}) as Record<string, boolean>;
  const domains = (permissions.domains ?? {}) as Record<string, boolean>;
  return {
    permissions,
    canonical,
    md5: createHash('md5').update(canonical).digest('hex'),
    surfaces,
    domains,
    granted: Object.keys(surfaces)
      .filter((k) => surfaces[k] === true)
      .sort(),
  };
}

/** Reads persisted permissions for one member. READ ONLY — this module has no writer. */
export async function readPermissions(memberId: string): Promise<PermissionsSnapshot> {
  const { data, error } = await db()
    .from(PERMISSIONS_TABLE)
    .select('permissions')
    .eq('id', memberId)
    .single();

  if (error) throw new Error(`permissionsDb: read failed for ${memberId}: ${error.message}`);
  if (!data?.permissions) throw new Error(`permissionsDb: no permissions row for ${memberId}`);
  return snapshotOf(data.permissions as Record<string, unknown>);
}

/**
 * Polls the persisted permissions until `predicate` holds, then returns that snapshot.
 *
 * WHY THIS EXISTS — the defect that invalidated the first run.
 * A UI Save completing (the panel unmounts) does NOT mean the write is yet observable to
 * a separate DB connection. Reading immediately after the save returned the PREVIOUS
 * state on every post-save read, one step stale, in both directions:
 *   - after "enable Sales" it reported 20 grants / sales=false (the pre-save state)
 *   - after the restore it reported 48 grants / sales=true  (the pre-restore state)
 * So the probe recorded a wrong Q1 and raised a false "BLOCKED — NOT RESTORED".
 *
 * This is condition-based, not a sleep: it re-reads until the caller's expected state is
 * actually visible. There is no fixed delay anywhere in this function.
 *
 * ON TIMEOUT IT THROWS. It never returns the last-seen snapshot, because a caller that
 * received a stale snapshot could classify a security state from it — exactly the thing
 * that must not happen. A timeout is INDETERMINATE and the caller must treat it as such.
 */
export async function awaitPermissions(
  memberId: string,
  predicate: (snapshot: PermissionsSnapshot) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; describe?: string } = {},
): Promise<PermissionsSnapshot> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  let last: PermissionsSnapshot | null = null;
  let lastError: unknown = null;

  for (;;) {
    try {
      last = await readPermissions(memberId);
      if (predicate(last)) return last;
    } catch (error) {
      // Transient read failures are retried until the deadline; a persistent one
      // surfaces in the timeout message below rather than being silently swallowed.
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const what = options.describe ?? 'expected persisted state';
  const detail = last
    ? `last observed: md5=${last.md5} granted=${last.granted.length} ` +
      `domains=${JSON.stringify(last.domains)}`
    : `no successful read; last error: ${String(lastError)}`;
  throw new Error(
    `permissionsDb: timed out after ${timeoutMs}ms waiting for ${what}. ` +
      `INDETERMINATE — do not infer state from this. ${detail}`,
  );
}

/** The on-disk baseline captured read-only before any mutation ever occurred. */
export function readBaselineFile(): PermissionsSnapshot {
  const path = resolve(process.cwd(), 'e2e/.qa/AYUSH-DB-BASELINE.json');
  return snapshotOf(JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>);
}

/** Human-readable difference between two snapshots. Used in failure messages. */
export function diffSnapshots(
  expected: PermissionsSnapshot,
  actual: PermissionsSnapshot,
): string[] {
  const lines: string[] = [];
  const keys = [...new Set([...Object.keys(expected.surfaces), ...Object.keys(actual.surfaces)])].sort();
  for (const key of keys) {
    const e = expected.surfaces[key];
    const a = actual.surfaces[key];
    if (e !== a) lines.push(`  surface ${key}: expected ${e}, actual ${a}`);
  }
  for (const key of [...new Set([...Object.keys(expected.domains), ...Object.keys(actual.domains)])].sort()) {
    const e = expected.domains[key];
    const a = actual.domains[key];
    if (e !== a) lines.push(`  domain  ${key}: expected ${e}, actual ${a}`);
  }
  if (expected.md5 !== actual.md5 && lines.length === 0) {
    lines.push(`  md5 differs but surfaces/domains match — a non-surface field changed`);
    lines.push(`  expected: ${expected.canonical}`);
    lines.push(`  actual  : ${actual.canonical}`);
  }
  return lines;
}
