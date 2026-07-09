import { canAward, getRelationshipStatus } from '../relationshipService';

const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ from: mockFrom }),
}));

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    or: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getRelationshipStatus', () => {
  it("returns 'none' when either org id is missing", async () => {
    const { error, status } = await getRelationshipStatus('', 'org-b');
    expect(error).toBeNull();
    expect(status).toBe('none');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 'none' when no organization_relations row exists", async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: null, error: null }));
    const { error, status } = await getRelationshipStatus('org-a', 'org-b');
    expect(error).toBeNull();
    expect(status).toBe('none');
  });

  it('returns the row status when a relation exists', async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: { status: 'active' }, error: null }));
    const { error, status } = await getRelationshipStatus('org-a', 'org-b');
    expect(error).toBeNull();
    expect(status).toBe('active');
  });

  it('propagates a query error without throwing', async () => {
    mockFrom.mockReturnValue(
      queryBuilder({ data: null, error: { message: 'db unavailable' } }),
    );
    const { error, status } = await getRelationshipStatus('org-a', 'org-b');
    expect(error?.message).toBe('db unavailable');
    expect(status).toBe('none');
  });
});

describe('canAward', () => {
  it('allows a bid within the same organization (self-bid edge case)', async () => {
    const { error, allowed } = await canAward('org-a', 'org-a');
    expect(error).toBeNull();
    expect(allowed).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('denies when no relationship row exists', async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: null, error: null }));
    const { error, allowed } = await canAward('bidder-org', 'shipper-org');
    expect(error).toBeNull();
    expect(allowed).toBe(false);
  });

  it("denies when the relationship exists but is not 'active' (e.g. pending, suspended, ended)", async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: { status: 'pending' }, error: null }));
    const { allowed: pendingAllowed } = await canAward('bidder-org', 'shipper-org');
    expect(pendingAllowed).toBe(false);

    mockFrom.mockReturnValue(queryBuilder({ data: { status: 'suspended' }, error: null }));
    const { allowed: suspendedAllowed } = await canAward('bidder-org', 'shipper-org');
    expect(suspendedAllowed).toBe(false);
  });

  it("allows when an 'active' relationship exists", async () => {
    mockFrom.mockReturnValue(queryBuilder({ data: { status: 'active' }, error: null }));
    const { error, allowed } = await canAward('bidder-org', 'shipper-org');
    expect(error).toBeNull();
    expect(allowed).toBe(true);
  });

  it('denies (fail-closed) when the underlying query errors', async () => {
    mockFrom.mockReturnValue(
      queryBuilder({ data: null, error: { message: 'db unavailable' } }),
    );
    const { error, allowed } = await canAward('bidder-org', 'shipper-org');
    expect(error?.message).toBe('db unavailable');
    expect(allowed).toBe(false);
  });
});
