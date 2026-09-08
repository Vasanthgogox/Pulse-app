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
 * E2E PROBE: domain / child permission semantics.
 *
 * THIS IS A PROBE, NOT A REGRESSION TEST.
 * It exists to ANSWER three open questions, not to assert a known-good outcome.
 * Where behaviour is unknown it RECORDS what happened rather than failing, because a
 * failure on an unknown would tell us nothing we did not already not-know. Only the
 * safety invariants (baseline before, baseline after) are hard assertions.
 *
 * The questions:
 *   Q1 — Does enabling the Sales domain grant all 28 child surfaces, or only the tab?
 *        (The previous run observed 28. That was one incidental observation during an
 *        escalation, never a designed measurement, and the 28 key NAMES were never
 *        captured — only the count.)
 *   Q2 — With Sales ON, are the 9 Indents children individually revocable while the
 *        other 19 Sales surfaces stay granted? If the controls are disabled, the
 *        domain is all-or-nothing and per-child editing does not exist.
 *   Q3 — Does an ALREADY-AUTHENTICATED member session pick up an owner-side permission
 *        change on reload, or does it require fresh authentication?
 *
 * WHY Q3 NEEDS CONTEXT B OPENED FIRST — the trap that invalidated the previous run.
 * A session minted AFTER the owner's save was born holding the new permissions. Testing
 * such a session proves nothing about refresh: it never had the old state to update from.
 * Context B is therefore signed in and parked on the denied route BEFORE Context A
 * touches anything, and is not reloaded or re-authenticated until step 9.
 *
 * DATABASE IS THE ONLY SOURCE OF TRUTH.
 * The previous harness verified restoration from the owner's UI, which reported
 * "Sales off, surface off" while the database held 48 grants instead of 20. Every
 * consequential assertion here reads e2e/support/permissionsDb.ts. The UI is only the
 * input device. See that module's header for why a service-role key is acceptable here.
 *
 * THIS SPEC WRITES. It mutates the permissions of E2E_MEMBER_ID (Ayush, explicitly
 * authorised as the disposable QA subject). Restoration runs in finally{} and is
 * verified byte-for-byte against e2e/.qa/AYUSH-DB-BASELINE.json.
 */

const QA_MEMBER_ID = process.env.E2E_MEMBER_ID;
/**
 * Canonical (key-sorted) md5 of the baseline, as computed by permissionsDb.snapshotOf().
 *
 * TWO HASHES DESCRIBE THE SAME BASELINE — do not read this as drift.
 *   1eeb3b2cdd5ed70064e6ef13273c3b68 — historical value, md5 of the RAW TRIMMED TEXT of
 *                                      e2e/.qa/AYUSH-DB-BASELINE.json. Recorded during
 *                                      the earlier restoration and quoted in that file.
 *   ec6442195cca2dd8058927ef492ff47c — this value, md5 of the canonical KEY-SORTED
 *                                      serialisation used by permissionsDb.ts.
 *
 * The canonical form is required because Postgres does not guarantee jsonb key order on
 * read, so a raw-text hash of a DB round-trip is unstable for identical data. Verified:
 * the two hashes cover byte-identical data (exact canonical-JSON equality, 20 grants,
 * domains.sales=false, zero diff). Using the raw-text value here would abort the safety
 * gate — and falsely report BLOCKED — NOT RESTORED — on a perfectly healthy member.
 */
const BASELINE_MD5 = 'ec6442195cca2dd8058927ef492ff47c';

const DOMAIN_SWITCH = 'Sales / Network domain';
const DENIED_TEXT = "You don't have access to Pulse loads.";

/** DOM order of the domain cards — index disambiguates the Show/Hide chips. */
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

/**
 * The 28 surfaces the catalog declares as `domain: "sales"`, extracted from
 * lib/memberSurfaces.ts. Split into the 9 Indents children (which the probe attempts to
 * revoke) and the 19 others (which must be left untouched, and whose values after the
 * child edit answer Q2).
 *
 * The `tripops.` prefix on the Indents keys is a legacy id from before the
 * Operations->Sales move; the `domain` field is what the resolver gates on. Pinned by
 * lib/__tests__/rbac.memberAccess.test.ts.
 */
