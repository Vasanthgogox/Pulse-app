import { createIndent, shareDraftIndent, updateIndentDraft } from '@/features/indents/services/indents.service';

const mockSupabase = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: () => mockSupabase(),
}));

describe('indents draft/share service contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates shared indents as broadcast by default', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { id: 'indent-1', status: 'broadcast' },
      error: null,
    });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ insert }));
    mockSupabase.mockReturnValue({ from });

    const result = await createIndent('org-1', {
      pickup_area: 'A',
      drop_location: 'B',
      client_name: 'Client',
      client_price: 1000,
      supplier_target: 700,
      vehicle_type: 'Truck',
      load_type: 'FMCG',
      weight: 12000,
      pickup_date: '2026-04-13',
    });

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'broadcast',
        organization_id: 'org-1',
      }),
    );
  });

  it('creates drafts with minimal payload validation', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { id: 'indent-draft-1', status: 'draft' },
      error: null,
    });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ insert }));
    mockSupabase.mockReturnValue({ from });

    const result = await createIndent(
      'org-1',
      {
        pickup_area: '',
        drop_location: '',
        client_name: '',
        client_price: Number.NaN,
        supplier_target: Number.NaN,
        vehicle_type: '',
        load_type: '',
        weight: Number.NaN,
      },
      { action: 'draft' },
    );

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'draft',
        client_price: 0,
        supplier_target: 0,
      }),
    );
  });

  it('only updates drafts when status is draft', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const select = jest.fn(() => ({ maybeSingle }));
    const eqSecond = jest.fn(() => ({ select }));
    const eqFirst = jest.fn(() => ({ eq: eqSecond }));
    const update = jest.fn(() => ({ eq: eqFirst }));
    const from = jest.fn(() => ({ update }));
    mockSupabase.mockReturnValue({ from });

    const result = await updateIndentDraft('indent-1', { pickup_area: 'Updated' });

    expect(eqSecond).toHaveBeenCalledWith('status', 'draft');
    expect(result.error?.message).toBe('This indent has been shared and cannot be edited');
  });

  it('returns conflict-friendly message when draft already shared', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const select = jest.fn(() => ({ maybeSingle }));
    const eqSecond = jest.fn(() => ({ select }));
    const eqFirst = jest.fn(() => ({ eq: eqSecond }));
    const update = jest.fn(() => ({ eq: eqFirst }));
    const from = jest.fn(() => ({ update }));
    mockSupabase.mockReturnValue({ from });

    const result = await shareDraftIndent('indent-1');

    expect(eqSecond).toHaveBeenCalledWith('status', 'draft');
    expect(result.error?.message).toBe('This indent has already been shared');
  });
});
