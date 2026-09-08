import { supabase } from '@/lib/supabase';

/**
 * How much the aggregator has paid the mover on a mover_asset trip's linked
 * load ("MAX marked paid ₹X"). The payment lives on the aggregator's trip,
 * never mirrored onto the mover's books.
 * Backed by public.get_mover_asset_client_paid.
 */
export async function getMoverAssetClientPaid(
  tripId: string,
): Promise<{ error: Error | null; paid: number }> {
  const { data, error } = await supabase().rpc('get_mover_asset_client_paid', {
    p_trip_id: tripId,
  });
  if (error) return { error: new Error(error.message), paid: 0 };
  return { error: null, paid: Number(data ?? 0) };
}
