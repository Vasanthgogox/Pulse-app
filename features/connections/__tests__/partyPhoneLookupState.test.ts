/**
 * Three-state resolution of a null invitee lookup.
 *
 * The invitee RPC hides ACTIVE same-org members, so null is ambiguous. These
 * tests pin the contract that null resolves to exactly one of:
 *   same_org  → block entirely (no offline path)
 *   not_found → offline add allowed
 *   error     → block, retryable — must NEVER collapse into not_found
 */
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ rpc: mockRpc }),
}));

import { classifyNullInviteeResult } from '@/features/connections/hooks/usePartyPhoneLookupState';
import { isActiveOrgMemberPhone } from '@/features/connections/services/connectionRequests.service';

const ORG = '5b471ecb-fbfb-470e-95cf-525d789c761a';
const OTHER_ORG = '8b856815-54fb-4394-9ca9-ac80b0f11f17';

beforeEach(() => mockRpc.mockReset());

describe('classifyNullInviteeResult', () => {
  it('same-org active member → same_org (offline path blocked)', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(classifyNullInviteeResult('9600096556', ORG)).resolves.toBe(
      'same_org',
    );
  });

  it('no platform account → not_found (offline allowed)', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(classifyNullInviteeResult('9999999999', ORG)).resolves.toBe(
      'not_found',
    );
  });

  it('former/inactive member → not_found (business rule: still addable)', async () => {
    // RPC is active-only, so a former member returns false like any outsider.
    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(classifyNullInviteeResult('9600096556', ORG)).resolves.toBe(
      'not_found',
    );
  });

  it('RPC error → error, NEVER not_found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    const status = await classifyNullInviteeResult('9600096556', ORG);
    expect(status).toBe('error');
    expect(status).not.toBe('not_found');
  });

  it('thrown/rejected RPC → error, not a crash', async () => {
    mockRpc.mockRejectedValue(new Error('socket closed'));
    await expect(classifyNullInviteeResult('9600096556', ORG)).resolves.toBe(
      'error',
    );
  });

  it('passes the ACTIVE workspace org through, not a hardcoded one', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    await classifyNullInviteeResult('9600096556', OTHER_ORG);
    expect(mockRpc).toHaveBeenCalledWith('is_active_org_member_phone', {
      p_org_id: OTHER_ORG,
      p_phone: '9600096556',
    });
  });

  it('normalizes every phone format to one canonical value', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const formats = [
      '9600096556',
      '+919600096556',
      '919600096556',
      '+91 96000 96556',
      '96000-96556',
      '00919600096556',
      '  9600096556  ',
    ];
    for (const f of formats) {
      mockRpc.mockClear();
      await classifyNullInviteeResult(f, ORG);
      expect(mockRpc).toHaveBeenCalledWith('is_active_org_member_phone', {
        p_org_id: ORG,
        p_phone: '9600096556',
      });
    }
  });

  it('does not call the RPC when no workspace org is set', async () => {
    await expect(classifyNullInviteeResult('9600096556', '')).resolves.toBe(
      'not_found',
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('isActiveOrgMemberPhone', () => {
  it('throws on RPC error so callers cannot silently treat it as "not a member"', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(isActiveOrgMemberPhone('9600096556', ORG)).rejects.toThrow(
      'boom',
    );
  });

  it('returns false (no call) for unusable input', async () => {
    await expect(isActiveOrgMemberPhone('', ORG)).resolves.toBe(false);
    await expect(isActiveOrgMemberPhone('9600096556', '')).resolves.toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('coerces a non-true payload to false rather than passing it through', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(isActiveOrgMemberPhone('9600096556', ORG)).resolves.toBe(false);
  });
});

/**
 * Race safety. The components guard with an incrementing `searchIdRef` checked
 * BOTH after the invitee lookup and again after the membership probe, so a
 * stale phone (or a workspace switch) cannot write state for a newer input.
 */
describe('stale-result race safety', () => {
  function makeRunner() {
    let current = 0;
    const applied: string[] = [];
    return {
      applied,
      async run(label: string, delayMs: number, resolveTo: boolean) {
        const id = ++current;
        mockRpc.mockImplementation(
          () =>
            new Promise((res) =>
              setTimeout(() => res({ data: resolveTo, error: null }), delayMs),
            ),
        );
        const status = await classifyNullInviteeResult('9600096556', ORG);
        // Mirror the component's post-await generation check.
        if (id !== current) return;
        applied.push(`${label}:${status}`);
      },
      bump() {
        current++;
      },
    };
  }

  it('a slow result for phone A does not overwrite state for phone B', async () => {
    const r = makeRunner();
    const slowA = r.run('A', 30, true);
    r.bump(); // user types B — A is now stale
    await slowA;
    expect(r.applied).toEqual([]);
  });

  it('the newest result is the one applied', async () => {
    const r = makeRunner();
    await r.run('B', 0, false);
    expect(r.applied).toEqual(['B:not_found']);
  });
});
