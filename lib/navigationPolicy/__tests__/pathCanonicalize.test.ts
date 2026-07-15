import {
  canonicalizePath,
  matchPattern,
  stripExpoGroups,
} from '@/lib/navigationPolicy/pathCanonicalize';

describe('pathCanonicalize', () => {
  it('strips (tabs) so /(tabs)/finance and /finance share a key', () => {
    expect(stripExpoGroups('/(tabs)/finance')).toBe('/finance');
    expect(canonicalizePath('/(tabs)/finance').path).toBe('/finance');
    expect(canonicalizePath('/finance').path).toBe('/finance');
  });

  it('strips (modals) groups', () => {
    expect(stripExpoGroups('/(modals)/add-client')).toBe('/add-client');
  });

  it('preserves (driver) so driver home ≠ boot /', () => {
    expect(stripExpoGroups('/(driver)')).toBe('/(driver)');
    expect(stripExpoGroups('/(driver)/wallet')).toBe('/(driver)/wallet');
    expect(canonicalizePath('/').path).toBe('/');
    expect(canonicalizePath('/(driver)').path).toBe('/(driver)');
  });

  it('drops trailing slash except root', () => {
    expect(stripExpoGroups('/finance/')).toBe('/finance');
    expect(stripExpoGroups('/')).toBe('/');
  });

  it('ignores query and hash', () => {
    expect(canonicalizePath('/trip/123?tab=finance#x').path).toBe('/trip/123');
  });

  it('matchPattern captures :id', () => {
    expect(matchPattern('/trip/abc-1', '/trip/:id')).toEqual({ id: 'abc-1' });
    expect(matchPattern('/trip/abc-1/extra', '/trip/:id')).toBeNull();
    expect(matchPattern('/sign-in', '/sign-in')).toEqual({});
  });
});
