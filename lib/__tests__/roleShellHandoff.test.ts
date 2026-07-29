/**
 * Role-shell handoff invariants.
 *
 * Both route groups define overlapping routes (e.g. /profile) and each gates on
 * role. Historically a resolved-but-wrong-role user fell into a splash branch
 * with no redirect, hanging the app on "Loading..." forever:
 *   - user  in app/(driver)/_layout.tsx  -> gate true, splash, no exit
 *   - driver in app/(tabs)/_layout.tsx   -> gate true, splash, no exit
 *
 * Each layout now hands off to the other shell instead. These tests mirror that
 * branch logic to pin two properties:
 *   1. a resolved wrong-role user always redirects (never gates)
 *   2. the two redirects cannot ping-pong
 */

type Role = 'user' | 'driver';

interface AuthSnapshot {
  loading: boolean;
  hasUser: boolean;
  role: Role | null;
  fontsReady?: boolean;
}

type Decision = 'splash' | 'redirect' | 'render';

/** Mirrors the branch order in app/(driver)/_layout.tsx. */
function driverShell(s: AuthSnapshot): Decision {
  const fontsReady = s.fontsReady ?? true;
  const wrongRole = !s.loading && s.hasUser && s.role != null && s.role !== 'driver';
  const gate = !wrongRole && (!fontsReady || s.loading || !s.hasUser || s.role !== 'driver');
  if (wrongRole) return 'redirect';
  if (gate) return 'splash';
  return 'render';
}

/** Mirrors the branch order in app/(tabs)/_layout.tsx (unlocked=false first paint). */
function businessShell(s: AuthSnapshot, unlocked = false): Decision {
  const nowUnlocked = unlocked || (!s.loading && s.hasUser && s.role != null && s.role !== 'driver');
  const wrongRole = !nowUnlocked && !s.loading && s.hasUser && s.role === 'driver';
  if (wrongRole) return 'redirect';
  if (!nowUnlocked && (s.loading || !s.hasUser || s.role == null)) return 'splash';
  return 'render';
}

const resolved = (role: Role): AuthSnapshot => ({ loading: false, hasUser: true, role });

describe('driver shell', () => {
  it('renders for a driver', () => {
    expect(driverShell(resolved('driver'))).toBe('render');
  });

  // The reported hang: driver -> logout -> login as user on /profile.
  it('redirects a resolved user out instead of hanging on a splash', () => {
    expect(driverShell(resolved('user'))).toBe('redirect');
  });

  it('still shows a splash for genuine waiting states', () => {
    expect(driverShell({ loading: true, hasUser: true, role: null })).toBe('splash');
    expect(driverShell({ loading: false, hasUser: false, role: null })).toBe('splash');
    expect(driverShell({ ...resolved('driver'), fontsReady: false })).toBe('splash');
  });

  it('never gates a resolved user on missing fonts — redirect wins', () => {
    expect(driverShell({ ...resolved('user'), fontsReady: false })).toBe('redirect');
  });
});

describe('business shell', () => {
  it('renders for a user', () => {
    expect(businessShell(resolved('user'))).toBe('render');
  });

  // The /finance case: business-only route, no driver equivalent.
  it('redirects a resolved driver out instead of hanging on a splash', () => {
    expect(businessShell(resolved('driver'))).toBe('redirect');
  });

  it('still shows a splash for genuine waiting states', () => {
    expect(businessShell({ loading: true, hasUser: true, role: null })).toBe('splash');
    expect(businessShell({ loading: false, hasUser: false, role: null })).toBe('splash');
  });

  it('keeps rendering once unlocked, even if role churns mid-session', () => {
    expect(businessShell({ loading: true, hasUser: true, role: null }, true)).toBe('render');
  });
});

describe('handoff safety', () => {
  it('never both-redirect for the same auth state (no ping-pong)', () => {
    for (const role of ['user', 'driver'] as Role[]) {
      const s = resolved(role);
      const both = driverShell(s) === 'redirect' && businessShell(s) === 'redirect';
      expect(both).toBe(false);
    }
  });

  it('for any resolved role, exactly one shell renders and the other redirects', () => {
    for (const role of ['user', 'driver'] as Role[]) {
      const s = resolved(role);
      expect([driverShell(s), businessShell(s)].sort()).toEqual(['redirect', 'render']);
    }
  });

  it('no resolved role produces a terminal splash in either shell', () => {
    for (const role of ['user', 'driver'] as Role[]) {
      const s = resolved(role);
      expect(driverShell(s)).not.toBe('splash');
      expect(businessShell(s)).not.toBe('splash');
    }
  });
});
