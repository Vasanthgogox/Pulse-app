/**
 * Driver location reporting — append-only history for live trip tracking.
 * Table: driver_locations (driver_id, trip_id, organization_id, latitude, longitude, accuracy, source).
 * Used when driver is on trip: periodic (10s dev / 30s prod) and on tap of location badge.
 */
import { supabase } from '@/lib/supabase';

export type DriverLocationSource = 'live' | 'tap' | 'background';

export interface ReportDriverLocationParams {
  driverId: string;
  organizationId: string;
  tripId: string | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source: DriverLocationSource;
}

export interface ReportDriverLocationResult {
  error: Error | null;
}

/** Result shape for latest location (read by dispatcher/fleet in Live Tracking). */
export interface DriverLocationRow {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recorded_at: string;
}

/**
 * Insert one location row. RLS: driver can only insert for their own driver_id (user_id = auth.uid()).
 */
export async function reportDriverLocation(
  params: ReportDriverLocationParams
): Promise<ReportDriverLocationResult> {
  const { driverId, organizationId, tripId, latitude, longitude, accuracy, source } = params;
  const { error } = await supabase()
    .from('driver_locations')
    .insert({
      driver_id: driverId,
      organization_id: organizationId,
      trip_id: tripId,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      source,
    });
  return { error: error ? new Error(error.message) : null };
}

/**
 * Fetch latest driver location for a trip. Uses RPC (SECURITY DEFINER) so org members
 * get the row even when RLS on driver_locations blocks direct SELECT. Falls back to
 * direct table select if RPC is not available.
 */
export async function getLatestDriverLocationForTrip(
  tripId: string
): Promise<{ error: Error | null; location: DriverLocationRow | null }> {
  const { data, error } = await supabase().rpc('get_latest_driver_location_for_trip', {
    p_trip_id: tripId,
  });
  if (!error && data != null && typeof data === 'object' && 'latitude' in data) {
    const row = data as { latitude: number; longitude: number; accuracy?: number | null; recorded_at: string };
    return {
      error: null,
      location: {
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy ?? null,
        recorded_at: row.recorded_at,
      },
    };
  }
  if (!error) return { error: null, location: null };
  if (error) {
    const { data: tableData, error: tableError } = await supabase()
      .from('driver_locations')
      .select('latitude, longitude, accuracy, recorded_at')
      .eq('trip_id', tripId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tableError) return { error: new Error(tableError.message), location: null };
    return { error: null, location: tableData as DriverLocationRow | null };
  }
  return { error: null, location: null };
}

/**
 * Fetch location history for a trip. Uses RPC (SECURITY DEFINER) so org members get rows.
 * Falls back to direct table select if RPC is not available.
 */
export async function getTripLocationHistory(
  tripId: string,
  limit = 100
): Promise<{ error: Error | null; points: { latitude: number; longitude: number; recorded_at: string }[] }> {
  const { data, error } = await supabase().rpc('get_driver_location_history_for_trip', {
    p_trip_id: tripId,
    p_limit: limit,
  });
  if (!error && Array.isArray(data)) {
    const points = data.map((row: { latitude: number; longitude: number; recorded_at: string }) => ({
      latitude: row.latitude,
      longitude: row.longitude,
      recorded_at: row.recorded_at,
    }));
    return { error: null, points };
  }
  if (error) {
    const { data: tableData, error: tableError } = await supabase()
      .from('driver_locations')
      .select('latitude, longitude, recorded_at')
      .eq('trip_id', tripId)
      .order('recorded_at', { ascending: true })
      .limit(limit);
    if (tableError) return { error: new Error(tableError.message), points: [] };
    const points = (tableData ?? []) as { latitude: number; longitude: number; recorded_at: string }[];
    return { error: null, points };
  }
  return { error: null, points: [] };
}

/**
 * Fetch latest driver location for a trip, with a safe fallback to driver_id
 * in case trip_id was not set on driver_locations rows.
 */
export async function getLatestDriverLocationForTripOrDriver(
  tripId: string | null,
  driverId: string | null | undefined
): Promise<{ error: Error | null; location: DriverLocationRow | null }> {
  if (!tripId && !driverId) return { error: null, location: null };

  if (tripId) {
    const byTrip = await getLatestDriverLocationForTrip(tripId);
    if (!byTrip.error && byTrip.location) return byTrip;
    if (!driverId || byTrip.error) {
      if (!driverId) return byTrip;
    }
  }

  if (!driverId) return { error: null, location: null };

  const { data, error } = await supabase()
    .from('driver_locations')
    .select('latitude, longitude, accuracy, recorded_at')
    .eq('driver_id', driverId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: new Error(error.message), location: null };
  return { error: null, location: data as DriverLocationRow | null };
}

/**
 * Fetch the most recent N location pings for a trip (newest first). Dev use: last-3 trail.
 * Requires "Drivers read own locations" RLS policy on driver_locations.
 */
export async function getLastNLocationsForTrip(
  tripId: string,
  n = 3,
): Promise<{ error: Error | null; points: { latitude: number; longitude: number; recorded_at: string }[] }> {
  const { data, error } = await supabase()
    .from('driver_locations')
    .select('latitude, longitude, recorded_at')
    .eq('trip_id', tripId)
    .order('recorded_at', { ascending: false })
    .limit(n);

  if (error) return { error: new Error(error.message), points: [] };
  return { error: null, points: (data ?? []) as { latitude: number; longitude: number; recorded_at: string }[] };
}

/**
 * Fetch location history for a driver (fallback when trip_id is null on rows).
 */
export async function getDriverLocationHistoryByDriverId(
  driverId: string,
  limit = 100
): Promise<{ error: Error | null; points: { latitude: number; longitude: number; recorded_at: string }[] }> {
  const { data, error } = await supabase()
    .from('driver_locations')
    .select('latitude, longitude, recorded_at')
    .eq('driver_id', driverId)
    .order('recorded_at', { ascending: true })
    .limit(limit);

  if (error) return { error: new Error(error.message), points: [] };
  const points = (data ?? []) as { latitude: number; longitude: number; recorded_at: string }[];
  return { error: null, points };
}
