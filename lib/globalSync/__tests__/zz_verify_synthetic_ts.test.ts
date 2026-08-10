import {
  collectAllOperationSignals,
  selectOperationsShelfItems,
} from '@/lib/globalSync/priorityEngine.util';

const H = 3600_000;
const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function trip(over: Record<string, unknown>) {
  return {
    trip_id: 'T1', trip_number: 'TRP001', display_trip_id: 'TRP001',
    status: 'in_transit', pickup_area: 'A', drop_location: 'B',
    driver_display_name: 'D', vehicle_display_number: 'V',
    driver_id: 'drv-1', supplier_id: null, client_id: null,
    created_at: iso(NOW - 9 * H), total_unread: 0, recent_events: [],
    ...over,
  } as never;
}

const snap = (t: unknown) => ({
  activeTrips: [t], alertRows: [], notificationRows: [],
  clientOperationsRibbon: null, dismissedOperationKeys: {},
} as never);

const pick = (t: unknown, cat: string) =>
  selectOperationsShelfItems(snap(t)).find((a) => a.category === cat);

describe('synthetic alert created_at semantics', () => {
  beforeAll(() => { jest.useFakeTimers().setSystemTime(NOW); });
  afterAll(() => { jest.useRealTimers(); });

  // Idle only fires once GPS is >= 4h stale (guard at priorityEngine:232), so the
  // fixture uses a 6h-old ping: the alert exists and its created_at must be that ping.
  it('IDLE: uses last GPS ping (6h ago), not current time', () => {
    const a = pick(trip({ last_location_at: iso(NOW - 6 * H) }), 'vehicle_idle');
    expect(a).toBeDefined();
    expect(a!.created_at).toBe(iso(NOW - 6 * H));
    expect(a!.created_at).not.toBe(iso(NOW));
    expect(a!.id).toBe('syn:idle:T1');
    expect(a!.priority_weight).toBe(72);
  });

  // A system_log in recent_events also yields a real `ev:` alert which wins the
  // (category, trip) dedupe in the shelf. Assert the synthetic directly by id.
  it('LATE LOG case A: uses last system_log (6h ago), not current time', () => {
    const all = collectAllOperationSignals(
      snap(
        trip({
          created_at: iso(NOW - 9 * H),
          recent_events: [
            { id: 'e1', message_type: 'system_log', content: 'ping', created_at: iso(NOW - 6 * H) },
          ],
        }),
      ),
    );
    const a = all.find((x) => x.id === 'syn:latelog:T1');
    expect(a).toBeDefined();
    expect(a!.created_at).toBe(iso(NOW - 6 * H));
    expect(a!.created_at).not.toBe(iso(NOW));
    expect(a!.priority_weight).toBe(66);
  });

  it('LATE LOG case B: no system_log falls back to trip.created_at, not current time', () => {
    const a = pick(trip({ created_at: iso(NOW - 5 * H), recent_events: [] }), 'late_log');
    expect(a).toBeDefined();
    expect(a!.created_at).toBe(iso(NOW - 5 * H));
    expect(a!.created_at).not.toBe(iso(NOW));
  });

  it('UNASSIGNED: remains stamped with current time (intentionally unchanged)', () => {
    const a = pick(trip({ driver_id: null, created_at: iso(NOW - 3 * 24 * H) }), 'unassigned_trip');
    expect(a).toBeDefined();
    expect(a!.created_at).toBe(iso(NOW));
    expect(a!.id).toBe('syn:unassigned:T1');
    expect(a!.priority_weight).toBe(118);
  });

  it('REGRESSION: identity/weights/dedupe stable across repeated calls', () => {
    const t = trip({ last_location_at: iso(NOW - 6 * H) });
    const a = selectOperationsShelfItems(snap(t));
    const b = selectOperationsShelfItems(snap(t));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.priority_weight)).toEqual(b.map((x) => x.priority_weight));
    // one row per (category, trip) — dedupe intact
    const keys = a.map((x) => `${x.category}:${x.trip_id}`);
    expect(new Set(keys).size).toBe(keys.length);
    // idle created_at now deterministic for identical inputs (was time-dependent before)
    const ai = a.find((x) => x.category === 'vehicle_idle')!;
    const bi = b.find((x) => x.category === 'vehicle_idle')!;
    expect(ai.created_at).toBe(bi.created_at);
  });

  it('REGRESSION: dismissal by stable id still suppresses the alert', () => {
    const t = trip({ last_location_at: iso(NOW - 6 * H) });
    const out = selectOperationsShelfItems({
      activeTrips: [t], alertRows: [], notificationRows: [],
      clientOperationsRibbon: null, dismissedOperationKeys: { 'syn:idle:T1': true },
    } as never);
    expect(out.find((x) => x.category === 'vehicle_idle')).toBeUndefined();
  });
});
