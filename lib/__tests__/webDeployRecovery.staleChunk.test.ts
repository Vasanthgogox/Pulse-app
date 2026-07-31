/**
 * Regression guard for GX-PULSE-Y.
 *
 * The AppErrorBoundary decides whether a crash is a stale-Netlify-chunk failure
 * (reload and recover) or a real bug (report to Sentry) via
 * `isStaleWebChunkError`. That matcher was missing Metro's own async-require
 * failure shape, so a routine post-deploy chunk miss surfaced to users as a
 * crash screen and to Sentry as a render error.
 *
 * The patterns must also stay in sync with the pre-main copy in
 * polyfills/webChunkRecovery.js, which catches these before React mounts.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { isStaleWebChunkError } from '@/lib/webDeployRecovery';

const CHUNK_URL =
  'https://gx-pulse.netlify.app/_expo/static/js/web/DriverProfileScreen-44737d1a16d5185690ad24f981c2d24b.js';

describe('isStaleWebChunkError', () => {
  it('matches the AsyncRequireError that reached Sentry as GX-PULSE-Y', () => {
    const error = new Error(
      `Loading module ${CHUNK_URL} failed.\n(error: ${CHUNK_URL})`,
    );
    error.name = 'AsyncRequireError';
    expect(isStaleWebChunkError(error)).toBe(true);
  });

  it('matches on name alone, since AsyncRequireError carries only a URL in message', () => {
    const error = new Error(CHUNK_URL);
    error.name = 'AsyncRequireError';
    expect(isStaleWebChunkError(error)).toBe(true);
  });

  it('matches "Loading module ... failed" even without the name', () => {
    expect(
      isStaleWebChunkError(new Error(`Loading module ${CHUNK_URL} failed.`)),
    ).toBe(true);
  });

  it.each([
    'Requiring unknown module "1234"',
    "Unexpected token '<'",
    'Loading chunk vendors-abc123 failed',
    'Failed to fetch dynamically imported module: /a.js',
    'error loading dynamically imported module',
    'Importing a module script failed',
  ])('still matches the previously covered pattern: %s', (message) => {
    expect(isStaleWebChunkError(new Error(message))).toBe(true);
  });

  it('does not swallow genuine application errors', () => {
    expect(
      isStaleWebChunkError(
        new TypeError("Cannot read properties of undefined (reading 'id')"),
      ),
    ).toBe(false);
    expect(isStaleWebChunkError(new Error('column x does not exist'))).toBe(
      false,
    );
  });
});
