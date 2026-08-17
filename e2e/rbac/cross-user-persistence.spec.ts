import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { qaCredentials, signIn } from '../support/auth';

/**
 * E2E: cross-user permission persistence AND enforcement.
 *
 * WHY THIS EXISTS — the gap member-permissions.spec.ts cannot close.
 * That suite drives one browser as the OWNER and asserts against the permissions
 * editor. It proves a checkbox renders and flips. It cannot prove that saving it
 * changes what the affected member may actually DO: it never saves, and it never
 * opens the member's own session. A grant that persists correctly but is ignored
 * by the runtime guard would pass every test there.
 *
 * So this spec runs TWO contexts:
 *   Context A = org owner (E2E_EMAIL)        — edits and saves permissions
 *   Context B = the QA member (E2E_QA_EMAIL) — proves actual reachability
 *
 * SUBJECT UNDER TEST — `tripops.pulse_loads`, reached at /pulse-loads.
 * Chosen deliberately over the indent detail screen: it is route-level guarded in
 * app/pulse-loads/index.tsx, needs no pre-existing indent row, and renders a literal
 * denial string when ungranted. That gives an unambiguous allowed/denied signal
 * instead of inferring access from a nav item's presence.
 *
 * Despite the `tripops.` id prefix these surfaces sit in the SALES domain —
 * lib/memberSurfaces.ts declares `domain: "sales"` for all nine indent surfaces,
 * pinned by lib/__tests__/rbac.memberAccess.test.ts. The prefix is a legacy id from
 * before the Operations→Sales move and carries no runtime meaning. Hence the domain
 * switch this spec enables is "Sales / Network", not Operations.
 *
 * STATE WARNING — THIS SPEC WRITES.
 * Unlike member-permissions.spec.ts (which cancels), this one clicks Save. It mutates
 * E2E_MEMBER_ID's real permissions. Restoration runs in finally{} and is verified, not
 * assumed. Baseline for the authorised subject is captured in e2e/.qa/ with an md5 of
 * the persisted permissions object so restoration can be checked byte-for-byte.
 */

const QA_MEMBER_ID = process.env.E2E_MEMBER_ID;

/** The two controls under test, as rendered in the Sales / Network card. */
const DOMAIN_SWITCH = 'Sales / Network domain';
const LOADS_HUB_SURFACE = 'Pulse loads hub';

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

const DENIED_TEXT = "You don't have access to Pulse loads.";

type AccessResult = 'granted' | 'denied';

