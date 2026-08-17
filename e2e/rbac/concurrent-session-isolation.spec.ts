import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { qaCredentials, signIn } from '../support/auth';
import { diffSnapshots, readBaselineFile, readPermissions } from '../support/permissionsDb';

/**
 * ISOLATION EXPERIMENT — concurrent sessions for the same account.
 *
 * ZERO MUTATION. This spec never opens Member Access, never toggles a permission and
 * never clicks Save. Its only writes are to the evidence file. Ayush's permissions are
 * read before and after purely to PROVE nothing changed.
 *
 * WHY IT EXISTS.
 * Two separate Q3 runs failed at the identical point: the second Ayush sign-in timed out
 * after 120s on `waitForURL` off /sign-in, while a first Ayush session was still open.
 * That produced INDETERMINATE for the fresh-auth leg both times, which is what currently
 * blocks Q3 from being answerable at all.
 *
 * The hypothesis is that the app does not tolerate two concurrent sessions for one
 * account. This experiment tests exactly that and nothing else. It is deliberately
 * incapable of answering "why" — a timeout is recorded as a timeout, never as a cause.
 *
 * WHAT A TIMEOUT DOES AND DOESN'T MEAN.
 * A stall at waitForURL means the browser never navigated away from /sign-in. It does
 * NOT establish that the server rejected the login, that a session was evicted, or that
 * concurrency is unsupported. Those are candidate explanations this test cannot separate.
 * Per the brief, the outcome is classified as "concurrent-session behavior observed;
 * root cause unconfirmed."
 */

const QA_MEMBER_ID = process.env.E2E_MEMBER_ID;
const BASELINE_MD5 = 'ec6442195cca2dd8058927ef492ff47c';
const DENIED_TEXT = "You don't have access to Pulse loads.";
const GRANTED_MARKER = 'Load Center';

const EVIDENCE_DIR = resolve(process.cwd(), 'e2e/.qa/evidence');
const findings: Record<string, unknown> = {};

