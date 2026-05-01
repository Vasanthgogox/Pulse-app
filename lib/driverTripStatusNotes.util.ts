/**
 * Driver “quick status” lines stored in `trips.notes` as `[UPDATE|step|iso|message]`.
 * Shown in the full driver message screen; not on the live trip tab.
 */
import { supabase } from '@/lib/supabase';
import type { TripRow } from '@/services/tripsService';

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
  const hasStarted = !!t.started_at;
  if (s === 'completed' || s === 'delivered' || s === 'done') return 'completed';
  if (s === 'at_drop') return 'reached';
  if (s === 'in_transit' || s === 'transit' || (s === 'in_progress' && hasStarted)) return 'transit';
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
    .from('trips')
    .select('notes')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };

  const existing = row?.notes?.trim() || '';
  const { error } = await supabase()
    .from('trips')
    .update({ notes: existing ? `${existing}\n${entry}` : entry })
    .eq('id', id);

  return error ? { error: error.message } : {};
}
