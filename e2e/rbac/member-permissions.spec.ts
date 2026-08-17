import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from '../support/auth';

/**
 * E2E (Playwright / web): member permissions screen.
 *
 * WHY THIS EXISTS
 * lib/__tests__/rbac.memberAccess.test.ts pins the pure resolution logic
 * (org caps ∩ domains ∩ surfaces). What it cannot see is whether the *screen* renders
 * that logic — the Sales-section lock bug fixed earlier was invisible to unit tests but
 * obvious the moment a human looked at the page. These specs cover that gap.
 *
 * Manual guide coverage: TC-21 + 10A (Indents render under Sales and are grantable),
 * TC-10 / TC-20 (one toggle is surgical). NOT covered: TC-01..04 (invite precheck) and
 * TC-14..18 (accept / wrong-person / expiry) — those are Postgres RPCs, not UI.
 *
 * SELECTORS — all verified against the live screen, not inferred:
 *  - Domain cards are titled "Finance", "Sales / Network", "Operations", "Team / Workspace",
 *    "Supply", "Compliance", "Vendor support", "IT dept" — in that DOM order. Note the card
 *    is "Sales / Network", NOT "Sales"; and plain "Finance" also matches the role-preset
 *    button above, so cards are addressed by index via their Show/Hide chip.
 *  - Each card has one chip reading "Show N · M on" / "Hide N · M on".
 *  - Group header checkbox → accessibilityLabel `${group} — all` (e.g. "Indents — all").
 *  - Individual surface  → accessibilityLabel `${surface.label}` (e.g. "Create indent").
 *  - A checkbox exposes NO usable aria-checked. Ticked state = it contains an <svg> check
 *    icon and an accent background; unticked = neither. isChecked() below encodes that.
 *  - Surfaces are disabled (aria-disabled="true") whenever their DOMAIN SWITCH is off —
 *    this is `surfacesEditable` in DomainPermissionToggleRow.tsx, not a capability lock.
 *    Tests must enable the domain before expecting to tick anything inside it.
 *
 * STATE WARNING
 * The toggle specs mutate a real member's permissions and save. Point E2E_MEMBER_ID at a
 * disposable QA member. Each mutating test restores what it changed.
 */

const INDENT_SURFACES = [
  'View indents / pulse loads',
  'Create indent',
  'Edit indent',
  'Cancel indent',
  'Broadcast / share load',
  'Bid on indent',
  'Award bid',
  'Allocate indent',
  'Pulse loads hub',
] as const;

/** DOM order of the domain cards — index is how we disambiguate their Show/Hide chips. */
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
type CardName = (typeof CARDS)[number];

async function openMemberPermissions(page: Page): Promise<void> {
  const memberId = process.env.E2E_MEMBER_ID;
  if (!memberId) {
    test.skip(
      true,
      'set E2E_MEMBER_ID in e2e/.env.e2e to the member whose permissions these specs may modify',
    );
  }
  await page.goto(`/member-permissions?memberId=${memberId}`);
  // "Save changes" is the panel's footer button — a stable signal the panel mounted.
  await page.getByText('Save changes', { exact: true }).first().waitFor({
    state: 'visible',
    timeout: 60_000,
  });
}

/**
 * Expand one domain card so its surfaces render. Idempotent.
 *
 * Waits for the chip to actually read "Hide" rather than sleeping a fixed interval.
 * A flat wait here caused a real false failure: on a cold Expo web bundle the panel
 * had not re-rendered within 1.5s, so the following assertion ran against a
 * half-painted card and reported the group as missing. The chip label is the state
 * this function is trying to change, so it is the correct thing to wait on.
 */
