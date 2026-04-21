import type { TripRow } from '@/features/trips/services/trips.service';
import { updateDirectQuoteAssignment } from '@/features/indents/services/direct-quotes.service';
import { supabase } from '@/lib/supabase';

/** Normalize PostgREST / RPC payloads for SETOF trips (array, single row, or JSON string). */
function parseTripsRpcPayload(data: unknown): TripRow[] {
  if (data == null) return [];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      return parseTripsRpcPayload(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(data)) return data as TripRow[];
  if (typeof data === 'object') return [data as TripRow];
  return [];
}

export interface AcceptAwardedQuoteOptions {
  /** Optional vehicle registration for display; stored on trip.vehicle_display_number (e.g. Staff Handshake ad-hoc). */
  vehicle_display_number?: string | null;
}

/**
 * Accept an awarded direct quote by creating a trip via Supabase RPC.
 * Backed by public.create_trip_from_direct_quote(p_quote_id uuid, p_vehicle_display_number text).
 */
export async function acceptAwardedQuote(
  quoteId: string,
  options?: AcceptAwardedQuoteOptions,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const vehicleDisplay = options?.vehicle_display_number != null
    ? String(options.vehicle_display_number).trim() || null
    : null;

  const { data, error } = await supabase().rpc('create_trip_from_direct_quote', {
    p_quote_id: quoteId,
    p_vehicle_display_number: vehicleDisplay,
  });

  if (error) {
    return { error: new Error(error.message), trip: null };
  }

  const rows = parseTripsRpcPayload(data);
  const trip = rows[0] ?? null;
  return { error: null, trip };
}

/**
 * Staff Handshake (Asset): persist roster driver + vehicle on the accepted quote and create the
 * load trip in one DB round-trip (SECURITY DEFINER). Prefer over updateDirectQuoteAssignment + acceptAwardedQuote.
 */
export async function applyRosterDeployFromDirectQuote(
  quoteId: string,
  driverId: string,
  vehicleId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { data, error } = await supabase().rpc(
    'apply_roster_deploy_from_direct_quote',
    {
      p_quote_id: quoteId,
      p_driver_id: driverId,
      p_vehicle_id: vehicleId,
    },
  );

  if (error) {
    const msg = String(error.message ?? '');
    const missingFn =
      /apply_roster_deploy_from_direct_quote/i.test(msg) &&
      (/does not exist/i.test(msg) ||
        /42883/i.test(msg) ||
        /undefined_function/i.test(msg));
    if (missingFn) {
      const { error: uErr } = await updateDirectQuoteAssignment(
        quoteId,
        driverId,
        vehicleId,
      );
      if (uErr) return { error: uErr, trip: null };
      return acceptAwardedQuote(quoteId);
    }
    return { error: new Error(msg), trip: null };
  }

  const rows = parseTripsRpcPayload(data);
  const trip = rows[0] ?? null;
  return { error: null, trip };
}