function record(key: string, value: unknown): void {
  findings[key] = value;
  console.log(`[iso] ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
}

function flushFindings(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, 'concurrent-session-findings.json'),
    JSON.stringify(findings, null, 2),
  );
}

type SignInOutcome = {
  result: 'authenticated' | 'explicit-error' | 'indeterminate';
  ms: number;
  finalUrl: string;
  detail?: string;
};

/**
 * Signs in and classifies the outcome into three states.
 *
 * 'explicit-error'  — the app rendered a visible error message. A real, informative
 *                     negative: the server answered and refused.
 * 'indeterminate'   — the navigation never happened and no error surfaced. Says nothing
 *                     about cause; must not be reported as a failure to authenticate.
 */
async function attemptSignIn(page: Page, label: string): Promise<SignInOutcome> {
  const started = Date.now();
  try {
    await signIn(page, qaCredentials());
    return {
      result: 'authenticated',
      ms: Date.now() - started,
      finalUrl: page.url(),
    };
  } catch (error) {
    const ms = Date.now() - started;
    const finalUrl = page.url();

    // Distinguish "the app told us no" from "nothing happened". Only the former is a
    // real authentication failure; the latter is genuinely unknown.
    const errorBanner = page
      .getByText(/invalid|incorrect|failed|error|try again|too many/i)
      .first();
    const visibleError = await errorBanner.isVisible().catch(() => false);
    const errorText = visibleError ? (await errorBanner.textContent().catch(() => null)) : null;

    record(`${label}.rawError`, String(error).split('\n')[0]);

    return {
      result: visibleError ? 'explicit-error' : 'indeterminate',
      ms,
      finalUrl,
      detail: errorText?.trim() ?? undefined,
    };
  }
}

/** Same three-state reader used by the other RBAC probes. */
async function probeAccess(page: Page): Promise<'granted' | 'denied' | 'indeterminate'> {
  const denied = page.getByText(DENIED_TEXT, { exact: false }).first();
  const granted = page.getByText(GRANTED_MARKER, { exact: false }).first();

  const sawDenial = denied
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then((): 'denied' => 'denied');
  const sawGranted = granted
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then((): 'granted' => 'granted');

  return Promise.any([sawDenial, sawGranted]).catch(
    (): 'indeterminate' => 'indeterminate',
  );
}

async function verifyBaseline(stage: string): Promise<void> {
  const baseline = readBaselineFile();
  const actual = await readPermissions(QA_MEMBER_ID as string);
  const diff = diffSnapshots(baseline, actual);

  record(`${stage}.md5`, actual.md5);
  record(`${stage}.granted`, actual.granted.length);
  record(`${stage}.domainsSales`, actual.domains.sales);
  record(`${stage}.exactEquality`, actual.canonical === baseline.canonical);

  expect(actual.canonical, `${stage}: permissions differ from baseline.\n${diff.join('\n')}`).toBe(
    baseline.canonical,
  );
  expect(actual.md5, `${stage}: md5 mismatch`).toBe(BASELINE_MD5);
  expect(actual.granted.length, `${stage}: grant count`).toBe(20);
  expect(actual.domains.sales, `${stage}: domains.sales`).toBe(false);
}

test.describe('Concurrent session isolation (zero mutation)', () => {
  test.skip(!QA_MEMBER_ID, 'E2E_MEMBER_ID must point at the authorised disposable QA member.');
  test.describe.configure({ mode: 'serial', timeout: 12 * 60_000 });

  test('can the same account hold two simultaneous authenticated sessions?', async ({ browser }) => {
    // ---- 1. Baseline before ------------------------------------------------
    await verifyBaseline('before');

    let contextA: BrowserContext | null = null;
    let contextB: BrowserContext | null = null;

    try {
      // ---- 2 & 3. Context A signs in ---------------------------------------
      contextA = await browser.newContext();
      const pageA = await contextA.newPage();
      const outcomeA = await attemptSignIn(pageA, 'contextA');
      record('contextA.signIn', outcomeA);

      // If the FIRST sign-in is not clean, the concurrency question is untestable —
      // there is no established session for a second one to conflict with.
      expect(
        outcomeA.result,
        `Context A sign-in was "${outcomeA.result}" — cannot test concurrency without ` +
          'a confirmed first session.',
      ).toBe('authenticated');

      // ---- 4. Context B signs in WITHOUT closing A -------------------------
      contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const outcomeB = await attemptSignIn(pageB, 'contextB');
      record('contextB.signIn', outcomeB);

      if (outcomeB.result === 'authenticated') {
        // ---- 5. Both sessions live: observe them independently -------------
        record('hypothesis', 'DISPROVEN — two concurrent sessions authenticated');

        await pageA.goto('/pulse-loads');
        await pageB.goto('/pulse-loads');
        const [accessA, accessB] = await Promise.all([probeAccess(pageA), probeAccess(pageB)]);
        record('contextA.pulseLoads', accessA);
        record('contextB.pulseLoads', accessB);

        // Both are at baseline permissions, so both should read denied. An
        // indeterminate here is recorded, not interpreted.
        record(
          'concurrentObservation',
          accessA === 'denied' && accessB === 'denied'
            ? 'both sessions independently observed the expected denial'
            : `A=${accessA} B=${accessB} — see note`,
        );
      } else {
        // ---- 6. Context B did not authenticate ------------------------------
        record(
          'hypothesis',
          'SUPPORTED — second concurrent sign-in did not complete; ' +
            'concurrent-session behavior observed, root cause unconfirmed',
        );
        record('contextB.failurePoint', outcomeB.finalUrl);
        record('contextB.elapsedMs', outcomeB.ms);
        record('contextB.mechanism', outcomeB.detail ?? 'no visible error message rendered');
      }
    } finally {
      // ---- 7. Close both ---------------------------------------------------
      await contextA?.close();
      await contextB?.close();

      // ---- 8. Baseline after — nothing may have changed --------------------
      try {
        await verifyBaseline('after');
        record('baselineAfter', 'UNCHANGED');
      } catch (error) {
        record('baselineAfter', 'BLOCKED — BASELINE DIFFERS');
        record('baselineAfter.error', String(error));
        flushFindings();
        throw new Error(`BLOCKED — Ayush's permissions changed during a zero-mutation test.\n${String(error)}`);
      }
      flushFindings();
    }
  });
});