async function expandCard(page: Page, card: CardName): Promise<void> {
  const index = CARDS.indexOf(card);
  const chip = page.getByText(/^(Show|Hide) \d+/).nth(index);
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
 * Ticked state. There is no reliable aria-checked on these controls, so we read the
 * rendered check icon — verified: ticked renders an <svg> on an accent background,
 * unticked renders an empty box.
 */
async function isChecked(box: Locator): Promise<boolean> {
  return (await box.locator('svg').count()) > 0;
}

/**
 * Turn a domain switch on if it is off. Surfaces stay disabled while it is off.
 *
 * Read state with isChecked(), NOT getAttribute('aria-checked'). React Native Web renders
 * this as a real <input type="checkbox"> and drives its state through the DOM *property*;
 * the aria-checked *attribute* is never written, so getAttribute returns null whether the
 * switch is on or off. Playwright's accessibility snapshot still reports [checked]
 * correctly, and isChecked() reads that same property.
 */
async function enableDomain(page: Page, switchLabel: string): Promise<boolean> {
  const toggle = page.getByLabel(switchLabel, { exact: true }).first();
  if (!(await toggle.count())) return false;
  if (!(await toggle.isChecked())) {
    await toggle.click();
    await expect(toggle).toBeChecked({ timeout: 30_000 });
  }
  return true;
}

test.describe('Member permissions — Indents under Sales (TC-21 / 10A)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await openMemberPermissions(page);
  });

  test('the Indents group renders inside the Sales / Network card', async ({ page }) => {
    // Expand ONLY Sales / Network. If Indents shows up here, it is rendering under the
    // Sales domain — which is the entire point of the Operation→Sales move.
    await expandCard(page, 'Sales / Network');

    await expect(
      checkbox(page, 'Indents — all'),
      'Indents group must render under Sales / Network after the domain move',
    ).toBeVisible({ timeout: 15_000 });
  });

  test('every indent surface is present and reachable in the Sales card', async ({ page }) => {
    await expandCard(page, 'Sales / Network');
    await checkbox(page, 'Indents — all').waitFor({ state: 'visible', timeout: 15_000 });

    // The regression this guards: after the move, indents rendered under a permanently
    // locked Sales section for give-load orgs — visible but ungrantable. A surface that
    // is missing entirely (rather than merely unticked) means the org capability check
    // wrongly filtered it out.
    const missing: string[] = [];
    for (const label of INDENT_SURFACES) {
      if ((await checkbox(page, label).count()) === 0) missing.push(label);
    }

    expect(
      missing,
      `these indent surfaces did not render under Sales: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test('enabling the Sales domain makes indent surfaces editable', async ({ page }) => {
    await expandCard(page, 'Sales / Network');
    const groupAll = checkbox(page, 'Indents — all');
    await groupAll.waitFor({ state: 'visible', timeout: 15_000 });

    // Surfaces are disabled while the domain switch is off — that is correct behaviour,
    // not the lock bug. The bug would be: domain ON, surfaces still disabled.
    const enabled = await enableDomain(page, 'Sales / Network domain');
    if (!enabled) {
      test.skip(true, 'Sales / Network domain switch not found — selector needs updating');
    }

    await expect(
      groupAll,
      'with the Sales domain ON, the Indents group must become editable',
    ).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('Member permissions — surgical toggle (TC-10 / TC-20)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await openMemberPermissions(page);
  });

  test('ticking one surface does not change its siblings', async ({ page }) => {
    await expandCard(page, 'Sales / Network');
    await checkbox(page, 'Indents — all').waitFor({ state: 'visible', timeout: 15_000 });

    if (!(await enableDomain(page, 'Sales / Network domain'))) {
      test.skip(true, 'Sales / Network domain switch not found');
    }

    const target = checkbox(page, 'Create indent');
    const sibling = checkbox(page, 'View indents / pulse loads');
    if ((await target.getAttribute('aria-disabled')) === 'true') {
      test.skip(true, 'indent surfaces not editable for this member/org');
    }

    const targetBefore = await isChecked(target);
    const siblingBefore = await isChecked(sibling);

    await target.click();

    // Poll for the CLICKED box to settle into its flipped state. This is the handshake,
    // not the assertion: we need to know the re-render finished before it is meaningful
    // to look at the sibling. Waiting on the sibling instead would be waiting on the very
    // thing under test — it is supposed to NOT change, so there would be no event to
    // wait for and a fixed sleep would silently pass on a slow render.
    await expect
      .poll(() => isChecked(target), {
        message: 'the clicked surface should have flipped',
        timeout: 30_000,
      })
      .toBe(!targetBefore);

    // The invariant: one checkbox must not cascade to peers at the same level.
    // Safe to read now that the re-render above has demonstrably landed.
    expect(
      await isChecked(sibling),
      'a sibling surface must not change when its neighbour is toggled',
    ).toBe(siblingBefore);

    // Restore, and leave without saving so nothing persists.
    await target.click();
    await expect.poll(() => isChecked(target), { timeout: 30_000 }).toBe(targetBefore);
    const cancel = page.getByText('Cancel', { exact: true }).first();
    if (await cancel.count()) await cancel.click();
  });
});

test.describe('Member permissions — smoke', () => {
  test('the permissions screen renders all domain cards without console errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await signIn(page);
    await openMemberPermissions(page);

    // All eight cards should be present; a missing one means a domain stopped rendering.
    const chips = page.getByText(/^(Show|Hide) \d+/);
    await expect(chips).toHaveCount(CARDS.length, { timeout: 30_000 });

    expect(errors, `unexpected console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });
});
