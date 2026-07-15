import { buildPrincipal } from '@/lib/navigationPolicy/grants';
import {
  type ParityCase,
  runParityMatrix,
} from '@/lib/navigationPolicy/parityCompare';
import type { PolicySnapshot } from '@/lib/navigationPolicy/types';
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

const orgUser = buildPrincipal({
  role: 'user',
  aggregated: true,
  asset: true,
});
const driver = buildPrincipal({ role: 'driver' });

const CASES: ParityCase[] = [
  // restoring / expired
  {
    name: 'restoring any',
    pathname: '/trips',
    snapshot: snap({ sessionPosture: 'restoring' }),
  },
  {
    name: 'expired → sign-in',
    pathname: '/workspace',
    snapshot: snap({ sessionPosture: 'expired' }),
  },

  // anonymous boot
  {
    name: 'anon boot web',
    pathname: '/',
    snapshot: snap({ sessionPosture: 'anonymous', platform: 'web' }),
  },
  {
    name: 'anon boot ios',
    pathname: '/',
    snapshot: snap({ sessionPosture: 'anonymous', platform: 'ios' }),
  },

  // anonymous public
  {
    name: 'anon sign-in',
    pathname: '/sign-in',
    snapshot: snap({ sessionPosture: 'anonymous' }),
  },
  {
    name: 'anon marketing',
    pathname: TERMINAL_WEBSITE_PATH,
    snapshot: snap({ sessionPosture: 'anonymous' }),
  },

  // anonymous gated layouts
  {
    name: 'anon tabs',
    pathname: '/trips',
    snapshot: snap({ sessionPosture: 'anonymous' }),
  },
  {
    name: 'anon finance tab',
    pathname: '/finance',
    snapshot: snap({ sessionPosture: 'anonymous' }),
  },
  {
    name: 'anon driver shell',
    pathname: DRIVER_HOME_PATH,
    snapshot: snap({ sessionPosture: 'anonymous' }),
  },
  {
    name: 'anon pulse-loads',
    pathname: '/pulse-loads',
    snapshot: snap({ sessionPosture: 'anonymous' }),
  },

  // anonymous trip root web vs native
  {
    name: 'anon trip web',
    pathname: '/trip/abc',
    snapshot: snap({ sessionPosture: 'anonymous', platform: 'web' }),
  },
  {
    name: 'anon trip ios',
    pathname: '/trip/abc',
    snapshot: snap({ sessionPosture: 'anonymous', platform: 'ios' }),
  },

  // anonymous ungated stack
  {
    name: 'anon workspace',
    pathname: '/workspace',
    snapshot: snap({ sessionPosture: 'anonymous' }),
  },
  {
    name: 'anon create-indent',
    pathname: '/create-indent',
    snapshot: snap({ sessionPosture: 'anonymous' }),
  },

  // driver authenticated
  {
    name: 'driver + tabs bounce',
    pathname: '/trips',
    snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
  },
  {
    name: 'driver + driver home',
    pathname: DRIVER_HOME_PATH,
    snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
  },
  {
    name: 'driver + org stack open',
    pathname: '/workspace',
    snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
  },
  {
    name: 'driver + pulse-loads open',
    pathname: '/pulse-loads',
    snapshot: snap({ sessionPosture: 'authenticated', principal: driver }),
  },

  // org authenticated
  {
    name: 'org + trips',
    pathname: '/trips',
    snapshot: snap({ sessionPosture: 'authenticated', principal: orgUser }),
  },
  {
    name: 'org + driver shell bounce',
    pathname: DRIVER_HOME_PATH,
    snapshot: snap({ sessionPosture: 'authenticated', principal: orgUser }),
  },
  {
    name: 'org + workspace',
    pathname: '/workspace',
    snapshot: snap({ sessionPosture: 'authenticated', principal: orgUser }),
  },
  {
    name: 'org + finance soft (no grant)',
    pathname: '/finance',
    snapshot: snap({
      sessionPosture: 'authenticated',
      principal: buildPrincipal({
        role: 'user',
        aggregated: false,
        asset: false,
      }),
    }),
  },
];

describe('Phase 4 parity matrix', () => {
  it('policy vs legacy: 0 mismatches', () => {
    const { total, mismatches } = runParityMatrix(CASES);
    expect(total).toBe(CASES.length);
    if (mismatches.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        'parity mismatches',
        JSON.stringify(mismatches, null, 2),
      );
    }
    expect(mismatches).toEqual([]);
  });

  it('spot-check redirect targets', () => {
    const { mismatches } = runParityMatrix([
      {
        name: 'anon boot web target',
        pathname: '/',
        snapshot: snap({ sessionPosture: 'anonymous', platform: 'web' }),
      },
    ]);
    expect(mismatches).toEqual([]);
    // sanity: both agree on marketing
    expect(TERMINAL_WEBSITE_PATH).toBe('/terminal-website');
    expect(ORG_HOME_PATH).toBe('/trips');
    expect(SIGN_IN_PATH).toBe('/sign-in');
  });
});
