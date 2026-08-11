/**
 * Phase 3A — sanitized open marketplace loads for Fleet Owners (read-only).
 */
import { supabase } from '@/lib/supabase';

export type FleetOwnerOpenLoad = {
  id: string;
  indent_number: string | null;
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
  load_type: string | null;
  pickup_date: string | null;
  status: string | null;
  circulation_target: string | null;
  rate_offer: number | null;
  creator_organization_name: string | null;
  created_at: string | null;
};

export async function listOpenMarketplaceLoadsForFleetOwner(
  limit = 50,
): Promise<{ error: Error | null; loads: FleetOwnerOpenLoad[] }> {
  const { data, error } = await supabase().rpc(
    'list_open_marketplace_loads_for_fleet_owner',
    { p_limit: limit },
  );
  if (error) return { error: new Error(error.message), loads: [] };
  return { error: null, loads: (data ?? []) as FleetOwnerOpenLoad[] };
}

export function fleetOwnerLoadRouteLabel(load: FleetOwnerOpenLoad): string {
  const from = (load.pickup_area ?? '').trim() || 'Pickup';
  const to = (load.drop_location ?? '').trim() || 'Drop';
  return `${from} → ${to}`;
}

export function fleetOwnerLoadDisplayId(load: FleetOwnerOpenLoad): string {
  const n = (load.indent_number ?? '').trim();
  return n || load.id.slice(0, 8).toUpperCase();
}

export function formatFleetOwnerRateOffer(
  rate: number | null | undefined,
): string | null {
  if (rate == null || !Number.isFinite(Number(rate))) return null;
  return `₹${Number(rate).toLocaleString('en-IN')}`;
}

/** Soft compatibility: true when load vehicle_type loosely matches any owned vehicle. */
export function isLoadCompatibleWithFleet(
  load: FleetOwnerOpenLoad,
  fleetVehicleTypes: Array<string | null | undefined>,
): boolean {
  const need = (load.vehicle_type ?? '').trim().toLowerCase();
  if (!need) return true;
  const owned = fleetVehicleTypes
    .map((t) => (t ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (owned.length === 0) return true;
  return owned.some(
    (t) => t.includes(need) || need.includes(t) || shareToken(t, need),
  );
}

function shareToken(a: string, b: string): boolean {
  const ta = new Set(a.split(/[^a-z0-9]+/).filter((x) => x.length >= 3));
  const tb = b.split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
  return tb.some((x) => ta.has(x));
}
