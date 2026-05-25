/**
 * Dispatcher-side reads from trip_location_checkpoints.
 *
 * Checkpoints are sparse (every 120s or 500m) — NOT every GPS ping.
 * The 12-row limit aligns with the adaptive TAT-based ping schedule:
 * 12 checkpoints spread across the trip regardless of distance.
 *
 * RLS: org members + trip partners can read via can_access_trip_location().
 * No migration required (policy exists from 20260802130000_tracking_realtime_subsystem.sql).
 */

import { supabase } from '@/lib/supabase';

export type TripCheckpointRow = {
  id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
};

/**
 * Fetch the most recent checkpoints for a trip.
 * Returns them oldest-first (ascending) for trail rendering.
 *
 * @param limit - default 12 (CHECKPOINT_FETCH_LIMIT); matches adaptive TAT rule
 */
export async function getRecentTripCheckpoints(
  tripId: string,
  limit = 12,
): Promise<{ checkpoints: TripCheckpointRow[]; error: Error | null }> {
  const { data, error } = await supabase()
    .from('trip_location_checkpoints')
    .select('id, latitude, longitude, recorded_at')
    .eq('trip_id', tripId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) return { checkpoints: [], error: new Error(error.message) };

  // Reverse to chronological order for trail display (oldest → newest)
  const rows = ((data ?? []) as TripCheckpointRow[]).reverse();
  return { checkpoints: rows, error: null };
}
