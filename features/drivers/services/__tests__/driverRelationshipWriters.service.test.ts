/**
 * Phase 2 of the driver relationship model (see docs/DRIVER_TRIP_COMPENSATION_MODEL.md
 * and the tracking_only investigation): relationship_origin/relationship_status are
 * additive, write-once/event-driven fields populated only by the verified lifecycle
 * writers below. These tests cover the two TypeScript-side writers directly.
 *
 * The three SQL RPC writers (assign_aggregate_trip_driver, accept_driver_invite,
 * leave_fleet) cannot be exercised here — this repo's Jest suite mocks the Supabase
 * client, not a live Postgres — and were instead verified by line-by-line diff review
 * against the pre-existing function bodies (see the migration files' own comments for
 * the exact reasoning). That is a real limitation, not something these tests paper over.
 */
import { createDriver, ensureDriverRowByPhone } from '../drivers.service';

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

function rpcThenable(result: { data: unknown; error: unknown }) {
  return {
    then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
}

function driversTableBuilder(opts: {
  lookupResult?: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
}) {
  const builder: Record<string, unknown> = {};
  let lastInsertPayload: Record<string, unknown> | undefined;
  for (const m of ['select', 'eq', 'or', 'is', 'not', 'neq', 'limit', 'order', 'range', 'update']) {
    builder[m] = jest.fn(() => builder);
  }
  builder.insert = jest.fn((payload: Record<string, unknown>) => {
    lastInsertPayload = payload;
    return builder;
  });
  builder.maybeSingle = jest.fn(() =>
    Promise.resolve(opts.lookupResult ?? { data: null, error: null }),
  );
  builder.single = jest.fn(() =>
    Promise.resolve(opts.insertResult ?? { data: null, error: null }),
  );
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(opts.lookupResult ?? { data: [], error: null }).then(resolve);
  Object.defineProperty(builder, '__lastInsertPayload', {
    get: () => lastInsertPayload,
  });
  return builder as typeof builder & { __lastInsertPayload?: Record<string, unknown> };
}

beforeEach(() => {
  jest.clearAllMocks();
  // No existing rows / no RPC matches by default — every test below is a "new row" case.
  mockRpc.mockImplementation((name: string) => {
    if (name === 'get_drivers_with_profiles') return rpcThenable({ data: [], error: null });
    if (name === 'get_driver_invitee_by_phone') return rpcThenable({ data: [], error: null });
    return rpcThenable({ data: null, error: null }); // match_driver_by_phone etc.
  });
});

describe('ensureDriverRowByPhone — relationship provenance on the new-row path', () => {
  it('A) trackingOnly:true (aggregate assignment) → phone_assignment / independent, tracking_only=true', async () => {
    const builder = driversTableBuilder({
      insertResult: { data: { id: 'd1' }, error: null },
    });
    mockFrom.mockReturnValue(builder);

    await ensureDriverRowByPhone('org-1', '9999900001', 'Driver A', { trackingOnly: true });

    expect(builder.__lastInsertPayload).toMatchObject({
      relationship_origin: 'phone_assignment',
      relationship_status: 'independent',
      tracking_only: true,
    });
  });

  it('F) trackingOnly:false (direct/non-aggregate assignment) → phone_assignment / independent, no tracking_only flag set', async () => {
    const builder = driversTableBuilder({
      lookupResult: { data: null, error: null }, // no existing row found by phone/user_id
      insertResult: { data: { id: 'd2' }, error: null },
    });
    mockFrom.mockReturnValue(builder);

    await ensureDriverRowByPhone('org-1', '9999900002', 'Driver F', { trackingOnly: false });

    expect(builder.__lastInsertPayload).toMatchObject({
      relationship_origin: 'phone_assignment',
      relationship_status: 'independent',
    });
    expect(builder.__lastInsertPayload).not.toHaveProperty('tracking_only');
  });
});

describe('createDriver — relationship provenance on the manual-add path', () => {
  it('B) new manual-add row → manual_add / independent, tracking_only untouched (defaults false in schema)', async () => {
    const builder = driversTableBuilder({
      insertResult: { data: { id: 'd3' }, error: null },
    });
    mockFrom.mockReturnValue(builder);

    await createDriver('org-1', { name: 'Driver B', phone: '9999900003' });

    expect(builder.__lastInsertPayload).toMatchObject({
      relationship_origin: 'manual_add',
      relationship_status: 'independent',
    });
    expect(builder.__lastInsertPayload).not.toHaveProperty('tracking_only');
  });

  it('reuses a tracking-only stub with the same last-10 digits instead of inserting', async () => {
    const builder = driversTableBuilder({
      lookupResult: {
        data: {
          id: 'stub-1',
          organization_id: 'org-1',
          phone: '8056362146',
          user_id: null,
          left_at: null,
          tracking_only: true,
          name: 'Siva',
        },
        error: null,
      },
      insertResult: { data: { id: 'stub-1' }, error: null },
    });
    mockFrom.mockReturnValue(builder);

    const { error, driver } = await createDriver('org-1', {
      name: 'J123',
      phone: '+918056362146',
    });

    expect(error).toBeNull();
    expect(driver?.id).toBe('stub-1');
    expect(builder.insert).not.toHaveBeenCalled();
    const updateCalls = (builder.update as jest.Mock).mock.calls;
    expect(updateCalls[0][0]).toMatchObject({
      name: 'J123',
      tracking_only: false,
    });
  });
});

describe('regression — reconnect must not infer a relationship_status', () => {
  it('createDriver() reconnecting an old left_at row does not set relationship_origin/relationship_status', async () => {
    // getDriversByOrganization → get_drivers_with_profiles RPC returns one existing,
    // disconnected row matching this phone, so createDriver takes the reconnect branch
    // (updateDriver) instead of inserting a new row.
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_drivers_with_profiles') {
        return rpcThenable({
          data: [
            {
              id: 'existing-1',
              organization_id: 'org-1',
              phone: '9999900004',
              left_at: '2026-01-01T00:00:00Z',
              tracking_only: false,
              user_id: null,
            },
          ],
          error: null,
        });
      }
      return rpcThenable({ data: [], error: null });
    });

    // updateDriver() does its own `.from("drivers").select(...).eq(...).maybeSingle()`
    // existence check, then `.update(updates)....select().single()`.
    const builder = driversTableBuilder({
      lookupResult: {
        data: { id: 'existing-1', user_id: null, left_at: '2026-01-01T00:00:00Z', tracking_only: false },
        error: null,
      },
      insertResult: { data: { id: 'existing-1' }, error: null },
    });
    mockFrom.mockReturnValue(builder);

    await createDriver('org-1', { name: 'Driver Reconnect', phone: '9999900004' });

    // updateDriver builds its patch via a plain object, not .insert() — capture via `update`.
    // driversTableBuilder's `update` is a plain passthrough mock; assert it was invoked
    // with a payload that does NOT touch either relationship field, per the explicit
    // decision not to infer relationship_status from left_at clearing yet.
    const updateCalls = (builder.update as jest.Mock).mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    for (const [patch] of updateCalls) {
      expect(patch).not.toHaveProperty('relationship_origin');
      expect(patch).not.toHaveProperty('relationship_status');
    }
  });
});
