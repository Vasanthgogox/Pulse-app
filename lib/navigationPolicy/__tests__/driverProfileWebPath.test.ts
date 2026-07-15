import { canonicalizePath } from '@/lib/navigationPolicy/pathCanonicalize';
import { evaluateNavigationPolicy } from '@/lib/navigationPolicy/evaluate';
import { buildPrincipal } from '@/lib/navigationPolicy/grants';
import { findMatchingPolicy } from '@/lib/navigationPolicy/registry';
import { DRIVER_HOME_PATH } from '@/lib/navigationPolicy/types';

describe('driver profile web path (group-stripped)', () => {
  const driver = buildPrincipal({ role: 'driver' });

  it('usePathname /profile for driver must not bounce to driver home', () => {
    const raw = '/profile';
    const matched = findMatchingPolicy(canonicalizePath(raw).path);
    // Today may match org.profile — decision must still allow for drivers
    const d = evaluateNavigationPolicy({
      rawPathname: raw,
      snapshot: {
        sessionPosture: 'authenticated',
        principal: driver,
        predicates: {},
        platform: 'web',
      },
    });
    expect(d.type).toBe('allow');
    if (d.type === 'redirect') {
      expect(d.to).not.toBe(DRIVER_HOME_PATH);
    }
  });

  it('/(driver)/profile still allows', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/(driver)/profile',
      snapshot: {
        sessionPosture: 'authenticated',
        principal: driver,
        predicates: {},
        platform: 'web',
      },
    });
    expect(d.type).toBe('allow');
  });

  it('org /profile still allows org users', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/profile',
      snapshot: {
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: true,
          asset: false,
        }),
        predicates: {},
        platform: 'web',
      },
    });
    expect(d.type).toBe('allow');
  });

  it('driver stripped /wallet and /settings allow', () => {
    for (const path of ['/wallet', '/settings', '/documents']) {
      const d = evaluateNavigationPolicy({
        rawPathname: path,
        snapshot: {
          sessionPosture: 'authenticated',
          principal: driver,
          predicates: {},
          platform: 'web',
        },
      });
      expect(d.type).toBe('allow');
    }
  });

  it('driver /trips still bounces to driver home', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trips',
      snapshot: {
        sessionPosture: 'authenticated',
        principal: driver,
        predicates: {},
        platform: 'web',
      },
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe(DRIVER_HOME_PATH);
    }
  });
});