async function openMemberPermissions(page: Page): Promise<void> {
  await page.goto(`/member-permissions?memberId=${QA_MEMBER_ID}`);
  // The awarded-indent interrupt also fires on the owner's session and sits over
  // the panel footer — clear it before anything tries to click Save.
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

function checkbox(page: Page, label: string): Locator {
  return page.getByLabel(label, { exact: true }).first();
}

/**
 * Surface checkboxes expose no usable aria-checked (React Native Web drives the DOM
 * *property*, never writing the attribute). Ticked state is the rendered check icon.
 * Domain SWITCHES are real <input type="checkbox"> and do support isChecked().
 */
async function isSurfaceChecked(box: Locator): Promise<boolean> {
  return (await box.locator('svg').count()) > 0;
}

async function setDomain(page: Page, on: boolean): Promise<void> {
  const toggle = page.getByLabel(DOMAIN_SWITCH, { exact: true }).first();
  await toggle.waitFor({ state: 'visible', timeout: 30_000 });
  if ((await toggle.isChecked()) !== on) {
    await toggle.click();
    if (on) await expect(toggle).toBeChecked({ timeout: 30_000 });
    else await expect(toggle).not.toBeChecked({ timeout: 30_000 });
  }
}

/**
 * Tick/untick one surface.
 *
 * Asserts the row is ENABLED before clicking. DomainPermissionToggleRow.tsx wires
 * `onPress={disabled ? undefined : onPress}`, so a click on a disabled row is a
 * silent no-op — no error, no state change. The first run of this spec lost ~9
 * minutes to exactly that: the Sales domain switch had not landed, every surface
 * was still disabled, the clicks did nothing, `dirty` never became true and Save
 * stayed greyed out until the test timed out. Failing loudly here names the cause
 * instead of surfacing it as an unexplained disabled button much later.
 */
async function setSurface(page: Page, label: string, on: boolean): Promise<void> {
  const box = checkbox(page, label);
  await box.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(box, `${label} is disabled — its domain switch is off`).not.toHaveAttribute(
    'aria-disabled',
    'true',
    { timeout: 30_000 },
  );
  if ((await isSurfaceChecked(box)) !== on) {
    await box.click();
    await expect
      .poll(() => isSurfaceChecked(box), { timeout: 30_000, message: `${label} → ${on}` })
      .toBe(on);
  }
}

/**
 * Save and wait for the write to actually land.
 *
 * The button re-enabling is the signal the mutation settled — polling the editor's
 * own controls rather than sleeping. A fixed wait here would race the round-trip on
 * a cold bundle and report a false pass.
 */
/**
 * Save and wait for the write to land.
 *
 * Clicks the pressable ancestor, not the "Save changes" text node. The panel renders
 * the label as a plain <div> inside a Pressable that carries the disabled state
 * (`disabled={busy || !dirty}`, MemberPermissionsPanel.tsx:920) — clicking the text
 * itself makes Playwright evaluate enabled-ness on an element that never carries it.
 *
 * Waiting for enabled BEFORE the click is the real guard: the button is disabled
 * whenever nothing changed, so if the preceding edits silently no-opped this fails
 * here with a clear message rather than hanging on a click that can never dispatch.
 * After the click, `busy` flips during the round-trip and clears when it settles —
 * so re-enabling (or the button leaving the dirty state) is the completion signal.
 */
async function save(page: Page): Promise<'saved' | 'nothing-to-save'> {
  // The awarded-indent interrupt can raise itself between opening the panel and
  // saving; if it is up, the click lands on the overlay and the panel never settles.
  await dismissBlockingModal(page);
  const label = page.getByText('Save changes', { exact: true }).first();
  await expect(label).toBeVisible({ timeout: 30_000 });

  const button = page.locator('[role="button"]', { has: label }).first();
  const target = (await button.count()) ? button : label;

  // A disabled button here means the panel is not dirty. During the GRANT/REVOKE
  // legs that is a real failure (the edits silently no-opped). During RESTORE it is
  // the expected, correct outcome — the state already matches the baseline, so there
  // is nothing to write. Distinguishing the two is the caller's job; returning the
  // reason lets restore treat "clean" as success instead of hanging on a click that
  // can never dispatch. The previous version waited for a disabled→disabled
  // transition that by definition never fires, which is what timed out at 60s.
  if (await target.isDisabled().catch(() => false)) {
    return 'nothing-to-save';
  }

  await target.click();

  // A successful save NAVIGATES AWAY: handleSave() ends with onBack()
  // (MemberPermissionsPanel.tsx:412) after the write resolves and the workspace
  // refetches. So the completion signal is the panel LEAVING, not the button
  // returning to disabled — waiting for disabled is waiting for an element that
  // has already been unmounted, which is what timed out at 60s in runs 3 and 4.
  //
  // An inline error (e.g. the not-owner guard) keeps the panel mounted, so treat
  // a still-visible footer as a failed save and surface the message.
  const failed = await Promise.race([
    label
      .waitFor({ state: 'detached', timeout: 60_000 })
      .then(() => false)
      .catch(() => true),
  ]);

  if (failed) {
    const inlineError = await page
      .getByText(/Only the organization owner|error|failed/i)
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `save did not complete — the panel never closed${
        inlineError ? ` (page said: "${inlineError.trim()}")` : ''
      }`,
    );
  }
  return 'saved';
}

/** Save during GRANT/REVOKE, where a non-dirty panel means the edits did not land. */
async function saveExpectingChanges(page: Page, what: string): Promise<void> {
  const result = await save(page);
  expect(result, `${what}: Save was disabled — the edits never registered as changes`).toBe('saved');
}

/**
 * The real question: can the QA member reach /pulse-loads?
 *
 * Waits out the `accessLoading` state first. app/pulse-loads/index.tsx renders a
 * "preparing" screen while surfaces hydrate, and reading the verdict during that
 * window would report a spurious denial for a member who is in fact permitted.
 */
/**
 * Both accounts in this org carry live awarded indents, so the app raises a
 * full-screen "ACTION REQUIRED — Trip awarded to you" interrupt
 * (AwardedIndentDeployModal.tsx) on load. It covers the page: on the QA side it
 * would make a permitted member look denied; on the OWNER side it sits over the
 * Save button, which is what left Save clicked-but-never-settled in run 3.
 *
 * The header reads "1/3" — awards are queued, so one dismissal is not enough;
 * each "Later" advances to the next. Target the accessibilityLabel (the visible
 * <Text> is a separate node inside the pressable) and loop until the interrupt is
 * gone or the queue is exhausted.
 *
 * "Later" is a snooze (awardedDeploySnooze.util.ts). It accepts nothing, assigns
 * nothing, and changes no trip or permission state — it only defers the prompt.
 */
