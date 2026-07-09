import { acceptBid, RelationshipRequiredError } from '../bids.service';

const mockFrom = jest.fn();
const mockCanAward = jest.fn();
const mockGetAwardEligibility = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ from: mockFrom }),
}));

jest.mock('@/features/connections/services/relationshipService', () => ({
  canAward: (...args: unknown[]) => mockCanAward(...args),
  getAwardEligibility: (...args: unknown[]) => mockGetAwardEligibility(...args),
}));

jest.mock('@/features/clients/services/clients.service', () => ({
  getLinkedOrgProfilesBatch: jest.fn(),
}));

function selectBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

function updateBuilder(result: { error: unknown }) {
  let eqCalls = 0;
  const builder: Record<string, unknown> = {
    update: jest.fn(() => builder),
    eq: jest.fn(() => {
      eqCalls += 1;
      return eqCalls >= 2 ? Promise.resolve(result) : builder;
    }),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('acceptBid — award guard', () => {
  const bidRow = { post_id: 'post-1', bidder_organization_id: 'bidder-org' };
  const postRow = { organization_id: 'shipper-org' };

  it('returns RelationshipRequiredError with eligibility detail and does not update status when canAward is false', async () => {
    mockFrom
      .mockReturnValueOnce(selectBuilder({ data: bidRow, error: null })) // bids select
      .mockReturnValueOnce(selectBuilder({ data: postRow, error: null })); // posts select
    mockCanAward.mockResolvedValue({ error: null, allowed: false });
    mockGetAwardEligibility.mockResolvedValue({
      error: null,
      eligibility: { allowed: false, reason: 'no_relationship' },
    });

    const { error } = await acceptBid('bid-1');

    expect(error).toBeInstanceOf(RelationshipRequiredError);
    expect((error as InstanceType<typeof RelationshipRequiredError>).eligibility.reason).toBe(
      'no_relationship',
    );
    expect(mockCanAward).toHaveBeenCalledWith('bidder-org', 'shipper-org');
    expect(mockGetAwardEligibility).toHaveBeenCalledWith('bidder-org', 'shipper-org');
    // Only two supabase().from() calls (bids select, posts select) — no update attempted.
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('updates status to accepted when canAward is true', async () => {
    const update = updateBuilder({ error: null });
    mockFrom
      .mockReturnValueOnce(selectBuilder({ data: bidRow, error: null }))
      .mockReturnValueOnce(selectBuilder({ data: postRow, error: null }))
      .mockReturnValueOnce(update);
    mockCanAward.mockResolvedValue({ error: null, allowed: true });

    const { error } = await acceptBid('bid-1');

    expect(error).toBeNull();
    expect(update.update).toHaveBeenCalledWith({ status: 'accepted' });
  });

  it('returns an error without querying canAward when the bid is not found/pending', async () => {
    mockFrom.mockReturnValueOnce(selectBuilder({ data: null, error: null }));

    const { error } = await acceptBid('bid-1');

    expect(error?.message).toBe('Bid not found or no longer pending.');
    expect(mockCanAward).not.toHaveBeenCalled();
  });

  it('returns an error when the post is not found', async () => {
    mockFrom
      .mockReturnValueOnce(selectBuilder({ data: bidRow, error: null }))
      .mockReturnValueOnce(selectBuilder({ data: null, error: null }));

    const { error } = await acceptBid('bid-1');

    expect(error?.message).toBe('Load post not found.');
    expect(mockCanAward).not.toHaveBeenCalled();
  });
});
