import {
  isPastIndexBootPath,
  resolveWebRefreshHref,
} from '@/lib/indexBootRedirect.util';

describe('isPastIndexBootPath', () => {
  it('treats only boot `/` as the index gate', () => {
    expect(isPastIndexBootPath('/')).toBe(false);
    expect(isPastIndexBootPath('')).toBe(false);
  });

  it('does not steal deep screens on refresh', () => {
    expect(isPastIndexBootPath('/trip/abc')).toBe(true);
    expect(isPastIndexBootPath('/trip/abc/verification')).toBe(true);
    expect(isPastIndexBootPath('/vehicle/abc')).toBe(true);
    expect(isPastIndexBootPath('/trips')).toBe(true);
    expect(isPastIndexBootPath('/finance')).toBe(true);
  });
});

describe('resolveWebRefreshHref', () => {
  it('syncs Index `/` to the browser trip URL so refresh stays on the page', () => {
    expect(resolveWebRefreshHref('/', '/trip/abc', '?tab=docs')).toBe(
      '/trip/abc?tab=docs',
    );
  });

  it('does nothing when Expo is already on the browser path', () => {
    expect(resolveWebRefreshHref('/trip/abc', '/trip/abc', '?tab=docs')).toBeNull();
  });

  it('does nothing on a true `/` boot', () => {
    expect(resolveWebRefreshHref('/', '/', '')).toBeNull();
  });

  it('does not fight when Expo is already on another deep route', () => {
    expect(resolveWebRefreshHref('/trips', '/trip/abc', '')).toBeNull();
  });
});
