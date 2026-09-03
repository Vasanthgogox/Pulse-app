/**
 * Same-org party guard — service-layer backstop for the self-dealing invariant.
 *
 * Covers the matrix agreed in the investigation: active members blocked across
 * every phone format, former/inactive members still allowed, duplicate phones
 * not falsely rejected, and phone-less members not regressed.
 */
import { normalizePhoneForInviteeLookup } from '@/lib/phoneLookup';

const mockSelect = jest.fn();
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ from: mockFrom }),
}));

import { phoneBelongsToActiveOrgMember } from '@/lib/sameOrgPartyGuard';

const ORG = '5b471ecb-fbfb-470e-95cf-525d789c761a';

/** Mock the `.eq().eq()` chain, returning only ACTIVE members (as the query does). */
function mockActiveMembers(rows: Array<{ phone: string | null }>) {
  mockSelect.mockReturnValue({
    eq: () => ({
      eq: () =>
        Promise.resolve({
          data: rows.map((r) => ({ user_id: 'u', profiles: { phone: r.phone } })),
          error: null,
        }),
    }),
  });
}

function mockError() {
  mockSelect.mockReturnValue({
    eq: () => ({
      eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
    }),
  });
}

beforeEach(() => {
  mockSelect.mockReset();
  mockFrom.mockClear();
});

describe('active same-org member is blocked', () => {
  // Every stored/typed format pair must resolve to one canonical identity.
  const stored = '+919600096556';
  const typedFormats = [
    '9600096556',
    '+919600096556',
    '919600096556',
    '+91 96000 96556',
    '96000-96556',
    '00919600096556',
    '  9600096556  ',
  ];

  it.each(typedFormats)('blocks when typed as %s', async (typed) => {
    mockActiveMembers([{ phone: stored }]);
    await expect(phoneBelongsToActiveOrgMember(ORG, typed)).resolves.toBe(true);
  });

  it('blocks regardless of which format is STORED', async () => {
    for (const storedFmt of typedFormats) {
      mockActiveMembers([{ phone: storedFmt }]);
      await expect(
        phoneBelongsToActiveOrgMember(ORG, '9600096556'),
      ).resolves.toBe(true);
    }
  });
});

describe('legitimate cases are not blocked', () => {
  it('allows an external number that matches no member', async () => {
    mockActiveMembers([{ phone: '+919600096556' }]);
    await expect(
      phoneBelongsToActiveOrgMember(ORG, '8939492001'),
    ).resolves.toBe(false);
  });

  it('allows a former/inactive member (query returns only active rows)', async () => {
    // Inactive members are filtered out by .eq('status','active'), so the guard
    // sees an empty active set and must permit the insert.
    mockActiveMembers([]);
    await expect(
      phoneBelongsToActiveOrgMember(ORG, '9600096556'),
    ).resolves.toBe(false);
  });

  it('does not falsely reject when two profiles share one phone', async () => {
    // 8939492001 is shared by two EXTERNAL profiles in production. Neither is a
    // member of this org, so adding that number as a client must still work.
    mockActiveMembers([{ phone: '+919600096556' }, { phone: '+917550173501' }]);
    await expect(
      phoneBelongsToActiveOrgMember(ORG, '8939492001'),
    ).resolves.toBe(false);
  });

  it('ignores active members with no phone (no regression, no crash)', async () => {
    mockActiveMembers([{ phone: null }, { phone: '' }, { phone: '   ' }]);
    await expect(
      phoneBelongsToActiveOrgMember(ORG, '9600096556'),
    ).resolves.toBe(false);
  });

  it('skips unusable input rather than scanning', async () => {
    mockActiveMembers([{ phone: '+919600096556' }]);
    for (const bad of ['', '   ', '12345', 'abc']) {
      await expect(phoneBelongsToActiveOrgMember(ORG, bad)).resolves.toBe(false);
    }
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns false with no orgId', async () => {
    await expect(
      phoneBelongsToActiveOrgMember('', '9600096556'),
    ).resolves.toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fails OPEN on lookup error (defence-in-depth, not the gate)', async () => {
    mockError();
    await expect(
      phoneBelongsToActiveOrgMember(ORG, '9600096556'),
    ).resolves.toBe(false);
  });
});

describe('canonical normalization is reused, not reimplemented', () => {
  it('agrees with the platform lookup helper on every format', () => {
    const all = [
      '9600096556',
      '+919600096556',
      '919600096556',
      '+91 96000 96556',
      '96000-96556',
      '00919600096556',
      '  9600096556  ',
    ].map((f) => normalizePhoneForInviteeLookup(f));
    expect(new Set(all).size).toBe(1);
    expect(all[0]).toBe('9600096556');
  });

  it('scopes the query to active members of the given org', async () => {
    const eqCalls: Array<[string, string]> = [];
    mockSelect.mockReturnValue({
      eq: (a: string, b: string) => {
        eqCalls.push([a, b]);
        return {
          eq: (c: string, d: string) => {
            eqCalls.push([c, d]);
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    });
    await phoneBelongsToActiveOrgMember(ORG, '9600096556');
    expect(mockFrom).toHaveBeenCalledWith('organization_members');
    expect(eqCalls).toEqual([
      ['organization_id', ORG],
      ['status', 'active'],
    ]);
  });
});
