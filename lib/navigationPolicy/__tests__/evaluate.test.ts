import { evaluateNavigationPolicy } from '@/lib/navigationPolicy/evaluate';
import { buildPrincipal } from '@/lib/navigationPolicy/grants';
import { NavigationActor } from '@/lib/navigationPolicy/NavigationActor';
import type { PolicySnapshot } from '@/lib/navigationPolicy/types';
import {
  DRIVER_HOME_PATH,
  SIGN_IN_PATH,
} from '@/lib/navigationPolicy/types';

function snap(
  partial: Partial<PolicySnapshot> & Pick<PolicySnapshot, 'sessionPosture'>,
): PolicySnapshot {
  return {
    principal: null,
    predicates: {},
    platform: 'web',
    ...partial,
  };
}

describe('evaluateNavigationPolicy', () => {
  it('restoring → wait for protected and public paths', () => {
    for (const path of ['/workspace', '/sign-in', '/trips']) {
      const d = evaluateNavigationPolicy({
        rawPathname: path,
        snapshot: snap({ sessionPosture: 'restoring' }),
      });
      expect(d).toEqual({ type: 'wait' });
    }
  });

  it('expired → redirect sign_in', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trips',
      snapshot: snap({ sessionPosture: 'expired' }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe(SIGN_IN_PATH);
      expect(d.replace).toBe(true);
    }
  });

  it('anonymous + public → allow', () => {
    for (const path of ['/sign-in', '/terminal-website', '/']) {
      const d = evaluateNavigationPolicy({
        rawPathname: path,
        snapshot: snap({ sessionPosture: 'anonymous' }),
      });
      expect(d.type).toBe('allow');
    }
  });

  it('anonymous + org → redirect sign_in', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/workspace',
      snapshot: snap({ sessionPosture: 'anonymous' }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe(SIGN_IN_PATH);
      expect(d.reason).toBe('anonymous_protected');
    }
  });

  it('authenticated driver + org path → driver home', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trips',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({ role: 'driver' }),
      }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe(DRIVER_HOME_PATH);
      expect(d.reason).toBe('experience_mismatch_driver');
    }
  });

  it('authenticated org with dispatch → allow /trips', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/(tabs)/trips',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: true,
          asset: false,
        }),
      }),
    });
    expect(d.type).toBe('allow');
    if (d.type === 'allow') {
      expect(d.policyId).toBe('org.trips');
    }
  });

  it('authenticated org without finance grant → soft allow when softDeny', () => {
    const d2 = evaluateNavigationPolicy({
      rawPathname: '/finance',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: false,
          asset: false,
        }),
      }),
    });
    expect(d2.type).toBe('allow');
    if (d2.type === 'allow') {
      expect(d2.soft).toBe(true);
      expect(d2.reason).toBe('grants_soft_deny');
    }
  });

  it('canonical /(tabs)/finance matches org.finance', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/(tabs)/finance',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: true,
          asset: false,
        }),
      }),
    });
    expect(d.type).toBe('allow');
    if (d.type === 'allow') expect(d.policyId).toBe('org.finance');
  });
});

describe('NavigationActor', () => {
  it('does not navigate on allow or wait', () => {
    const calls: { href: string; replace: boolean }[] = [];
    const actor = new NavigationActor((opts) => calls.push(opts));
    expect(actor.apply({ type: 'wait' }).status).toBe('wait');
    expect(
      actor.apply({ type: 'allow', policyId: 'x', reason: 'ok' }).status,
    ).toBe('none');
    expect(calls).toHaveLength(0);
  });

  it('replace-navigates on redirect and prevents loop', () => {
    const calls: { href: string; replace: boolean }[] = [];
    const actor = new NavigationActor((opts) => calls.push(opts));
    const redirect = {
      type: 'redirect' as const,
      to: SIGN_IN_PATH,
      reason: 'test',
      replace: true as const,
    };
    expect(actor.apply(redirect).status).toBe('navigated');
    expect(calls[0]).toEqual({ href: SIGN_IN_PATH, replace: true });
    expect(actor.apply(redirect).status).toBe('loop_prevented');
    expect(calls).toHaveLength(1);
  });
});
