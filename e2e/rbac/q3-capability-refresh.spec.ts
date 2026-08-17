import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { qaCredentials, signIn } from '../support/auth';
import {
  awaitPermissions,
  diffSnapshots,
  readBaselineFile,
  readPermissions,
  type PermissionsSnapshot,
} from '../support/permissionsDb';

/**
 * E2E PROBE — Q3 ONLY: capability refresh semantics.
 *
 * Answers exactly three questions and nothing else:
 *   A) Does an ALREADY-AUTHENTICATED Ayush session see a new grant WITHOUT reload?
 *   B) Does that SAME session see it AFTER reload?
 *   C) Does a NEWLY authenticated session see it?
 *
 * WHY THIS IS A SEPARATE SPEC FROM domain-semantics-probe.spec.ts.
 * That spec answered Q1 and Q2 correctly but could not answer Q3, because its sequence
 * was:
 *      Sales ON  ->  grant appears
 *      revoke the 9 Indents children   <-- pulse_loads is one of them
 *      test the QA session             <-- the grant it needed was already gone
 * By the time Q3 ran, "denied" was the CORRECT answer for a perfectly refreshed session,
 * so a stale session and a fresh one predicted the identical observation. The result was
 * unusable. Here the ONLY mutation is the domain switch, and the session is observed
 * while the grant is still live.
 *
 * MUTATION BUDGET — deliberately minimal.
 *   Sales OFF -> ON   (one save)
 *   Sales ON  -> OFF  (one save, the restore)
 * No child permission is touched. The 9 Indents controls are never clicked. Sales ON
 * grants tripops.pulse_loads as one of its 28 children (established by Q1), which is
 * what makes the domain switch alone sufficient to move the subject surface.
 *
 * DATABASE IS THE ONLY AUTHORITY. Panel unmount means the UI finished, not that the
 * write is observable — proven by an earlier false "BLOCKED — NOT RESTORED". Every
 * post-save read goes through awaitPermissions().
 *
 * INDETERMINATE IS A REAL OUTCOME. A timeout, a loading state, a failed sign-in or a
 * missing marker is never converted into granted or denied.
 */

const QA_MEMBER_ID = process.env.E2E_MEMBER_ID;
const BASELINE_MD5 = 'ec6442195cca2dd8058927ef492ff47c';

const DOMAIN_SWITCH = 'Sales / Network domain';
const DENIED_TEXT = "You don't have access to Pulse loads.";
/** Rendered by LoadCenterView only past both the surface gate and the orgId gate. */
const GRANTED_MARKER = 'Load Center';

const CARDS = [
  'Finance',
  'Sales / Network',
  'Operations',
  'Team / Workspace',
  'Supply',
  'Compliance',
  'Vendor support',
  'IT dept',
] as const;

const EVIDENCE_DIR = resolve(process.cwd(), 'e2e/.qa/evidence');
const findings: Record<string, unknown> = {};

