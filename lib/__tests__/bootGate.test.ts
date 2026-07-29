import {
  isColdStartResolved,
  nextBootSettled,
  shouldShowBootOverlay,
  type BootGateInput,
} from '@/lib/bootGate';

const base: BootGateInput = {
  restoring: false,
  hasUser: false,
  hasProfile: false,
  authenticated: false,
  publicRoute: false,
  timedOut: false,
};

const input = (over: Partial<BootGateInput> = {}): BootGateInput => ({ ...base, ...over });

/** Drive a sequence of auth states through the latch, as React would. */
function run(steps: BootGateInput[]) {
  let settled = false;
  return steps.map((step) => {
    const resolved = isColdStartResolved(step);
    // shouldShowBootOverlay reads the pre-update latch, matching render order.
    const overlay = shouldShowBootOverlay(settled, resolved);
    settled = nextBootSettled(settled, resolved);
    return { overlay, settled };
  });
}

describe('isColdStartResolved', () => {
  it('blocks while auth is restoring', () => {
    expect(isColdStartResolved(input({ restoring: true }))).toBe(false);
  });

  it('blocks when a session user has no hydrated profile yet', () => {
    expect(isColdStartResolved(input({ hasUser: true }))).toBe(false);
  });

  it('resolves once the profile hydrates', () => {
    expect(isColdStartResolved(input({ hasUser: true, hasProfile: true }))).toBe(true);
  });

  it('resolves for an authenticated user even before profile hydration', () => {
    expect(isColdStartResolved(input({ hasUser: true, authenticated: true }))).toBe(true);
  });

  it('resolves immediately on public auth routes', () => {
    expect(isColdStartResolved(input({ restoring: true, publicRoute: true }))).toBe(true);
  });

  it('resolves on timeout even while still restoring', () => {
    expect(isColdStartResolved(input({ restoring: true, timedOut: true }))).toBe(true);
  });
});

describe('nextBootSettled', () => {
  it('latches on first resolution', () => {
    expect(nextBootSettled(false, true)).toBe(true);
  });

  it('stays false until cold start resolves', () => {
    expect(nextBootSettled(false, false)).toBe(false);
  });

  it('is monotonic — never returns to false once settled', () => {
    expect(nextBootSettled(true, false)).toBe(true);
  });
});

describe('boot gate lifecycle', () => {
  it('shows the overlay during cold start, then hides it', () => {
    const [restoring, ready] = run([
      input({ restoring: true }),
      input({ hasUser: true, hasProfile: true, authenticated: true }),
    ]);
    expect(restoring.overlay).toBe(true);
    expect(ready.overlay).toBe(false);
    expect(ready.settled).toBe(true);
  });

  // The reported bug: driver -> logout -> login as user hung on "Loading...".
  it('never re-shows the overlay on logout then login as a different role', () => {
    const steps = run([
      input({ restoring: true }),                                              // cold start
      input({ hasUser: true, hasProfile: true, authenticated: true }),          // driver in
      input({ restoring: true }),                                              // signing out
      input({}),                                                               // signed out
      input({ restoring: true }),                                              // logging in
      input({ hasUser: true }),                                                // profile pending
      input({ hasUser: true, hasProfile: true, authenticated: true }),          // user in
    ]);

    expect(steps[0].overlay).toBe(true);
    // Everything after the first resolution must stay unblocked.
    for (const step of steps.slice(1)) {
      expect(step.overlay).toBe(false);
    }
  });

  it('does not re-block on a mid-session token refresh', () => {
    const steps = run([
      input({ hasUser: true, hasProfile: true, authenticated: true }),
      input({ restoring: true, hasUser: true }), // refresh in flight
      input({ hasUser: true, hasProfile: true, authenticated: true }),
    ]);
    expect(steps.every((s) => s.overlay === false)).toBe(true);
  });

  it('does not re-block when an expired session drops to a public route', () => {
    const steps = run([
      input({ hasUser: true, hasProfile: true, authenticated: true }),
      input({ restoring: true }),
      input({ publicRoute: true }),
    ]);
    expect(steps.every((s) => s.overlay === false)).toBe(true);
  });
});
