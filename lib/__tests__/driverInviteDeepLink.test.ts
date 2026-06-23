jest.mock('expo-linking', () => ({
  parse: (url: string) => {
    try {
      const u = new URL(url.replace(/^pulse:/, 'https://pulse.app/'));
      const path = u.pathname.replace(/^\/+/, '');
      const token = u.searchParams.get('token');
      return { path, queryParams: token ? { token } : {} };
    } catch {
      return { path: '', queryParams: {} };
    }
  },
  createURL: (path: string, opts?: { queryParams?: Record<string, string> }) => {
    const q = opts?.queryParams?.token ?? '';
    return `pulse://${path}?token=${q}`;
  },
  addEventListener: () => ({ remove: () => {} }),
  getInitialURL: async () => null,
}));

import {
  buildDriverInviteDeepLink,
  parseDriverInviteTokenFromUrl,
} from '@/lib/driverInviteDeepLink.util';

describe('driverInviteDeepLink', () => {
  it('parses token from pulse driver-invite URL', () => {
    const id = '8b042cbd-c3d2-4374-9bd8-490b0ace68eb';
    expect(
      parseDriverInviteTokenFromUrl(`pulse://driver-invite?token=${id}`),
    ).toBe(id);
    expect(
      parseDriverInviteTokenFromUrl(`https://app.example/driver-invite?token=${id}`),
    ).toBe(id);
  });

  it('returns null for unrelated URLs', () => {
    expect(parseDriverInviteTokenFromUrl('pulse://trips/123')).toBeNull();
    expect(parseDriverInviteTokenFromUrl('')).toBeNull();
  });

  it('builds driver-invite deep link with token', () => {
    const link = buildDriverInviteDeepLink('abc-123');
    expect(link).toContain('driver-invite');
    expect(link).toContain('token=abc-123');
  });
});
