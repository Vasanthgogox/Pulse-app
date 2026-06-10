import { updateDirectQuoteAssignment } from '@/features/indents/services/direct-quotes.service';
import {
  type TripRow,
} from '@/features/trips/services/trips.service';
import { supabase } from '@/lib/supabase';

function formatPostgrestError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null): string {
  if (!error) return 'Unknown error.';
  return [
    error.message,
    error.code ? `code=${error.code}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

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
    return { error: new Error(formatPostgrestError(error)), trip: null };
  }

  const rows = parseTripsRpcPayload(data);
  const trip = rows[0] ?? null;
  return { error: null, trip };
}

export interface ApplyRosterDeployFromDirectQuoteOptions {
  /** Reserved for call-site compatibility. */
  indentId?: string;
}

const rosterDeployInFlightByQuoteId = new Map<
  string,
  Promise<{ error: Error | null; trip: TripRow | null }>
>();

async function rosterDeployViaQuoteUpdateAndCreate(
  quoteId: string,
  driverId: string,
  vehicleId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { error: uErr } = await updateDirectQuoteAssignment(
    quoteId,
    driverId,
    vehicleId,
  );
  if (uErr) return { error: uErr, trip: null };
  return acceptAwardedQuote(quoteId);
}

async function recoverRosterTripAfterConflict(
  quoteId: string,
  driverId: string,
  vehicleId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  // Ensure quote stores latest roster first, then call idempotent SECURITY DEFINER RPC.
  // This mirrors pulse and avoids supplier-side RLS issues on direct trips UPDATE.
  const { error: assignErr } = await updateDirectQuoteAssignment(
    quoteId,
    driverId,
    vehicleId,
  );
  if (assignErr) return { error: assignErr, trip: null };
  return acceptAwardedQuote(quoteId);
}

/**
 * Staff Handshake (Asset): persist roster driver + vehicle on the accepted quote and create the
 * load trip using the same two-step flow as pulse:
 * updateDirectQuoteAssignment + acceptAwardedQuote.
 */
export async function applyRosterDeployFromDirectQuote(
  quoteId: string,
  driverId: string,
  vehicleId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const existing = rosterDeployInFlightByQuoteId.get(quoteId);
  if (existing) return existing;

  const run = (async (): Promise<{ error: Error | null; trip: TripRow | null }> => {
    // Web hotfix: force the proven pulse flow and bypass apply_roster RPC.
    // This avoids persistent 409 conflicts observed on web for some environments.
    const legacy = await rosterDeployViaQuoteUpdateAndCreate(
      quoteId,
      driverId,
      vehicleId,
    );
    if (!legacy.error && legacy.trip) return legacy;
    if (legacy.trip) return legacy;

    const msg = String(legacy.error?.message ?? '');
    if (/409|23505|duplicate|unique constraint|conflict/i.test(msg)) {
      const recovered = await recoverRosterTripAfterConflict(
        quoteId,
        driverId,
        vehicleId,
      );
      if (!recovered.error && recovered.trip) return recovered;
      return recovered;
    }
    return {
      error: legacy.error ?? new Error('Trip deploy failed.'),
      trip: null,
    };
  })();

  rosterDeployInFlightByQuoteId.set(quoteId, run);
  try {
    return await run;
  } finally {
    rosterDeployInFlightByQuoteId.delete(quoteId);
  }
}

