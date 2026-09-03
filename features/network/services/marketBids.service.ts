/**
 * Business Review Hub v1 — market_bids on a business-owned indent.
 * Distinct from driver_direct_bids (Reach) and org-to-org direct_quotes —
 * this is the DCO/fleet-owner-bids-directly-on-an-indent path.
 * @see supabase/migrations/20270301040000_market_bids.sql
 * @see supabase/migrations/20270304040000_list_market_bids_for_indent.sql
 * @see supabase/migrations/20270304030000_market_bid_trips_fk_fix.sql
 * @see supabase/migrations/20270304110000_market_bids_contact_visibility.sql
 */
import { supabase } from '@/lib/supabase';

export type MarketBidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type MarketBidForIndentRow = {
  id: string;
  indent_id: string;
  bidder_type: 'dco' | 'organization';
  bidder_user_id: string;
  bidder_display_name: string;
  bidder_organization_id: string | null;
  bidder_organization_name: string | null;
  /** Always populated (last-4 masked). */
  bidder_masked_phone: string | null;
  /** Unmasked — only non-null once the bid is 'accepted'; enforced server-side. */
  bidder_phone: string | null;
  is_fleet_owner: boolean;
  amount: number;
  note: string | null;
  status: MarketBidStatus;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  vehicle_number: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_body_type: string | null;
  vehicle_capacity: string | null;
};

/** All market_bids on this indent, newest first — RLS-backed via list_market_bids_for_indent. */
export async function listMarketBidsForIndent(
  indentId: string,
): Promise<{ error: Error | null; bids: MarketBidForIndentRow[] }> {
  if (!indentId) return { error: null, bids: [] };
  const { data, error } = await supabase().rpc('list_market_bids_for_indent', {
    p_indent_id: indentId,
  });
  if (error) return { error: new Error(error.message), bids: [] };
  return { error: null, bids: (data ?? []) as MarketBidForIndentRow[] };
}

export async function acceptMarketBid(
  bidId: string,
): Promise<{ error: Error | null; tripId: string | null }> {
  const { data, error } = await supabase().rpc('accept_market_bid', {
    p_bid_id: bidId,
  });
  if (error) return { error: new Error(error.message), tripId: null };
  const tripId = (data as { trip_id?: string } | null)?.trip_id ?? null;
  return { error: null, tripId };
}

export async function rejectMarketBid(bidId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('reject_market_bid', { p_bid_id: bidId });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
