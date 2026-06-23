/**
 * Driver quick-status lines stored in `trips.notes` as `[UPDATE|step|iso|message]`.
 * The driver chat UI also mirrors each tap into `trip_messages` so dispatchers see it in Command Hub.
 */
import { supabase } from '@/lib/supabase';
import type { TripRow } from '@/features/trips/services/trips.service';

export type DriverFlowStepId = 'accepted' | 'pickup' | 'transit' | 'reached' | 'completed';

export interface ParsedDriverStatusNote {
  step: string;
  timestamp: string;
  message: string;
}

export const DRIVER_PREDEFINED_STATUS_BY_STEP: Record<DriverFlowStepId, string[]> = {
  accepted: [
    'On my way to pickup',
    'Arrived at pickup location',
    'Loading in progress',
    'Slight delay — will arrive soon',
    'Waiting at gate',
  ],
  pickup: [
    'Loading complete',
    'Documents collected',
    'Package secured',
    'Ready to depart',
    'Waiting for documents',
  ],
  transit: [
    'En route to destination',
    'Traffic ahead — slight delay',
    'Taking alternate route',
    'Approaching destination',
    'Stopped for mandatory break',
  ],
  reached: [
    'Arrived at destination',
    'Unloading in progress',
    'Delivery confirmed by recipient',
    'Recipient not available',
    'Documents handed over',
  ],
  completed: [],
};

/** Parse [UPDATE|step|timestamp|message] entries from trip.notes (newest first). */
export function parseDriverUpdatesFromNotes(notes: string | null): ParsedDriverStatusNote[] {
  if (!notes) return [];
  return notes
    .split('\n')
    .filter((l) => l.startsWith('[UPDATE|'))
    .map((l) => {
      const inner = l.slice(8, -1);
      const [step, timestamp, ...msgParts] = inner.split('|');
      return { step, timestamp, message: msgParts.join('|') };
    })
    .reverse();
}

export function deriveDriverFlowStepFromTrip(t: TripRow): DriverFlowStepId {
  const s = String(t.status ?? '').toLowerCase();
  if (s === 'completed' || s === 'delivered' || s === 'done') return 'completed';
  if (s === 'at_drop') return 'reached';
  // En route to drop-off is explicit `in_transit` (set by DriverTripFlowCard.engageTransit).
  // `in_progress` + started_at means "arrived at pickup / loading" after confirmArrival — not transit.
  if (s === 'in_transit' || s === 'transit') return 'transit';
  if (s === 'picked_up' || s === 'pickup' || s === 'in_progress') return 'pickup';
  return 'accepted';
}

export async function appendDriverStatusNote(
  tripId: string,
  step: DriverFlowStepId,
  message: string,
): Promise<{ error?: string }> {
  const id = String(tripId ?? '').trim();
  if (!id) return { error: 'Missing trip' };
  const now = new Date().toISOString();
  const entry = `[UPDATE|${step}|${now}|${message}]`;

  const { data: row, error: fetchError } = await supabase()
    .from('trips_driver_view')
    .select('instructions')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };

  const existing = (row as { instructions?: string | null } | null)?.instructions?.trim() || '';
  const { error } = await supabase()
    .from('trips')
    .update({ notes: existing ? `${existing}\n${entry}` : entry })
    .eq('id', id);

  return error ? { error: error.message } : {};
}