function record(key: string, value: unknown): void {
  findings[key] = value;
  console.log(`[q3] ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
}

function flushFindings(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, 'q3-capability-refresh-findings.json'),
    JSON.stringify(findings, null, 2),
  );
}

type AccessResult = 'granted' | 'denied' | 'indeterminate';

function checkbox(page: Page, label: string): Locator {
  return page.getByLabel(label, { exact: true }).first();
}

/**
 * app/pulse-loads/index.tsx has FOUR render branches, two of which are loading states
 * showing neither marker. Promise.any resolves on the first definitive marker and
 * rejects only when both time out — which is precisely the indeterminate condition.
 */
async function probeAccess(page: Page): Promise<AccessResult> {
  await dismissBlockingModal(page).catch(() => {});

  const denied = page.getByText(DENIED_TEXT, { exact: false }).first();
  const granted = page.getByText(GRANTED_MARKER, { exact: false }).first();

  const sawDenial = denied
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then((): AccessResult => 'denied');
  const sawGranted = granted
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then((): AccessResult => 'granted');

  return Promise.any([sawDenial, sawGranted]).catch((): AccessResult => 'indeterminate');
}

/** The awarded-indent interrupt is full-screen and blocks the footer. Header reads 1/3. */
async function dismissBlockingModal(page: Page): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    const later = page.getByLabel('Later', { exact: true }).first();
    if (!(await later.isVisible().catch(() => false))) return;
    await later.click({ timeout: 10_000 }).catch(() => {});
    await expect
      .poll(async () => later.isVisible().catch(() => false), { timeout: 15_000 })
      .toBe(false)
      .catch(() => {});
  }
}

async function openMemberPermissions(page: Page): Promise<void> {
  await page.goto(`/member-permissions?memberId=${QA_MEMBER_ID}`);
  await dismissBlockingModal(page);
  await page
    .getByText('Save changes', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 });
}

async function expandSalesCard(page: Page): Promise<void> {
  const chip = page.getByText(/^(Show|Hide) \d+/).nth(CARDS.indexOf('Sales / Network'));
  await chip.waitFor({ state: 'visible', timeout: 30_000 });
  if ((await chip.textContent())?.trim().startsWith('Show')) {
    await chip.click();
    await expect(chip).toHaveText(/^Hide \d+/, { timeout: 30_000 });
  }
}

async function setDomain(page: Page, on: boolean): Promise<void> {
  const toggle = checkbox(page, DOMAIN_SWITCH);
  await toggle.waitFor({ state: 'visible', timeout: 30_000 });
  if ((await toggle.isChecked()) !== on) {
    await toggle.click();
    if (on) await expect(toggle).toBeChecked({ timeout: 30_000 });
    else await expect(toggle).not.toBeChecked({ timeout: 30_000 });
  }
}

/** Save completion is panel UNMOUNT — handleSave() ends with onBack(). */
async function save(page: Page): Promise<'saved' | 'nothing-to-save'> {
  await dismissBlockingModal(page);
  const label = page.getByText('Save changes', { exact: true }).first();
  await expect(label).toBeVisible({ timeout: 30_000 });

  const button = page.locator('[role="button"]', { has: label }).first();
  const target = (await button.count()) ? button : label;
  if (await target.isDisabled().catch(() => false)) return 'nothing-to-save';

  await target.click();
  await label.waitFor({ state: 'detached', timeout: 90_000 });
  return 'saved';
}

async function assertAtBaseline(stage: string, settle = false): Promise<PermissionsSnapshot> {
  const baseline = readBaselineFile();

  if (settle) {
    await awaitPermissions(QA_MEMBER_ID as string, (s) => s.canonical === baseline.canonical, {
      describe: 'persisted permissions to return to the exact baseline after restore',
    }).catch((error) => record('restore.settleTimeout', String(error)));
  }

  const actual = await readPermissions(QA_MEMBER_ID as string);
  const diff = diffSnapshots(baseline, actual);
  expect(
    actual.canonical,
    `${stage}: persisted permissions do not equal AYUSH-DB-BASELINE.json.\n${diff.join('\n')}`,
  ).toBe(baseline.canonical);
  expect(actual.md5, `${stage}: md5 mismatch`).toBe(BASELINE_MD5);
  expect(actual.granted.length, `${stage}: grant count`).toBe(20);
  expect(actual.domains.sales, `${stage}: domains.sales must be false`).toBe(false);
  return actual;
}

test.describe('RBAC Q3 — capability refresh', () => {
  test.skip(!QA_MEMBER_ID, 'E2E_MEMBER_ID must point at the authorised disposable QA member.');
  test.describe.configure({ mode: 'serial', timeout: 15 * 60_000 });

  test('does an existing session pick up a new grant on reload, or need fresh auth?', async ({
    browser,
  }) => {
    // ---- 1. SAFETY GATE — before any browser opens ------------------------
    const baseline = await assertAtBaseline('SAFETY GATE');
    record('gate.md5', baseline.md5);
    record('gate.granted', baseline.granted.length);
    record('gate.domainsSales', baseline.domains.sales);

    let ownerContext: BrowserContext | null = null;
    let qaContext: BrowserContext | null = null;
    let mutated = false;

    try {
      // ---- 2. CONTEXT B — pre-mutation session ---------------------------
      // Signed in BEFORE any mutation so its session genuinely predates the change.
      // Never reloaded or re-authenticated until step 4.
      qaContext = await browser.newContext();
      const qaPage = await qaContext.newPage();
      await signIn(qaPage, qaCredentials());
      await qaPage.goto('/pulse-loads');

      const preMutation = await probeAccess(qaPage);
      record('PRE_MUTATION_DENIED', preMutation);
      expect(
        preMutation,
        `Context B must start with an OBSERVED denial — got "${preMutation}".`,
      ).toBe('denied');

      // ---- 3. CONTEXT A — the ONLY mutation ------------------------------
      ownerContext = await browser.newContext();
      const ownerPage = await ownerContext.newPage();
      await signIn(ownerPage, undefined);
      await openMemberPermissions(ownerPage);
      await expandSalesCard(ownerPage);

      const toggle = checkbox(ownerPage, DOMAIN_SWITCH);
      expect(await toggle.isChecked(), 'Sales must start OFF').toBe(false);

      mutated = true;
      await setDomain(ownerPage, true);
      expect(await toggle.isChecked(), 'Sales control did not change state').toBe(true);

      const saved = await save(ownerPage);
      expect(saved, 'enable Sales: Save was disabled — the edit never registered').toBe('saved');

      // DB must actually show the change before the session is questioned.
      const afterOn = await awaitPermissions(
        QA_MEMBER_ID as string,
        (s) => s.domains.sales === true,
        { describe: 'domains.sales to become true after enabling Sales' },
      );
      record('afterSalesOn.md5', afterOn.md5);
      record('afterSalesOn.totalGranted', afterOn.granted.length);
      record('afterSalesOn.domainsSales', afterOn.domains.sales);
      record('afterSalesOn.pulseLoadsGranted', afterOn.surfaces['tripops.pulse_loads'] === true);

      // The whole experiment depends on the subject surface actually being granted.
      expect(
        afterOn.surfaces['tripops.pulse_loads'],
        'tripops.pulse_loads must be granted by the domain switch for Q3 to mean anything',
      ).toBe(true);

      // ---- 4. EXISTING SESSION TEST — the primary Q3 measurement ---------
      // Same context, same page, never re-authenticated.
      const beforeReload = await probeAccess(qaPage);
      record('existing_session_before_reload', beforeReload);

      await qaPage.reload().catch((error) => record('existing_session.reloadError', String(error)));
      const afterReload = await probeAccess(qaPage);
      record('existing_session_after_reload', afterReload);

      // ---- 5. FRESH AUTH TEST — separate context, no shared storage ------
      let freshResult: AccessResult = 'indeterminate';
      const freshContext = await browser.newContext();
      try {
        const freshPage = await freshContext.newPage();
        await signIn(freshPage, qaCredentials());
        await freshPage.goto('/pulse-loads');
        freshResult = await probeAccess(freshPage);
      } catch (error) {
        // A failed sign-in is INDETERMINATE, never denied. The previous run hit a
        // 120s waitForURL timeout here; that says nothing about permissions.
        record('fresh_auth.error', String(error));
        freshResult = 'indeterminate';
      } finally {
        await freshContext.close();
      }
      record('fresh_auth_result', freshResult);

      // ---- Verdict — only from definitive observations -------------------
      if (beforeReload === 'granted') {
        record('propagation_verdict', 'LIVE — the open session gained access with no reload');
      } else if (beforeReload === 'denied' && afterReload === 'granted') {
        record('propagation_verdict', 'RELOAD — an open session picks up the grant on reload');
      } else if (beforeReload === 'denied' && afterReload === 'denied' && freshResult === 'granted') {
        record('propagation_verdict', 'RE-AUTH — reload is not enough; fresh sign-in required');
      } else if (
        beforeReload === 'denied' &&
        afterReload === 'denied' &&
        freshResult === 'denied'
      ) {
        record(
          'propagation_verdict',
          'NOT ENFORCED — the grant persisted but no session gained access. Investigate.',
        );
      } else {
        record(
          'propagation_verdict',
          `INDETERMINATE — before=${beforeReload} afterReload=${afterReload} fresh=${freshResult}. ` +
            'No conclusion drawn.',
        );
      }
    } finally {
      // ---- 6. RESTORE — Sales OFF, DB-verified --------------------------
      if (mutated) {
        try {
          if (!ownerContext) {
            throw new Error('owner context unavailable — cannot drive the UI restore.');
          }
          const ownerPage = ownerContext.pages()[0] ?? (await ownerContext.newPage());
          await openMemberPermissions(ownerPage);
          await expandSalesCard(ownerPage);
          await setDomain(ownerPage, false);
          await save(ownerPage);
        } catch (error) {
          record('restore.uiError', String(error));
        }

        try {
          const restored = await assertAtBaseline('RESTORE', true);
          record('restore.status', 'RESTORED');
          record('restore.md5', restored.md5);

          // Step 6: two independent confirmation reads after restoration.
          for (let i = 1; i <= 2; i += 1) {
            const check = await readPermissions(QA_MEMBER_ID as string);
            record(`restore.verify${i}`, {
              md5: check.md5,
              granted: check.granted.length,
              sales: check.domains.sales,
              equal: check.canonical === readBaselineFile().canonical,
            });
          }
        } catch (error) {
          record('restore.status', 'BLOCKED — NOT RESTORED');
          record('restore.error', String(error));
          flushFindings();
          throw new Error(
            'RESTORE FAILED — Ayush is NOT at baseline. Do not re-run. Do not retry.\n' +
              `Findings: ${EVIDENCE_DIR}/q3-capability-refresh-findings.json\n${String(error)}`,
          );
        }
      }

      flushFindings();
      await ownerContext?.close();
      await qaContext?.close();
    }
  });
});
