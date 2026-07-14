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

function selectInBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    in: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

function updateBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    update: jest.fn(() => builder),
    in: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const candidateTrips = [
  { id: 'trip-1', organization_id: 'org-1', trip_number: 'T-001', display_trip_id: 'T-001', pod_status: 'received', invoice_status_1: 'pending', invoice_no: null },
  { id: 'trip-2', organization_id: 'org-2', trip_number: 'T-002', display_trip_id: 'T-002', pod_status: 'received', invoice_status_1: 'data shared', invoice_no: null },
];

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordTripWorkflowEvent.mockResolvedValue({ error: null, event: { id: 'evt-1' }, alreadyExists: false });
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'allocate_invoice_number') return Promise.resolve({ data: 'INV-1001', error: null });
    if (fn === 'log_activity') return Promise.resolve({ data: null, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

describe('executeInvoiceCreation — finance workflow sync', () => {
  it('records invoice.generated for every invoiced trip, using each trip’s own organization_id', async () => {
    // First `.from('trips')` call is the candidate SELECT; the second is the status UPDATE.
    let tripsCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'trips') throw new Error(`unexpected table: ${table}`);
      tripsCallCount += 1;
      if (tripsCallCount === 1) {
        return selectInBuilder({ data: candidateTrips, error: null });
      }
      return updateBuilder({ data: null, error: null });
    });

    const { error } = await executeInvoiceCreation(['trip-1', 'trip-2']);
    expect(error).toBeNull();

    await flushPromises();

    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledWith({
      tripId: 'trip-1',
      orgId: 'org-1',
      eventType: 'invoice.generated',
      payload: { invoice_no: 'INV-1001' },
    });
    expect(mockRecordTripWorkflowEvent).toHaveBeenCalledWith({
      tripId: 'trip-2',
      orgId: 'org-2',
      eventType: 'invoice.generated',
      payload: { invoice_no: 'INV-1001' },
    });
  });

  it('does not record a workflow event when no trips are invoiceable', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'trips') throw new Error(`unexpected table: ${table}`);
      return selectInBuilder({
        data: [{ ...candidateTrips[0], invoice_status_1: 'raised', invoice_no: 'INV-0001' }],
        error: null,
      });
    });

    const { error } = await executeInvoiceCreation(['trip-1']);
    expect(error).not.toBeNull();

    await flushPromises();
    expect(mockRecordTripWorkflowEvent).not.toHaveBeenCalled();
  });
});
