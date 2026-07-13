import { createLedgerEntry } from '../finance.service';

const mockFrom = jest.fn();
const mockRecordTripWorkflowEvent = jest.fn().mockResolvedValue({ error: null, event: { id: 'evt-1' }, alreadyExists: false });

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: mockFrom,
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
  }),
}));

jest.mock('@/lib/tripChatInvalidate', () => ({
  notifyTripChatMessagesChanged: jest.fn(),
}));

jest.mock('@/features/trips/services/tripWorkflow.service', () => ({
  recordTripWorkflowEvent: (...args: unknown[]) => mockRecordTripWorkflowEvent(...args),
}));

jest.mock('@/features/drivers/services/drivers.service', () => ({
  getDriverProfileDisplay: jest.fn(),
  getDriverProfileDisplayBatch: jest.fn(),
}));

jest.mock('@/lib/avatarUpload', () => ({
  AVATAR_BUCKET: 'avatars',
  LEGACY_AVATAR_BUCKET: 'avatars-legacy',
  extractPathFromStorageUrl: jest.fn(),
  getSignedAvatarUrl: jest.fn(),
  resolveAvatarPublicUrl: jest.fn(),
}));

/** Catch-all for every table this function may touch as a fire-and-forget side effect. */
function genericBuilder(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const builder: Record<string, unknown> = {};
  ['select', 'eq', 'in', 'order', 'limit', 'range', 'update', 'insert', 'neq', 'gte', 'lte'].forEach((m) => {
    builder[m] = jest.fn(() => builder);
  });
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

/**
 * `.from("transactions")` is called multiple times per createLedgerEntry (a pre-insert
 * sales-cap SELECT for client receipts, the real INSERT, and a post-insert SELECT from
 * syncTripAmountPaidFromLedger) — each call needs a *fresh* builder instance, and which
 * result it resolves to depends on whether `.insert(...)` or `.select(...)` was called
 * first on that instance, not on call order.
 */
function transactionsTableBuilder(
  insertResult: { data: unknown; error: unknown },
  selectResult: { data: unknown; error: unknown } = { data: [], error: null },
) {
  let mode: 'insert' | 'select' | null = null;
  const builder: Record<string, unknown> = {};
  ['select', 'eq', 'order', 'limit', 'range', 'neq', 'gte', 'lte', 'in'].forEach((m) => {
    builder[m] = jest.fn(() => {
      if (m === 'select' && mode === null) mode = 'select';
      return builder;
    });
  });
  builder.insert = jest.fn(() => {
    mode = 'insert';
    return builder;
  });
  const resolveResult = () => (mode === 'insert' ? insertResult : selectResult);
  builder.single = jest.fn(() => Promise.resolve(resolveResult()));
  builder.maybeSingle = jest.fn(() => Promise.resolve(resolveResult()));
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolveResult()).then(resolve, reject);
  return builder;
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordTripWorkflowEvent.mockResolvedValue({ error: null, event: { id: 'evt-1' }, alreadyExists: false });
});

describe('createLedgerEntry — finance workflow sync', () => {
  it('records supplier.payment_recorded when a supplier payment (amount_out) is inserted', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions') {
        return transactionsTableBuilder({
          data: {
            id: 'tx-1',
            trip_id: 'trip-1',
            contact_type: 'supplier',
            contact_id: 'sup-1',
            amount_in: 0,
            amount_out: 500,
            organization_id: 'org-1',
            party_name: 'Acme Logistics',
            description: 'Supplier payment',
            transaction_date: '2026-07-10',
            created_at: '2026-07-10T12:00:00.000Z',
          },
          error: null,
        });
      }
      return genericBuilder();
    });

    const { error, row } = await createLedgerEntry('org-1', {
      trip_id: 'trip-1',
      trip_number: 'T-001',
      ledgerWritePassthroughTripContext: true,
      contact_type: 'supplier',
      contact_id: 'sup-1',
      party_name: 'Acme Logistics',
      amount_in: 0,
      amount_out: 500,
      description: 'Supplier payment',
      transaction_date: '2026-07-10',
    } as never);

    expect(error).toBeNull();
    expect(row).not.toBeNull();

    await flushPromises();

    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledWith({
      tripId: 'trip-1',
      orgId: 'org-1',
      eventType: 'supplier.payment_recorded',
    });
  });

  it('records client.payment_received when a client receipt (amount_in) is inserted', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions') {
        return transactionsTableBuilder({
          data: {
            id: 'tx-2',
            trip_id: 'trip-1',
            contact_type: 'client',
            contact_id: 'cli-1',
            amount_in: 1000,
            amount_out: 0,
            organization_id: 'org-1',
            party_name: 'Big Retail Co',
            description: 'Client receipt',
            transaction_date: '2026-07-10',
            created_at: '2026-07-10T12:00:00.000Z',
          },
          error: null,
        });
      }
      // Sales-cap check on client receipts: trip lookup + existing-transactions lookup.
      if (table === 'trips') {
        return genericBuilder({
          data: { id: 'trip-1', client_price: 5000, supplier_rate: 4000, organization_id: 'org-1', indent_id: null },
          error: null,
        });
      }
      return genericBuilder();
    });

    const { error, row } = await createLedgerEntry('org-1', {
      trip_id: 'trip-1',
      trip_number: 'T-001',
      ledgerWritePassthroughTripContext: true,
      contact_type: 'client',
      contact_id: 'cli-1',
      party_name: 'Big Retail Co',
      amount_in: 1000,
      amount_out: 0,
      description: 'Client receipt',
      transaction_date: '2026-07-10',
    } as never);

    expect(error).toBeNull();
    expect(row).not.toBeNull();

    await flushPromises();

    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledWith({
      tripId: 'trip-1',
      orgId: 'org-1',
      eventType: 'client.payment_received',
    });
  });

  it('does not record a workflow event for a ledger entry with no contact_type', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions') {
        return transactionsTableBuilder({
          data: {
            id: 'tx-3',
            trip_id: 'trip-1',
            contact_type: null,
            amount_in: 0,
            amount_out: 200,
            organization_id: 'org-1',
            party_name: 'Misc',
            description: 'Misc expense',
            transaction_date: '2026-07-10',
            created_at: '2026-07-10T12:00:00.000Z',
          },
          error: null,
        });
      }
      return genericBuilder();
    });

    const { error } = await createLedgerEntry('org-1', {
      trip_id: 'trip-1',
      trip_number: 'T-001',
      ledgerWritePassthroughTripContext: true,
      party_name: 'Misc',
      amount_in: 0,
      amount_out: 200,
      description: 'Misc expense',
      transaction_date: '2026-07-10',
    } as never);

    expect(error).toBeNull();

    await flushPromises();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });
});
