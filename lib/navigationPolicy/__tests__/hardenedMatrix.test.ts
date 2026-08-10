/**
 * Phase 6 — Fail-closed behavior matrix for NavigationPolicy.
 * Navigation ≠ Authorization. RLS remains the data boundary.
 */

import { evaluateNavigationPolicy } from '@/lib/navigationPolicy/evaluate';
import { buildPrincipal } from '@/lib/navigationPolicy/grants';
import type { Decision, PolicySnapshot } from '@/lib/navigationPolicy/types';
import {
  DRIVER_HOME_PATH,
  ORG_HOME_PATH,
  SIGN_IN_PATH,
  TERMINAL_WEBSITE_PATH,
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

function kind(d: Decision): string {
  if (d.type === 'wait') return 'wait';
  if (d.type === 'allow') return 'allow';
  // Strip returnTo query for matrix equality (RFC §5.4 attaches it separately).
  const to = d.to.split('?')[0] ?? d.to;
  return `redirect:${to}`;
}

const orgUser = buildPrincipal({
  role: 'user',
  aggregated: true,
  asset: true,
});
const driver = buildPrincipal({ role: 'driver' });

describe('Phase 6 fail-closed matrix', () => {
  const cases: Array<{
    name: string;
    path: string;
    snapshot: PolicySnapshot;
    expect: string;
  }> = [
    {
      name: 'restoring waits',
      path: '/trips',
      snapshot: snap({ sessionPosture: 'restoring' }),
      expect: 'wait',
    },
    {
      name: 'expired → sign-in',
      path: '/workspace',
      snapshot: snap({ sessionPosture: 'expired' }),
      expect: `redirect:${SIGN_IN_PATH}`,
    },
    {
      name: 'anon boot web → marketing',
      path: '/',
      snapshot: snap({ sessionPosture: 'anonymous', platform: 'web' }),
      expect: `redirect:${TERMINAL_WEBSITE_PATH}`,
    },
    {
      name: 'anon boot ios → sign-in',
      path: '/',
      snapshot: snap({ sessionPosture: 'anonymous', platform: 'ios' }),
      expect: `redirect:${SIGN_IN_PATH}`,
    },
    {
      name: 'anon public stays',
      path: '/sign-in',
      snapshot: snap({ sessionPosture: 'anonymous' }),
      expect: 'allow',
    },
    {
      name: 'anon tabs → sign-in',
      path: '/trips',
      snapshot: snap({ sessionPosture: 'anonymous' }),
      expect: `redirect:${SIGN_IN_PATH}`,
    },
    {
      name: 'anon workspace → sign-in',
      path: '/workspace',
      snapshot: snap({ sessionPosture: 'anonymous' }),
      expect: `redirect:${SIGN_IN_PATH}`,
    },
    {
      name: 'anon trip → sign-in',
      path: '/trip/abc',
      snapshot: snap({ sessionPosture: 'anonymous' }),
      expect: `redirect:${SIGN_IN_PATH}`,
    },
    {
      name: 'anon pulse-loads → sign-in',
      path: '/pulse-loads',
      snapshot: snap({ sessionPosture: 'anonymous' }),
      expect: `redirect:${SIGN_IN_PATH}`,
    },
    {
      name: 'anon driver shell → sign-in',
      path: DRIVER_HOME_PATH,
      snapshot: snap({ sessionPosture: 'anonymous' }),
      expect: `redirect:${SIGN_IN_PATH}`,
    },
    {
      name: 'driver + tabs → driver home',
      path: '/trips',
      snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
      expect: `redirect:${DRIVER_HOME_PATH}`,
    },
    {
      name: 'driver + org stack → driver home',
      path: '/workspace',
      snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
      expect: `redirect:${DRIVER_HOME_PATH}`,
    },
    {
      name: 'driver + trip verification stays (shared)',
      path: '/trip/abc/verification',
      snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
      expect: 'allow',
    },
    {
      name: 'driver + trip expense entry stays (shared)',
      path: '/trip/abc/operations/other',
      snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
      expect: 'allow',
    },
    {
      name: 'driver + pulse-loads → driver home',
      path: '/pulse-loads',
      snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
      expect: `redirect:${DRIVER_HOME_PATH}`,
    },
    {
      name: 'driver home stays',
      path: DRIVER_HOME_PATH,
      snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
      expect: 'allow',
    },
    {
      name: 'org + trips stays',
      path: '/trips',
      snapshot: snap({ sessionPosture: 'authenticated', principal: orgUser }),
      expect: 'allow',
    },
    {
      name: 'org + workspace stays',
      path: '/workspace',
      snapshot: snap({ sessionPosture: 'authenticated', principal: orgUser }),
      expect: 'allow',
    },
    {
      name: 'org + driver shell → trips',
      path: DRIVER_HOME_PATH,
      snapshot: snap({ sessionPosture: 'authenticated', principal: orgUser }),
      expect: `redirect:${ORG_HOME_PATH}`,
    },
  ];

  it.each(cases)('$name', ({ path, snapshot, expect: expected }) => {
    const d = evaluateNavigationPolicy({ rawPathname: path, snapshot });
    expect(kind(d)).toBe(expected);
  });
});
