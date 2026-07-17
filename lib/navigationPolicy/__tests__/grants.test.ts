import {
  buildGrantSet,
  buildPrincipal,
  grantsSatisfy,
} from '@/lib/navigationPolicy/grants';

describe('grants', () => {
  it('returns empty grants for null profile', () => {
    expect(buildGrantSet(null).size).toBe(0);
    expect(buildPrincipal(null)).toBeNull();
  });

  it('returns empty grants for driver role', () => {
    const grants = buildGrantSet({ role: 'driver' });
    expect(grants.size).toBe(0);
    expect(buildPrincipal({ role: 'driver' })?.role).toBe('driver');
  });

  it('maps aggregated/asset flags via capabilities', () => {
    const agg = buildGrantSet({
      role: 'user',
      aggregated: true,
      asset: false,
    });
    expect(agg.has('dispatch')).toBe(true);
    expect(agg.has('fleet_management')).toBe(false);

    const asset = buildGrantSet({
      role: 'user',
      aggregated: false,
      asset: true,
    });
    expect(asset.has('fleet_management')).toBe(true);
    expect(asset.has('dispatch')).toBe(false);
  });

  it('prefers operatingModel over stale profile flags', () => {
    const asset = buildGrantSet(
      { role: 'user', aggregated: true, asset: true },
      'ASSET_BASED',
    );
    expect(asset.has('fleet_management')).toBe(true);
    expect(asset.has('dispatch')).toBe(false);
  });

  it('grantsSatisfy allOf / anyOf', () => {
    const grants = new Set(['dispatch', 'finance_view']);
    expect(grantsSatisfy(grants, { allOf: ['dispatch'] })).toBe(true);
    expect(grantsSatisfy(grants, { allOf: ['dispatch', 'fleet_management'] })).toBe(
      false,
    );
    expect(grantsSatisfy(grants, { anyOf: ['fleet_management', 'finance_view'] })).toBe(
      true,
    );
    expect(grantsSatisfy(grants, undefined)).toBe(true);
  });
});
