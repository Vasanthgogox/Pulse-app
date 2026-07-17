import {
  __resetRegistryCacheForTests,
  buildRegistryCoverageReport,
  findMatchingPolicy,
  findUnmappedRoutes,
  getRegistry,
  ROUTE_INVENTORY,
} from '@/lib/navigationPolicy/registry';
import { canonicalizePath } from '@/lib/navigationPolicy/pathCanonicalize';

describe('Phase 2 registry coverage', () => {
  beforeEach(() => {
    __resetRegistryCacheForTests();
  });

  it('accounts for every routable page (unmapped = 0)', () => {
    const report = buildRegistryCoverageReport();
    if (report.unmapped.length > 0) {
       
      console.error('Unmapped routes:', report.unmapped);
    }
    expect(report.inventoryCount).toBeGreaterThan(100);
    expect(report.unmapped).toEqual([]);
    expect(report.mappedCount).toBe(report.inventoryCount);
  });

  it('matches each inventory samplePath to a policy', () => {
    for (const entry of ROUTE_INVENTORY) {
      const { path } = canonicalizePath(entry.samplePath);
      const matched = findMatchingPolicy(path);
      expect(matched).not.toBeNull();
    }
  });

  it('findUnmappedRoutes returns empty for default inventory', () => {
    expect(findUnmappedRoutes()).toEqual([]);
  });

  it('registry includes driver, org, and public policies', () => {
    const ids = new Set(getRegistry().map((p) => p.id));
    expect(ids.has('public.sign-in')).toBe(true);
    expect(ids.has('driver.home')).toBe(true);
    expect(ids.has('org.trips')).toBe(true);
    expect(ids.has('alias.account')).toBe(true);
  });
});