async function dismissBlockingModal(page: Page): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    const later = page.getByLabel('Later', { exact: true }).first();
    if (!(await later.isVisible().catch(() => false))) return;
    await later.click({ timeout: 10_000 }).catch(() => {});
    // Either the next queued award renders or the interrupt closes; both resolve
    // by the button's visibility changing, so poll that rather than sleeping.
    await expect
      .poll(async () => later.isVisible().catch(() => false), { timeout: 15_000 })
      .toBe(false)
      .catch(() => {});
  }
}

async function probeLoadsHub(page: Page): Promise<AccessResult> {
  await dismissBlockingModal(page);
  await page.goto('/pulse-loads');
  await dismissBlockingModal(page);
  const denied = page.getByText(DENIED_TEXT, { exact: false }).first();
  const hub = page.getByText(/Load Center|Create indent|Pulse loads/i).first();

  await expect
    .poll(
      async () => {
        if (await denied.isVisible().catch(() => false)) return 'denied';
        if (await hub.isVisible().catch(() => false)) return 'granted';
        return 'pending';
      },
      { timeout: 60_000, message: 'waiting for /pulse-loads to resolve access' },
    )
    .not.toBe('pending');

  return (await denied.isVisible().catch(() => false)) ? 'denied' : 'granted';
}

