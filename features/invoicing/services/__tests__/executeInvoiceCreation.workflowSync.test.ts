import { executeInvoiceCreation } from '../invoicing.service';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockRecordTripWorkflowEvent = jest.fn().mockResolvedValue({ error: null, event: { id: 'evt-1' }, alreadyExists: false });

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

jest.mock('@/features/trips/services/tripWorkflow.service', () => ({
  recordTripWorkflowEvent: (...args: unknown[]) => mockRecordTripWorkflowEvent(...args),
}));

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRIP_1 = '11111111-1111-4111-8111-111111111111';
const TRIP_2 = '22222222-2222-4222-8222-222222222222';
const ALLOCATED = 'INV/2026-27/00001';

const candidateTrips = [
  {
    id: TRIP_1,
    organization_id: ORG,
    trip_number: 'T-001',
    display_trip_id: 'T-001',
    client_id: null,
    client_name: 'Acme',
    client_price: 1000,
  },
  {
    id: TRIP_2,
    organization_id: ORG,
    trip_number: 'T-002',
    display_trip_id: 'T-002',
    client_id: null,
    client_name: 'Acme',
    client_price: 500,
  },
];

function thenable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = jest.fn(self);
  builder.in = jest.fn(self);
  builder.eq = jest.fn(self);
  builder.insert = jest.fn(self);
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordTripWorkflowEvent.mockResolvedValue({ error: null, event: { id: 'evt-1' }, alreadyExists: false });
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'allocate_invoice_number') return Promise.resolve({ data: ALLOCATED, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

function mockHappyPath(opts?: {
  trips?: typeof candidateTrips;
  podTripIds?: string[];
  existingTripIds?: string[][];
  insertError?: unknown;
}) {
  const trips = opts?.trips ?? candidateTrips;
  const podTripIds = opts?.podTripIds ?? trips.map((t) => t.id);
  const existing = (opts?.existingTripIds ?? []).map((trip_ids) => ({ trip_ids }));
  const mockInsert = jest.fn(() =>
    Promise.resolve({ data: null, error: opts?.insertError ?? null }),
  );

  mockFrom.mockImplementation((table: string) => {
    if (table === 'trips') {
      return thenable({ data: trips, error: null });
    }
    if (table === 'trip_documents') {
      return thenable({
        data: podTripIds.map((trip_id) => ({ trip_id })),
        error: null,
      });
    }
    if (table === 'invoices') {
      const builder = thenable({ data: existing, error: null });
      builder.insert = mockInsert;
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { mockInsert };
}

describe('executeInvoiceCreation — live invoices architecture', () => {
  it('inserts one public.invoices row and records invoice.generated per trip', async () => {
    const { mockInsert } = mockHappyPath();

    const { error, invoiceNumber } = await executeInvoiceCreation([TRIP_1, TRIP_2], {
      includeGst: true,
      gstRate: 18,
      includeFuel: false,
      fuelRate: 0,
      additionalCharges: [],
      notes: 'ok',
      paymentTerms: 'Net 30',
    });
    expect(error).toBeNull();
    expect(invoiceNumber).toBe(ALLOCATED);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('allocate_invoice_number', { p_org_id: ORG });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const inserted = mockInsert.mock.calls[0][0];
    expect(inserted.status).toBe('sent');
    expect(inserted.igst_amount).toBe(0);
    expect(inserted.pdf_storage_path).toBeNull();
    expect(inserted.trip_ids).toEqual([TRIP_1, TRIP_2]);
    expect(inserted.invoice_number).toBe(ALLOCATED);
    expect(inserted.financial_year).toBe('2026-27');

    await flushPromises();
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledWith({
      tripId: TRIP_1,
      orgId: ORG,
      eventType: 'invoice.generated',
      payload: { invoice_no: ALLOCATED },
    });
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledWith({
      tripId: TRIP_2,
      orgId: ORG,
      eventType: 'invoice.generated',
      payload: { invoice_no: ALLOCATED },
    });
  });

  it('does not allocate or insert when a selected trip is missing POD', async () => {
    mockHappyPath({ podTripIds: [TRIP_1] });

    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe('POD is required before invoice creation.');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('does not allocate or insert when a selected trip is already invoiced', async () => {
    mockHappyPath({ existingTripIds: [[TRIP_2]] });

    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe('One or more selected trips have already been invoiced.');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('fails when selected trips span multiple organizations', async () => {
    mockHappyPath({
      trips: [
        { ...candidateTrips[0] },
        { ...candidateTrips[1], organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      ],
    });

    const { error } = await executeInvoiceCreation([TRIP_1, TRIP_2]);
    expect(error?.message).toBe('Selected trips must belong to the same workspace.');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });

  it('does not write workflow events when invoice insert fails', async () => {
    mockHappyPath({ insertError: { message: 'insert failed' } });

    const { error } = await executeInvoiceCreation([TRIP_1]);
    expect(error).not.toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });
});