const INDENT_SURFACES = [
  { key: 'tripops.indents.view', label: 'View indents / pulse loads' },
  { key: 'tripops.indents.create', label: 'Create indent' },
  { key: 'tripops.indents.edit', label: 'Edit indent' },
  { key: 'tripops.indents.cancel', label: 'Cancel indent' },
  { key: 'tripops.indents.broadcast', label: 'Broadcast / share load' },
  { key: 'tripops.indents.bid', label: 'Bid on indent' },
  { key: 'tripops.indents.award', label: 'Award bid' },
  { key: 'tripops.indents.allocate', label: 'Allocate indent' },
  { key: 'tripops.pulse_loads', label: 'Pulse loads hub' },
] as const;

const OTHER_SALES_SURFACES = [
  'sales.tab',
  'sales.clients.view',
  'sales.clients.create',
  'sales.clients.edit',
  'sales.clients.detail',
  'sales.clients.analytics',
  'sales.marketplace.post',
  'sales.marketplace.bid',
  'sales.network.connect',
  'sales.network.discover',
  'sales.network.stories',
  'sales.suppliers.view',
  'sales.suppliers.create',
  'sales.suppliers.edit',
  'sales.suppliers.detail',
  'sales.suppliers.analytics',
  'sales.load_board',
  'sales.chat',
] as const;

const ALL_SALES_SURFACES = [...INDENT_SURFACES.map((s) => s.key), ...OTHER_SALES_SURFACES];

const EVIDENCE_DIR = resolve(process.cwd(), 'e2e/.qa/evidence');

/** Findings accumulate here and are written out even when the probe fails. */
const findings: Record<string, unknown> = {};

