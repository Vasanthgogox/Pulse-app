/**
 * Regression guard for GX-PULSE-T.
 *
 * A single deploy can strand more than one lazy chunk: the user reloads onto the
 * fresh entry, then navigates to a route whose chunk was requested against the
 * old cached bundle. The recovery guard used to be one-shot per session, so that
 * second stale chunk was never recovered — it fell through AppErrorBoundary and
 * landed in Sentry as an actionable render error.
 *
 * These tests pin the budget behaviour: several recoveries per session, but not
 * an unbounded reload loop.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { recoverStaleWebDeploy } from '@/lib/webDeployRecovery';

const HREF = 'https://gx-pulse.netlify.app/trips';

function installDom(): { replace: jest.Mock } {
  const store = new Map<string, string>();
  const replace = jest.fn();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: HREF, replace } },
  });
  return { replace };
}

describe('recoverStaleWebDeploy reload budget', () => {
  let nowSpy: jest.SpyInstance<number, []>;
  let clock = 1_000_000;

  beforeEach(() => {
    clock = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('recovers a second stale chunk later in the same session (GX-PULSE-T)', () => {
    const { replace } = installDom();

    expect(recoverStaleWebDeploy()).toBe(true);

    // User lands on the fresh entry, browses, then hits another stranded chunk.
    clock += 60_000;
    expect(recoverStaleWebDeploy()).toBe(true);
    expect(replace).toHaveBeenCalledTimes(2);
  });

  it('does not reload twice in quick succession (loop guard)', () => {
    const { replace } = installDom();

    expect(recoverStaleWebDeploy()).toBe(true);
    clock += 500;
    expect(recoverStaleWebDeploy()).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('stops after the per-session budget is spent', () => {
    const { replace } = installDom();

    for (let i = 0; i < 3; i += 1) {
      expect(recoverStaleWebDeploy()).toBe(true);
      clock += 60_000;
    }
    // Budget exhausted — the chunk is genuinely missing, let it surface.
    expect(recoverStaleWebDeploy()).toBe(false);
    expect(replace).toHaveBeenCalledTimes(3);
  });

  it('cache-busts the URL it reloads', () => {
    const { replace } = installDom();

    recoverStaleWebDeploy();
    expect(String(replace.mock.calls[0][0])).toContain('_cb=');
  });
});
