import { supabase } from '@/lib/supabase';
import type { TripRow } from '@/features/trips/services/trips.service';

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

  const rows = (data ?? []) as TripRow[];
  const trip = rows[0] ?? null;
  return { error: null, trip };
}

