/**
 * Bids service — submit, accept, reject, withdraw bids on load posts.
 */
import { getLinkedOrgProfilesBatch } from '@/features/clients/services/clients.service';
import { supabase } from '@/lib/supabase';

export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface BidRow {
  id: string;
  post_id: string;
  bidder_organization_id: string;
  bidder_org_name: string | null;
  bidder_org_logo_url: string | null;
  bidder_org_avatar_seed: string | null;
  bidder_user_id: string;
  amount: number;
  note: string | null;
  status: BidStatus;
  created_at: string;
  updated_at: string;
}

async function enrichBidderOrgNames(bids: BidRow[]): Promise<BidRow[]> {
  const missingIds = [
    ...new Set(
      bids
        .filter((b) => !b.bidder_org_name?.trim())
        .map((b) => b.bidder_organization_id)
        .filter(Boolean),
    ),
  ];
  if (missingIds.length === 0) return bids;

  const profiles = await getLinkedOrgProfilesBatch(missingIds);
  return bids.map((bid) => {
    if (bid.bidder_org_name?.trim()) return bid;
    const profile = profiles[bid.bidder_organization_id];
    const name = profile?.organizationName?.trim();
    if (!name || name === 'Connected') return bid;
    return {
      ...bid,
      bidder_org_name: name,
      bidder_org_logo_url: bid.bidder_org_logo_url ?? profile.logoUrl ?? null,
      bidder_org_avatar_seed:
        bid.bidder_org_avatar_seed ?? profile.avatarSeed ?? profile.orgAvatarSeed ?? null,
    };
  });
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
      organizations:bidder_organization_id ( name, logo_url, avatar_seed, owner_id )
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
    const org = row.organizations as {
      name?: string;
      logo_url?: string | null;
      avatar_seed?: string | null;
    } | null;
    return {
      id: row.id,
      post_id: row.post_id,
      bidder_organization_id: row.bidder_organization_id,
      bidder_org_name: org?.name ?? null,
      bidder_org_logo_url: org?.logo_url ?? null,
      bidder_org_avatar_seed: org?.avatar_seed ?? null,
      bidder_user_id: row.bidder_user_id,
      amount: row.amount,
      note: row.note,
      status: row.status as BidStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  const enriched = await enrichBidderOrgNames(bids);
  return { error: null, bids: enriched };
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

/**
 * Pulse / story bid: single RPC inserts bid + upserts direct_quotes for posts.source_indent_id.
 * Replaces client-side fuzzy indent matching.
 */
export async function submitPulseBidWithDirectQuote(input: {
  postId: string;
  bidderOrganizationId: string;
  amount: number;
  note?: string;
}): Promise<{ error: Error | null; bidId: string | null; alreadyBid: boolean }> {
  const { data, error } = await supabase().rpc('submit_pulse_bid_with_direct_quote', {
    p_post_id: input.postId,
    p_bidder_org_id: input.bidderOrganizationId,
    p_amount: input.amount,
    p_note: input.note ?? '',
  });

  if (error) {
    let msg = error.message;
    if (msg.includes('POST_NOT_LINKED_TO_INDENT')) {
      msg =
        'This story is not linked to an indent. Ask the publisher to broadcast from a load indent, or quote from Get Load.';
    }
    if (msg.includes('INDENT_NOT_OPEN_FOR_BIDS')) {
      msg =
        'This load has already been awarded or closed. Bidding is no longer available on this story.';
    }
    if (msg.includes('Post is not active')) {
      msg =
        'This story is no longer active. The load may have been awarded or expired.';
    }
    return { error: new Error(msg), bidId: null, alreadyBid: false };
  }

  const row = data as { bid_id?: string; already_bid?: boolean } | null;
  return {
    error: null,
    bidId: row?.bid_id ?? null,
    alreadyBid: Boolean(row?.already_bid),
  };
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

export async function updateBid(
  bidId: string,
  orgId: string,
  amount: number,
  note?: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('bids')
    .update({ amount, note: note ?? null })
    .eq('id', bidId)
    .eq('bidder_organization_id', orgId);
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

/**
 * Pending Pulse bids on LOAD posts the owner org published from those indents.
 * @deprecated Prefer getIndentOfferCountsForOwnerIndents — do not sum with direct_quotes (double-counts Pulse bids).
 */
export async function getStoryBidCountsForOwnerIndents(
  ownerOrgId: string,
  indentIds: string[],
): Promise<{ error: Error | null; counts: Record<string, number> }> {
  const res = await getIndentOfferCountsForOwnerIndents(ownerOrgId, indentIds);
  return res;
}

/**
 * Unique pending offers per indent for Give Load badges.
 * Pulse story bids upsert direct_quotes for the same bidder — count distinct bidder orgs only.
 */
export async function getIndentOfferCountsForOwnerIndents(
  ownerOrgId: string,
  indentIds: string[],
): Promise<{ error: Error | null; counts: Record<string, number> }> {
  if (indentIds.length === 0) return { error: null, counts: {} };

  const biddersByIndent = new Map<string, Set<string>>();
  const trackBidder = (indentId: string, bidderOrgId: string) => {
    if (!indentId || !bidderOrgId) return;
    let set = biddersByIndent.get(indentId);
    if (!set) {
      set = new Set();
      biddersByIndent.set(indentId, set);
    }
    set.add(bidderOrgId);
  };

  const { data: quotes, error: qErr } = await supabase()
    .from('direct_quotes')
    .select('indent_id, bidder_organization_id, status')
    .in('indent_id', indentIds);

  if (qErr) return { error: new Error(qErr.message), counts: {} };

  for (const row of quotes ?? []) {
    const status = String((row as { status?: string }).status ?? '').toLowerCase();
    if (status && status !== 'pending') continue;
    trackBidder(
      (row as { indent_id: string }).indent_id,
      (row as { bidder_organization_id: string }).bidder_organization_id,
    );
  }

  const { data: posts, error: pErr } = await supabase()
    .from('posts')
    .select('id, source_indent_id')
    .eq('organization_id', ownerOrgId)
    .in('source_indent_id', indentIds)
    .eq('is_active', true);

  if (pErr) return { error: new Error(pErr.message), counts: {} };

  const postRows = (posts ?? []) as { id: string; source_indent_id: string | null }[];
  const postIds = postRows.map((r) => r.id);
  const indentByPost = new Map(postRows.map((r) => [r.id, r.source_indent_id ?? '']));

  if (postIds.length > 0) {
    const { data: bids, error: bErr } = await supabase()
      .from('bids')
      .select('post_id, bidder_organization_id')
      .in('post_id', postIds)
      .eq('status', 'pending');

    if (bErr) return { error: new Error(bErr.message), counts: {} };

    for (const row of bids ?? []) {
      const pid = (row as { post_id: string }).post_id;
      const iid = indentByPost.get(pid);
      if (!iid) continue;
      trackBidder(iid, (row as { bidder_organization_id: string }).bidder_organization_id);
    }
  }

  const counts: Record<string, number> = {};
  for (const [indentId, bidders] of biddersByIndent) {
    counts[indentId] = bidders.size;
  }
  return { error: null, counts };
}
