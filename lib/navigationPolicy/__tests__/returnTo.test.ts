import {
  buildSignInHrefWithReturnTo,
  sanitizeReturnTo,
} from '@/lib/navigationPolicy/returnTo';
import { SIGN_IN_PATH } from '@/lib/navigationPolicy/types';

describe('returnTo (§5.4)', () => {
  it('sanitizes relative app paths', () => {
    expect(sanitizeReturnTo('/finance')).toBe('/finance');
    expect(sanitizeReturnTo('/(tabs)/trips')).toBe('/trips');
  });

  it('rejects absolute / protocol-relative / open redirects', () => {
    expect(sanitizeReturnTo('https://evil.example/x')).toBeNull();
    expect(sanitizeReturnTo('//evil.example')).toBeNull();
    expect(sanitizeReturnTo('\\evil')).toBeNull();
  });

  it('rejects public auth destinations as returnTo', () => {
    expect(sanitizeReturnTo('/sign-in')).toBeNull();
    expect(sanitizeReturnTo('/auth/callback')).toBeNull();
  });

  it('builds sign-in href with encoded returnTo', () => {
    expect(buildSignInHrefWithReturnTo('/workspace')).toBe(
      `${SIGN_IN_PATH}?returnTo=${encodeURIComponent('/workspace')}`,
    );
  });
});
