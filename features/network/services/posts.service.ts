/**
 * Posts service — business updates and load posts in the network feed.
 */
import { supabase } from '@/lib/supabase';

/** Pulse network: business-only. `UPDATE` is legacy (hidden in UI; migrate off DB when ready). */
export type PostType = 'UPDATE' | 'LOAD' | 'VEHICLE_AVAILABILITY';

export interface PostRow {
  id: string;
  organization_id: string;
  org_name: string;
  org_avatar_seed: string | null;
  author_user_id: string;
  type: PostType;
  content: string | null;
  origin: string | null;
  destination: string | null;
  load_date: string | null;
  vehicle_type: string | null;
  weight_tonnes: number | null;
  rate_offer: number | null;
  material: string | null;
  expires_at: string | null;
  is_active: boolean;
  view_count: number;
  bid_count: number;
  created_at: string;
}

export interface CreatePostInput {
  organizationId: string;
  type: PostType;
  content?: string;
  origin?: string;
  destination?: string;
  loadDate?: string;
  vehicleType?: string;
  weightTonnes?: number;
  rateOffer?: number;
  material?: string;
  expiresAt?: string;
}

export async function getNetworkFeed(
  orgId: string,
  limit = 30,
  offset = 0,
): Promise<{ error: Error | null; posts: PostRow[] }> {
  const { data, error } = await supabase().rpc('get_network_feed', {
    p_org_id: orgId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { error: new Error(error.message), posts: [] };
  return { error: null, posts: (data ?? []) as PostRow[] };
}

export async function createPost(
  input: CreatePostInput,
): Promise<{ error: Error | null; postId: string | null }> {
  const { data: session } = await supabase().auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return { error: new Error('Not authenticated'), postId: null };

  const { data, error } = await supabase()
    .from('posts')
    .insert({
      organization_id: input.organizationId,
      author_user_id: userId,
      type: input.type,
      content: input.content ?? null,
      origin: input.origin ?? null,
      destination: input.destination ?? null,
      load_date: input.loadDate ?? null,
      vehicle_type: input.vehicleType ?? null,
      weight_tonnes: input.weightTonnes ?? null,
      rate_offer: input.rateOffer ?? null,
      material: input.material ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .select('id')
    .maybeSingle();

  if (error) return { error: new Error(error.message), postId: null };
  return { error: null, postId: data?.id ?? null };
}

export async function deactivatePost(
  postId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('posts')
    .update({ is_active: false })
    .eq('id', postId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function incrementPostViewCount(postId: string): Promise<void> {
  try {
    await supabase().rpc('increment_post_view_count', { p_post_id: postId });
  } catch {
    // best-effort
  }
}