test.describe('Cross-user permission persistence and enforcement', () => {
  test.skip(!QA_MEMBER_ID, 'set E2E_MEMBER_ID to the authorised disposable QA member');

  test('granting and revoking Pulse loads changes the QA member’s real access', async ({
    browser,
  }) => {
    test.setTimeout(600_000);

    let ownerCtx: BrowserContext | undefined;
    let qaCtx: BrowserContext | undefined;

    // Captured before the first mutation; restoration targets these exact values.
    let originalDomain: boolean | undefined;
    let originalSurface: boolean | undefined;
    let ownerPage: Page | undefined;

    try {
      ownerCtx = await browser.newContext();
      qaCtx = await browser.newContext();
      ownerPage = await ownerCtx.newPage();
      const qaPage = await qaCtx.newPage();

      // --- Context A: owner opens the editor -------------------------------
      await signIn(ownerPage);
      await openMemberPermissions(ownerPage);
      await expandSalesCard(ownerPage);

      const domainToggle = ownerPage.getByLabel(DOMAIN_SWITCH, { exact: true }).first();
      await domainToggle.waitFor({ state: 'visible', timeout: 30_000 });
      originalDomain = await domainToggle.isChecked();
      originalSurface = await isSurfaceChecked(checkbox(ownerPage, LOADS_HUB_SURFACE));

      // eslint-disable-next-line no-console
      console.log(`[baseline] domain=${originalDomain} surface=${originalSurface}`);

      // --- Context B: QA member's access BEFORE any change -----------------
      await signIn(qaPage, qaCredentials());
      const before = await probeLoadsHub(qaPage);
      // eslint-disable-next-line no-console
      console.log(`[probe] before mutation: ${before}`);

      // --- GRANT -----------------------------------------------------------
      // Domain first: surfaces stay disabled (and their clicks silently no-op)
      // until the Sales switch is on. setSurface() asserts that precondition.
      await setDomain(ownerPage, true);
      await setSurface(ownerPage, LOADS_HUB_SURFACE, true);
      await saveExpectingChanges(ownerPage, 'grant');
      await ownerPage.screenshot({ path: 'e2e/.qa/evidence/xuser-01-owner-granted.png' });

      // PERSISTENCE, proven from the editor rather than assumed from the click:
      // reopen the panel fresh and confirm the grant survived the round-trip.
      // (Enforcement is a separate question, answered by the QA probes below.)
      await openMemberPermissions(ownerPage);
      await expandSalesCard(ownerPage);
      expect(
        await isSurfaceChecked(checkbox(ownerPage, LOADS_HUB_SURFACE)),
        'persistence: the granted surface must still be ticked after reopening',
      ).toBe(true);
      // eslint-disable-next-line no-console
      console.log('[persistence] grant survived panel reopen: YES');

      // Does a plain reload pick the grant up, or is capability state cached for
      // the session's lifetime? Discovered, never assumed — the answer decides
      // whether every later phase needs a fresh login.
      await qaPage.reload();
      const afterReload = await probeLoadsHub(qaPage);
      // eslint-disable-next-line no-console
      console.log(`[probe] after grant + reload: ${afterReload}`);
      await qaPage.screenshot({ path: 'e2e/.qa/evidence/xuser-02-qa-after-reload.png' });

      let reloadSufficient = afterReload === 'granted';
      let afterReauth: AccessResult | undefined;

      if (!reloadSufficient) {
        await qaCtx.clearCookies();
        const freshPage = await qaCtx.newPage();
        await signIn(freshPage, qaCredentials());
        afterReauth = await probeLoadsHub(freshPage);
        // eslint-disable-next-line no-console
        console.log(`[probe] after grant + fresh login: ${afterReauth}`);
        await freshPage.screenshot({ path: 'e2e/.qa/evidence/xuser-03-qa-after-reauth.png' });
        await freshPage.close();
      }

      // eslint-disable-next-line no-console
      console.log(
        `[FINDING] reload sufficient: ${reloadSufficient ? 'YES' : 'NO'} | ` +
          `fresh login required: ${reloadSufficient ? 'NO' : 'YES'}`,
      );

      // Enforcement must have flipped by one route or the other.
      expect(
        reloadSufficient || afterReauth === 'granted',
        'granting Pulse loads must make /pulse-loads reachable for the QA member',
      ).toBe(true);

      // --- REVOKE ----------------------------------------------------------
      // Saving closed the panel (onBack), so reopen before editing again.
      await openMemberPermissions(ownerPage);
      await expandSalesCard(ownerPage);
      await setSurface(ownerPage, LOADS_HUB_SURFACE, false);
      await saveExpectingChanges(ownerPage, 'revoke');
      await ownerPage.screenshot({ path: 'e2e/.qa/evidence/xuser-04-owner-revoked.png' });

      const revokedPage = await qaCtx.newPage();
      if (reloadSufficient) {
        await signIn(revokedPage, qaCredentials());
      } else {
        await qaCtx.clearCookies();
        await signIn(revokedPage, qaCredentials());
      }
      const afterRevoke = await probeLoadsHub(revokedPage);
      // eslint-disable-next-line no-console
      console.log(`[probe] after revoke: ${afterRevoke}`);
      await revokedPage.screenshot({ path: 'e2e/.qa/evidence/xuser-05-qa-denied.png' });

      expect(
        afterRevoke,
        'revoking Pulse loads must deny /pulse-loads by direct navigation',
      ).toBe('denied');
      await revokedPage.close();
    } finally {
      // --- RESTORE ---------------------------------------------------------
      // State-aware: drives back to the captured values rather than clicking the
      // opposite box. Runs even when an assertion above threw.
      if (ownerPage && originalDomain !== undefined && originalSurface !== undefined) {
        try {
          await openMemberPermissions(ownerPage);
          await expandSalesCard(ownerPage);

          // ORDER MATTERS. Surfaces are only editable while their domain switch is
          // on, so the domain must be ON to touch the surface, and is set to its
          // baseline value LAST. Doing it the other way round (domain off first)
          // leaves the surface disabled and unclickable — that is exactly what
          // failed here on run 5, when the panel reopened with Sales already off.
          await setDomain(ownerPage, true);
          await setSurface(ownerPage, LOADS_HUB_SURFACE, originalSurface);
          await setDomain(ownerPage, originalDomain);
          await save(ownerPage);

          await openMemberPermissions(ownerPage);
          await expandSalesCard(ownerPage);
          const domainNow = await ownerPage
            .getByLabel(DOMAIN_SWITCH, { exact: true })
            .first()
            .isChecked();
          const surfaceNow = await isSurfaceChecked(checkbox(ownerPage, LOADS_HUB_SURFACE));
          await ownerPage.screenshot({ path: 'e2e/.qa/evidence/xuser-06-restored.png' });

          // eslint-disable-next-line no-console
          console.log(
            `[restore] domain=${domainNow} (want ${originalDomain}) ` +
              `surface=${surfaceNow} (want ${originalSurface})`,
          );

          if (domainNow !== originalDomain || surfaceNow !== originalSurface) {
            throw new Error(
              `RESTORE FAILED — member ${QA_MEMBER_ID} left at domain=${domainNow} ` +
                `surface=${surfaceNow}; expected domain=${originalDomain} ` +
                `surface=${originalSurface}. Verify against e2e/.qa/ baseline md5.`,
            );
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[restore] FAILED — QA member may not be at baseline:', err);
          throw err;
        }
      }
      await ownerCtx?.close();
      await qaCtx?.close();
    }
  });
});
