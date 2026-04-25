/**
 * Bids service — submit, accept, reject, withdraw bids on load posts.
 */
import { supabase } from '@/lib/supabase';

export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface BidRow {
  id: string;
  post_id: string;
  bidder_organization_id: string;
  bidder_org_name: string | null;
  bidder_user_id: string;
  amount: number;
  note: string | null;
  status: BidStatus;
  created_at: string;
  updated_at: string;
}

export async function getBidsForPost(
  postId: string,
): Promise<{ error: Error | null; bids: BidRow[] }> {
  const { data, error } = await supabase()
    .from('bids')
    .select(`
      id,
      post_id,
      bidder_organization_id,
      bidder_user_id,
      amount,
      note,
      status,
      created_at,
      updated_at,
      organizations:bidder_organization_id ( name )
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), bids: [] };

  type BidJoinRow = {
    id: string;
    post_id: string;
    bidder_organization_id: string;
    bidder_user_id: string;
    amount: number;
    note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    organizations: unknown;
  };
  const bids = ((data ?? []) as unknown as BidJoinRow[]).map((row) => {
    const org = row.organizations as { name?: string } | null;
    return {
      id: row.id,
      post_id: row.post_id,
      bidder_organization_id: row.bidder_organization_id,
      bidder_org_name: org?.name ?? null,
      bidder_user_id: row.bidder_user_id,
      amount: row.amount,
      note: row.note,
      status: row.status as BidStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return { error: null, bids };
}

export async function submitBid(input: {
  postId: string;
  bidderOrganizationId: string;
  amount: number;
  note?: string;
}): Promise<{ error: Error | null; bidId: string | null; alreadyBid: boolean }> {
  const { data: session } = await supabase().auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return { error: new Error('Not authenticated'), bidId: null, alreadyBid: false };

  const { data, error } = await supabase()
    .from('bids')
    .insert({
      post_id: input.postId,
      bidder_organization_id: input.bidderOrganizationId,
      bidder_user_id: userId,
      amount: input.amount,
      note: input.note ?? null,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return { error: null, bidId: null, alreadyBid: true };
    return { error: new Error(error.message), bidId: null, alreadyBid: false };
  }

  return { error: null, bidId: data?.id ?? null, alreadyBid: false };
}

export async function acceptBid(
  bidId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('bids')
    .update({ status: 'accepted' })
    .eq('id', bidId)
    .eq('status', 'pending');
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function rejectBid(
  bidId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('bids')
    .update({ status: 'rejected' })
    .eq('id', bidId)
    .eq('status', 'pending');
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function withdrawBid(
  bidId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('bids')
    .update({ status: 'withdrawn' })
    .eq('id', bidId)
    .eq('status', 'pending');
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function getMyBidForPost(
  postId: string,
  orgId: string,
): Promise<{ error: Error | null; bid: BidRow | null }> {
  const { data, error } = await supabase()
    .from('bids')
    .select('id, post_id, bidder_organization_id, bidder_user_id, amount, note, status, created_at, updated_at')
    .eq('post_id', postId)
    .eq('bidder_organization_id', orgId)
    .maybeSingle();

  if (error) return { error: new Error(error.message), bid: null };
  if (!data) return { error: null, bid: null };

  return {
    error: null,
    bid: {
      ...(data as Omit<BidRow, 'bidder_org_name'>),
      bidder_org_name: null,
      status: (data as { status: string }).status as BidStatus,
    },
  };
}
