import { by, device, element, expect as detoxExpect, waitFor } from 'detox';

/**
 * Detox E2E (native, iOS Simulator) — Finance tab smoke + record-a-payment flow.
 *
 * INFRASTRUCTURE GAP (flagging, not silently working around it): docs/DETOX_E2E.md documents
 * this exact pattern (an `e2e/addDriver.e2e.ts`, `detox.config.js`, and `e2e/jest.config.js`),
 * but none of those three files currently exist in the repo — `npm run test:e2e` has nothing
 * to build/run against today. This file follows the documented shape and testID conventions
 * (`finance-tab-screen` is confirmed live in FinanceScreen.tsx:1712; the others below are
 * documented in DETOX_E2E.md for the sibling Add Driver flow but not verified here) so it's
 * ready to run once `detox.config.js` + `e2e/jest.config.js` are restored — but it has NOT
 * been executed, since there's no iOS Simulator / native build available in this sandbox.
 */

describe('Finance tab (native)', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('shows the Finance tab root screen', async () => {
    await waitFor(element(by.id('finance-tab-screen')))
      .toBeVisible()
      .withTimeout(15000);
    await detoxExpect(element(by.id('finance-tab-screen'))).toBeVisible();
  });

  it('opening the ledger-sync entry chooser and cancelling returns to the Finance tab intact', async () => {
    await waitFor(element(by.id('finance-tab-screen'))).toBeVisible().withTimeout(15000);

    // See features/finance/ledger/tripLedgerEntryChooser.ts — "Add transaction" opens a
    // native Alert with Client/Supplier/Vehicle/Driver options plus Cancel.
    const addTransaction = element(by.text('Add transaction'));
    await waitFor(addTransaction).toBeVisible().withTimeout(10000);
    await addTransaction.tap();

    await waitFor(element(by.text('Cancel'))).toBeVisible().withTimeout(5000);
    await element(by.text('Cancel')).tap();

    // Regression guard: dismissing the chooser must not leave the Finance tab in a
    // broken/blank state.
    await detoxExpect(element(by.id('finance-tab-screen'))).toBeVisible();
  });
});
