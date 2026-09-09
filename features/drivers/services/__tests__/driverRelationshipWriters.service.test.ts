/**
 * Phase 2 of the driver relationship model (see docs/DRIVER_TRIP_COMPENSATION_MODEL.md
 * and the tracking_only investigation): relationship_origin/relationship_status are
 * additive, write-once/event-driven fields populated only by the verified lifecycle
 * writers below.
 *
 * As of the idx_drivers_phone_normalised concurrency fix (2026-09-07), createDriver()
 * and ensureDriverRowByPhone() no longer write to public.drivers directly — they call
 * the create_driver_direct / ensure_driver_row_by_phone_insert RPCs, which set
 * relationship_origin/relationship_status server-side under a global phone lock so a
 * cross-org or concurrent same-phone request can't 23505 on idx_drivers_phone_normalised.
 * invite_driver was rewritten the same way.
 *
 * That means these tests can no longer assert on relationship_origin/relationship_status
 * by inspecting a client-side insert/update payload — that invariant now lives in the SQL
 * migration bodies (20270310070000_create_driver_direct_rpc.sql,
 * 20270310080000_ensure_driver_row_by_phone_insert_rpc.sql,
 * 20270310090000_invite_driver_atomic_rewrite.sql) and was verified there by line-by-line
 * diff review against the pre-existing behavior, the same limitation this file already
 * documented for assign_aggregate_trip_driver, accept_driver_invite, and leave_fleet —
 * this repo's Jest suite mocks the Supabase client, not a live Postgres. That is a real
 * limitation, not something these tests paper over.
 *
 * What these tests verify instead: that the TS layer forwards the right arguments to the
 * right RPC (in particular tracking_only / p_user_id, which TS still resolves) and
 * correctly unwraps the RPC's {ok, driver, error} response — the contract these two
 * functions still own.
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

function driversTableBuilder(opts: { lookupResult?: { data: unknown; error: unknown } }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'limit', 'order', 'range', 'update', 'insert']) {
    builder[m] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(() =>
    Promise.resolve(opts.lookupResult ?? { data: null, error: null }),
  );
  builder.single = jest.fn(() => Promise.resolve(opts.lookupResult ?? { data: null, error: null }));
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(opts.lookupResult ?? { data: [], error: null }).then(resolve);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFrom.mockReturnValue(driversTableBuilder({}));
  // No existing rows / no RPC matches by default — every test below is a "new row" case.
  mockRpc.mockImplementation((name: string) => {
    if (name === 'get_driver_invitee_by_phone') return rpcThenable({ data: [], error: null });
    if (name === 'match_driver_by_phone') return rpcThenable({ data: null, error: null });
    if (name === 'create_driver_direct') {
      return Promise.resolve({
        data: { ok: true, driver: { id: 'd-new' }, reconnected: false },
        error: null,
      });
    }
    if (name === 'ensure_driver_row_by_phone_insert') {
      return Promise.resolve({ data: { ok: true, driver: { id: 'd-new' } }, error: null });
    }
    return rpcThenable({ data: null, error: null });
  });
});

describe('ensureDriverRowByPhone — RPC call shape on the new-row path', () => {
  it('A) trackingOnly:true (aggregate assignment) → p_tracking_only true, p_user_id NULL', async () => {
    await ensureDriverRowByPhone('org-1', '9999900001', 'Driver A', { trackingOnly: true });

    expect(mockRpc).toHaveBeenCalledWith(
      'ensure_driver_row_by_phone_insert',
      expect.objectContaining({
        p_org_id: 'org-1',
        p_phone: '9999900001',
        p_tracking_only: true,
        p_user_id: null,
      }),
    );
  });

  it('F) trackingOnly:false (direct/non-aggregate assignment) → p_tracking_only false', async () => {
    await ensureDriverRowByPhone('org-1', '9999900002', 'Driver F', { trackingOnly: false });

    expect(mockRpc).toHaveBeenCalledWith(
      'ensure_driver_row_by_phone_insert',
      expect.objectContaining({
        p_org_id: 'org-1',
        p_phone: '9999900002',
        p_tracking_only: false,
      }),
    );
  });

  it('surfaces the RPC error message when the row cannot be created (e.g. cross-org collision)', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_driver_invitee_by_phone') return rpcThenable({ data: [], error: null });
      if (name === 'match_driver_by_phone') return rpcThenable({ data: null, error: null });
      if (name === 'ensure_driver_row_by_phone_insert') {
        return Promise.resolve({
          data: { ok: false, error: 'This phone number already has a pending driver entry in another organization.' },
          error: null,
        });
      }
      return rpcThenable({ data: null, error: null });
    });

    const { error, driver } = await ensureDriverRowByPhone('org-1', '9999900005', 'Driver X', {
      trackingOnly: true,
    });

    expect(driver).toBeNull();
    expect(error?.message).toMatch(/another organization/);
  });
});

describe('createDriver — RPC call shape on the manual-add path', () => {
  it('B) new manual-add row → forwards name/phone/email/pay terms to create_driver_direct', async () => {
    await createDriver('org-1', {
      name: 'Driver B',
      phone: '9999900003',
      email: 'b@example.com',
      payableAmount: 15000,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'create_driver_direct',
      expect.objectContaining({
        p_org_id: 'org-1',
        p_name: 'Driver B',
        p_phone: '9999900003',
        p_email: 'b@example.com',
        p_payable_amount: 15000,
      }),
    );
  });

  it('does not perform any direct .from("drivers") write itself — the RPC is the sole writer', async () => {
    await createDriver('org-1', { name: 'Driver B', phone: '9999900003' });

    const insertCalls = (mockFrom() as { insert: jest.Mock }).insert.mock.calls;
    expect(insertCalls.length).toBe(0);
  });
});

describe('regression — reconnect is handled entirely inside create_driver_direct', () => {
  it('createDriver() returns the RPC-reported driver as-is on a reconnect, without any client-side follow-up write', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'create_driver_direct') {
        return Promise.resolve({
          data: {
            ok: true,
            reconnected: true,
            driver: { id: 'existing-1', left_at: null, relationship_origin: null, relationship_status: null },
          },
          error: null,
        });
      }
      return rpcThenable({ data: [], error: null });
    });

    const { error, driver } = await createDriver('org-1', {
      name: 'Driver Reconnect',
      phone: '9999900004',
    });

    expect(error).toBeNull();
    expect(driver).toMatchObject({ id: 'existing-1' });
    // No .from("drivers") write of any kind from the TS layer — reconnect (including
    // leaving relationship_origin/relationship_status untouched) is entirely inside
    // the RPC, verified by diff review against 20270310070000_create_driver_direct_rpc.sql.
    const insertCalls = (mockFrom() as { insert: jest.Mock }).insert.mock.calls;
    const updateCalls = (mockFrom() as { update: jest.Mock }).update.mock.calls;
    expect(insertCalls.length).toBe(0);
    expect(updateCalls.length).toBe(0);
  });
});