function record(key: string, value: unknown): void {
  findings[key] = value;
  console.log(`[probe] ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
}

function flushFindings(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, 'domain-semantics-findings.json'),
    JSON.stringify(findings, null, 2),
  );
}

// ---------------------------------------------------------------------------
// UI helpers. Deliberately mirror cross-user-persistence.spec.ts so the two specs
// cannot drift into disagreeing about how the panel behaves.
// ---------------------------------------------------------------------------

function checkbox(page: Page, label: string): Locator {
  return page.getByLabel(label, { exact: true }).first();
}

/**
 * React Native Web renders switches as real <input type="checkbox"> and drives them via
 * the DOM property, never writing the aria-checked ATTRIBUTE — so getAttribute() returns
 * null whether on or off. Switches must be read with isChecked(). Non-switch surface rows
 * render a tick as an <svg> child, so presence of that svg is the state.
 */
async function isSurfaceChecked(box: Locator): Promise<boolean> {
  if (await box.evaluate((el) => el.tagName === 'INPUT').catch(() => false)) {
    return box.isChecked();
  }
  return (await box.locator('svg').count()) > 0;
}

/** aria-disabled IS genuinely rendered (unlike aria-checked) when the parent domain is off. */
async function isSurfaceDisabled(box: Locator): Promise<boolean> {
  return (await box.getAttribute('aria-disabled')) === 'true';
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
    // Condition-based, never waitForTimeout: the assertion IS the synchronisation.
    if (on) await expect(toggle).toBeChecked({ timeout: 30_000 });
    else await expect(toggle).not.toBeChecked({ timeout: 30_000 });
  }
}

/**
 * The awarded-indent interrupt (AwardedIndentDeployModal) is full-screen and sits over
 * the panel footer, so it blocks Save. It fires on BOTH sessions, and the header reads
 * "1/3" — three awards are queued, so one dismissal is not enough. "Later" is a snooze.
 */
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

/**
 * Saves and waits for the panel to UNMOUNT.
 *
 * handleSave() ends with onBack() (MemberPermissionsPanel.tsx:412) once the write
 * resolves and the workspace refetches. The panel is destroyed. The previous harness
 * waited for the Save button to return to disabled, which polls a detached element and
 * can never succeed — that cost a 9-minute timeout and two wasted runs.
 */
async function save(page: Page): Promise<'saved' | 'nothing-to-save'> {
  await dismissBlockingModal(page);
  const label = page.getByText('Save changes', { exact: true }).first();
  await expect(label).toBeVisible({ timeout: 30_000 });

  const button = page.locator('[role="button"]', { has: label }).first();
  const target = (await button.count()) ? button : label;

  // Save is `disabled={busy || !dirty}`. A disabled Save means no state change was
  // registered — clicking it would hang rather than fail, so report it instead.
  if (await target.isDisabled().catch(() => false)) return 'nothing-to-save';

  await target.click();
  await label.waitFor({ state: 'detached', timeout: 90_000 });
  return 'saved';
}

async function saveExpectingChanges(page: Page, what: string): Promise<void> {
  const result = await save(page);
  expect(result, `${what}: Save was disabled — the edits never registered as changes`).toBe('saved');
}

/**
 * THE CORE SAFETY INVARIANT OF THIS PROBE:
 * every security conclusion must rest on an OBSERVED positive or negative signal.
 *
 *   explicit denial string   -> 'denied'
 *   unique granted marker    -> 'granted'
 *   timeout / error / neither-> 'indeterminate'  => NO security conclusion
 *
 * 'indeterminate' is not a soft 'denied'. The previous version of this function
 * collapsed every failure into 'denied', which meant a crashed page, a network stall,
 * a logged-out session or a renamed string all reported as successful enforcement —
 * and Q3 would then have concluded "fresh authentication required" from a page that
 * may never have rendered at all. For an RBAC probe that is a fabricated finding.
 */
type AccessResult = 'granted' | 'denied' | 'indeterminate';

/**
 * Distinct positive marker for the granted state.
 *
 * MUST NOT be a substring of DENIED_TEXT ("You don't have access to Pulse loads.").
 * /Pulse loads/i was the old marker and matched the denial message itself, so the
 * granted signal was only ever correct because of a secondary re-check.
 *
 * "Load Center" is the hub's own title, rendered by LoadCenterView only after
 * app/pulse-loads/index.tsx passes BOTH the canSurface("tripops.pulse_loads") gate and
 * the orgId gate. It appears in neither the denial branch nor the loading branch.
 */
const GRANTED_MARKER = 'Load Center';

/**
 * Reads the QA member's ACTUAL reachability of /pulse-loads.
 *
 * app/pulse-loads/index.tsx has THREE render branches, not two:
 *   1. accessLoading            -> ChromeBelowTopNavLoadingScreen  (undecided)
 *   2. !canViewLoadsHub         -> DENIED_TEXT                     (denied)
 *   3. !orgId                   -> ChromeBelowTopNavLoadingScreen  (undecided)
 *   4. otherwise                -> LoadCenterView / "Load Center"  (granted)
 *
 * Branches 1 and 3 are neither granted nor denied. Racing only two outcomes would let a
 * page sitting in a loading state fall through to whichever branch timed out first.
 * Hence three explicit outcomes, and a definitive `indeterminate` when neither marker
 * ever appears.
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

  // Promise.any resolves on the FIRST marker to appear and rejects only when BOTH
  // time out (or the page dies) — which is exactly the indeterminate condition.
  return Promise.any([sawDenial, sawGranted]).catch((): AccessResult => 'indeterminate');
}

// ---------------------------------------------------------------------------
// DB assertions
// ---------------------------------------------------------------------------

/**
 * @param settle when true, poll until the row equals the baseline before asserting.
 *   Used after the restore save, where the write needs to become observable. The gate
 *   check passes false: at that point nothing has been written, so any wait would only
 *   mask real pre-existing drift.
 *
 *   A settle timeout does NOT pass or fail on its own — it falls through to the same
 *   assertions below, which then report the actual observed difference.
 */
async function assertAtBaseline(stage: string, settle = false): Promise<PermissionsSnapshot> {
  const baseline = readBaselineFile();

  if (settle) {
    await awaitPermissions(QA_MEMBER_ID as string, (snap) => snap.canonical === baseline.canonical, {
      describe: 'persisted permissions to return to the exact baseline after restore',
    }).catch((error) => {
      record('restore.settleTimeout', String(error));
    });
  }

  const actual = await readPermissions(QA_MEMBER_ID as string);

  const diff = diffSnapshots(baseline, actual);
  expect(
    actual.canonical,
    `${stage}: persisted permissions do not equal e2e/.qa/AYUSH-DB-BASELINE.json.\n${diff.join('\n')}`,
  ).toBe(baseline.canonical);
  expect(actual.md5, `${stage}: md5 mismatch`).toBe(BASELINE_MD5);
  expect(actual.granted.length, `${stage}: grant count`).toBe(20);
  expect(actual.domains.sales, `${stage}: domains.sales must be false`).toBe(false);
  return actual;
}

function salesBreakdown(snap: PermissionsSnapshot) {
  const indents = Object.fromEntries(
    INDENT_SURFACES.map((s) => [s.key, snap.surfaces[s.key] === true]),
  );
  const others = Object.fromEntries(
    OTHER_SALES_SURFACES.map((k) => [k, snap.surfaces[k] === true]),
  );
  return {
    domainsSales: snap.domains.sales === true,
    md5: snap.md5,
    totalGranted: snap.granted.length,
    salesGrantedCount: ALL_SALES_SURFACES.filter((k) => snap.surfaces[k] === true).length,
    indentsGrantedCount: Object.values(indents).filter(Boolean).length,
    othersGrantedCount: Object.values(others).filter(Boolean).length,
    indents,
    others,
  };
}

// ---------------------------------------------------------------------------

test.describe('RBAC domain/child semantics probe', () => {
  test.skip(!QA_MEMBER_ID, 'E2E_MEMBER_ID must point at the authorised disposable QA member.');
  test.describe.configure({ mode: 'serial', timeout: 15 * 60_000 });

  test('Sales domain ON/OFF and per-child editability, with capability refresh', async ({
    browser,
  }) => {
    // ---- SAFETY GATE (steps 1-5): abort before touching the UI -------------
    const baseline = await assertAtBaseline('SAFETY GATE');
    record('gate.md5', baseline.md5);
    record('gate.granted', baseline.granted.length);

    let ownerContext: BrowserContext | null = null;
    let qaContext: BrowserContext | null = null;
    let mutated = false;

    try {
      // ---- CONTEXT B FIRST (steps 6-10) ----------------------------------
      // Signed in and parked on the denied route BEFORE any mutation, so its session
      // predates the change. This is what makes Q3 answerable.
      qaContext = await browser.newContext();
      const qaPage = await qaContext.newPage();
      await signIn(qaPage, qaCredentials());
      await qaPage.goto('/pulse-loads');

      const deniedBefore = await probeAccess(qaPage);
      record('contextB.beforeMutation', deniedBefore);
      // Must be an OBSERVED denial. 'indeterminate' fails here too: if the starting
      // state was never established, every later comparison against it is meaningless.
      expect(
        deniedBefore,
        'Context B must start with an OBSERVED denial — got ' +
          `"${deniedBefore}". The probe is meaningless without a confirmed starting state.`,
      ).toBe('denied');

      // ---- CONTEXT A: enable Sales (steps 11-16) -------------------------
      ownerContext = await browser.newContext();
      const ownerPage = await ownerContext.newPage();
      await signIn(ownerPage, undefined);
      await openMemberPermissions(ownerPage);
      await expandSalesCard(ownerPage);

      const domainToggle = checkbox(ownerPage, DOMAIN_SWITCH);
      expect(await domainToggle.isChecked(), 'Sales must start OFF').toBe(false);

      mutated = true; // from here on, restore is mandatory
      await setDomain(ownerPage, true);
      expect(await domainToggle.isChecked(), 'Sales control did not change state').toBe(true);
      await saveExpectingChanges(ownerPage, 'enable Sales');

      // ---- DB CHECK AFTER SALES ON (steps 17-20) -------------------------
      // Q1 answered here. Key NAMES are captured, not just the count.
      //
      // Waits for the write to become OBSERVABLE before snapshotting. Reading straight
      // after the save returned the pre-save state on the previous run and produced a
      // wrong Q1 ("Sales ON grants 0 children"). The wait is on domains.sales alone —
      // the child-surface values are the unknown under test and must NOT be waited on,
      // or the predicate would presuppose the answer.
      const afterOn = await awaitPermissions(
        QA_MEMBER_ID as string,
        (snap) => snap.domains.sales === true,
        { describe: 'domains.sales to become true after enabling Sales' },
      );
      record('Q1.afterSalesOn', salesBreakdown(afterOn));
      record('Q1.allGrantedKeys', afterOn.granted);
      expect(afterOn.domains.sales, 'domains.sales should be true after enabling').toBe(true);

      // ---- CHILD-EDIT PROBE (steps 21-27) --------------------------------
      await openMemberPermissions(ownerPage);
      await expandSalesCard(ownerPage);

      const editability: Record<string, { disabled: boolean; checked: boolean }> = {};
      for (const surface of INDENT_SURFACES) {
        const box = checkbox(ownerPage, surface.label);
        await box.waitFor({ state: 'visible', timeout: 30_000 });
        editability[surface.key] = {
          disabled: await isSurfaceDisabled(box),
          checked: await isSurfaceChecked(box),
        };
      }
      record('Q2.controlState', editability);

      const anyDisabled = Object.values(editability).some((s) => s.disabled);
      record('Q2.allNineEditable', !anyDisabled);

      if (anyDisabled) {
        // Step 23: record and DO NOT force-click. A disabled row's onPress is undefined
        // (DomainPermissionToggleRow.tsx:48), so a click is a silent no-op that would
        // leave Save disabled and hang the run.
        record('Q2.verdict', 'NOT individually editable — domain appears all-or-nothing');
      } else {
        for (const surface of INDENT_SURFACES) {
          const box = checkbox(ownerPage, surface.label);
          if (await isSurfaceChecked(box)) {
            await box.click();
            await expect
              .poll(() => isSurfaceChecked(box), { timeout: 30_000, message: `${surface.label} -> off` })
              .toBe(false);
          }
        }

        // Step 26: pre-save UI assertions.
        expect(await checkbox(ownerPage, DOMAIN_SWITCH).isChecked(), 'Sales must remain ON').toBe(true);
        for (const surface of INDENT_SURFACES) {
          expect(
            await isSurfaceChecked(checkbox(ownerPage, surface.label)),
            `${surface.label} should be OFF before save`,
          ).toBe(false);
        }

        await saveExpectingChanges(ownerPage, 'revoke 9 Indents children');

        // ---- DB CHECK AFTER CHILD EDIT (steps 28-31) ---------------------
        // Waits for the child-edit write to become observable. The predicate is
        // "the row changed at all since afterOn", NOT "the 9 indents are false" —
        // waiting on the expected answer would make the assertion unfalsifiable and
        // turn a genuine product finding into a timeout.
        const afterChild = await awaitPermissions(
          QA_MEMBER_ID as string,
          (snap) => snap.canonical !== afterOn.canonical,
          { describe: 'the child-edit save to become observable (any change from Q1 state)' },
        );
        const breakdown = salesBreakdown(afterChild);
        record('Q2.afterChildEdit', breakdown);

        const unexpected = OTHER_SALES_SURFACES.filter(
          (k) => afterChild.surfaces[k] !== afterOn.surfaces[k],
        );
        record('Q2.unexpectedlyChangedSalesKeys', unexpected);
        record(
          'Q2.verdict',
          breakdown.indentsGrantedCount === 0 && unexpected.length === 0
            ? 'INDEPENDENT — children revocable while domain stays ON'
            : 'NOT INDEPENDENT — see unexpectedlyChangedSalesKeys',
        );
      }

      // ---- CAPABILITY REFRESH (steps 32-40) ------------------------------
      // Context B has been open and untouched this whole time. Test it in the
      // strictest order: no-reload first, then reload, then (only if needed) a
      // brand-new authentication.
      const withoutReload = await probeAccess(qaPage);
      record('Q3.existingSession.noReload', withoutReload);

      await qaPage.reload().catch((error) => record('Q3.reloadError', String(error)));
      const afterReload = await probeAccess(qaPage);
      record('Q3.existingSession.afterReload', afterReload);

      // Decision tree. `indeterminate` short-circuits to no conclusion — it is never
      // folded into either answer, and the fresh-auth leg is still run for evidence but
      // is NOT allowed to retro-justify a verdict about reload behaviour.
      if (afterReload === 'granted') {
        record('Q3.verdict', 'Reload IS sufficient — existing session picks up the change');
      } else {
        const freshContext = await browser.newContext();
        try {
          const freshPage = await freshContext.newPage();
          await signIn(freshPage, qaCredentials());
          await freshPage.goto('/pulse-loads');
          const fresh = await probeAccess(freshPage);
          record('Q3.freshAuthentication', fresh);

          if (afterReload === 'indeterminate') {
            // The reload observation never produced a signal, so nothing about refresh
            // semantics can be claimed — regardless of what fresh auth shows.
            record(
              'Q3.verdict',
              'INDETERMINATE — the reloaded session produced neither marker; ' +
                'no conclusion about reload vs re-auth. Fresh-auth result recorded as ' +
                'separate evidence only.',
            );
          } else if (fresh === 'granted') {
            record('Q3.verdict', 'Reload is NOT sufficient — fresh authentication required');
          } else if (fresh === 'denied') {
            record(
              'Q3.verdict',
              'Neither reload nor fresh auth granted access — the grant may not be ' +
                'enforced at all. Investigate separately.',
            );
          } else {
            record(
              'Q3.verdict',
              'INDETERMINATE — reload was denied but fresh auth produced no signal; ' +
                'cannot distinguish re-auth requirement from a broken session.',
            );
          }
        } finally {
          await freshContext.close();
        }
      }
    } finally {
      // ---- RESTORE (steps 41-51) ----------------------------------------
      // Deterministic known-safe operation: Sales OFF. Proven by the previous run to
      // revoke all 28 children in storage, not merely hide them.
      if (mutated) {
        try {
          // No cast. If the owner context died (or never opened) there is genuinely no
          // UI to drive, and pretending otherwise via `as BrowserContext` would throw an
          // opaque TypeError instead of naming the actual condition.
          if (!ownerContext) {
            throw new Error(
              'owner context unavailable — cannot drive the UI restore. ' +
                'Ayush may still hold mutated permissions; the DB check below decides.',
            );
          }
          const ownerPage = ownerContext.pages()[0] ?? (await ownerContext.newPage());
          await openMemberPermissions(ownerPage);
          await expandSalesCard(ownerPage);
          await setDomain(ownerPage, false);
          await save(ownerPage);
          await ownerPage
            .screenshot({ path: resolve(EVIDENCE_DIR, 'probe-restore-after-save.png') })
            .catch(() => {});
        } catch (error) {
          // Recorded, never swallowed as success. The DB verification below is the sole
          // arbiter of RESTORED vs BLOCKED, so a failed UI restore still gets checked.
          record('restore.uiError', String(error));
        }

        // Step 54: never declare success from UI state. DB is the only criterion.
        // Step 53: no automatic retry — one restore attempt, then verify, then stop.
        try {
          const restored = await assertAtBaseline('RESTORE', true);
          record('restore.status', 'RESTORED');
          record('restore.md5', restored.md5);
        } catch (error) {
          record('restore.status', 'BLOCKED — NOT RESTORED');
          record('restore.error', String(error));
          flushFindings();
          throw new Error(
            'RESTORE FAILED — Ayush is NOT at baseline. Do not re-run. Do not retry automatically.\n' +
              `Findings written to ${EVIDENCE_DIR}/domain-semantics-findings.json\n${String(error)}`,
          );
        }
      }

      flushFindings();
      await ownerContext?.close();
      await qaContext?.close();
    }
  });
});
