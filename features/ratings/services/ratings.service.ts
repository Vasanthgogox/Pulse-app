/**
 * Ratings service — Client→Supplier, Supplier→Driver.
 * Uses public.ratings table (create via docs/RATINGS_MIGRATION.sql in Q-unified-base).
 */
import { supabase } from '@/lib/supabase';
import type { CreateRatingData, RatingRow } from '../types';
export type { RatingRow };

export async function createRating(
  organizationId: string,
  data: CreateRatingData
): Promise<{ error: Error | null; rating: RatingRow | null }> {
  const { data: row, error } = await supabase()
    .from('ratings')
    .upsert(
      {
        organization_id: organizationId,
        trip_id: data.trip_id,
        rater_type: data.rater_type,
        rater_id: data.rater_id,
        rated_type: data.rated_type,
        rated_id: data.rated_id,
        score: Math.min(5, Math.max(1, data.score)),
        comment: data.comment ?? null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'trip_id,rater_type,rater_id,rated_type,rated_id',
      }
    )
    .select()
    .single();

  if (error) return { error: new Error(error.message), rating: null };
  return { error: null, rating: row as RatingRow };
}

export async function getRatingsForTrip(tripId: string): Promise<{
  error: Error | null;
  ratings: RatingRow[];
}> {
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}

export async function getRatingsForSupplier(supplierId: string): Promise<{
  error: Error | null;
  ratings: RatingRow[];
}> {
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'supplier')
    .eq('rated_id', supplierId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}

export async function getRatingsForClient(clientId: string): Promise<{
  error: Error | null;
  ratings: RatingRow[];
}> {
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'client')
    .eq('rated_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}

/** Bulk fetch client ratings for many clients (one query). */
export async function getRatingsForClients(clientIds: string[]): Promise<{
  error: Error | null;
  byClientId: Record<string, RatingRow[]>;
}> {
  if (clientIds.length === 0) {
    return { error: null, byClientId: {} };
  }
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'client')
    .in('rated_id', clientIds)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), byClientId: {} };
  const rows = (data ?? []) as RatingRow[];
  const byClientId: Record<string, RatingRow[]> = {};
  for (const id of clientIds) {
    byClientId[id] = [];
  }
  for (const r of rows) {
    if (!byClientId[r.rated_id]) byClientId[r.rated_id] = [];
    byClientId[r.rated_id].push(r);
  }
  return { error: null, byClientId };
}

/** Bulk fetch supplier ratings for many suppliers (one query). */
export async function getRatingsForSuppliers(supplierIds: string[]): Promise<{
  error: Error | null;
  bySupplierId: Record<string, RatingRow[]>;
}> {
  if (supplierIds.length === 0) {
    return { error: null, bySupplierId: {} };
  }
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'supplier')
    .in('rated_id', supplierIds)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), bySupplierId: {} };
  const rows = (data ?? []) as RatingRow[];
  const bySupplierId: Record<string, RatingRow[]> = {};
  for (const id of supplierIds) {
    bySupplierId[id] = [];
  }
  for (const r of rows) {
    if (!bySupplierId[r.rated_id]) bySupplierId[r.rated_id] = [];
    bySupplierId[r.rated_id].push(r);
  }
  return { error: null, bySupplierId };
}

export async function getRatingsForDriver(driverId: string): Promise<{
  error: Error | null;
  ratings: RatingRow[];
}> {
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'driver')
    .eq('rated_id', driverId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}

/** Bulk fetch driver ratings for many drivers (one query). Used by Drivers tab so ratings show in the table. */
export async function getRatingsForDrivers(driverIds: string[]): Promise<{
  error: Error | null;
  byDriverId: Record<string, RatingRow[]>;
}> {
  if (driverIds.length === 0) {
    return { error: null, byDriverId: {} };
  }
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'driver')
    .in('rated_id', driverIds)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), byDriverId: {} };
  const rows = (data ?? []) as RatingRow[];
  const byDriverId: Record<string, RatingRow[]> = {};
  for (const id of driverIds) {
    byDriverId[id] = [];
  }
  for (const r of rows) {
    if (!byDriverId[r.rated_id]) byDriverId[r.rated_id] = [];
    byDriverId[r.rated_id].push(r);
  }
  return { error: null, byDriverId };
}

export function averageScore(ratings: { score: number }[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((s, r) => s + r.score, 0);
  return Math.round((sum / ratings.length) * 100) / 100;
}

function dedupeRatingRowsById(rows: RatingRow[]): RatingRow[] {
  const seen = new Set<string>();
  const out: RatingRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/**
 * Average rating for a party whose rows may be stored under either the finance row id
 * (e.g. clients.id / suppliers.id) or the linked platform organization id.
 */
export function averageRatingForRatedParty(
  byRatedId: Record<string, RatingRow[]>,
  primaryId: string,
  alternateId?: string | null,
): number | null {
  const fromPrimary = byRatedId[primaryId] ?? [];
  const fromAlt = alternateId ? (byRatedId[alternateId] ?? []) : [];
  return averageScore(dedupeRatingRowsById([...fromPrimary, ...fromAlt]));
}

/** Dedupe then average — use when merging buckets that may contain the same row twice. */
export function averageScoreDeduped(rows: RatingRow[]): number | null {
  return averageScore(dedupeRatingRowsById(rows));
}
