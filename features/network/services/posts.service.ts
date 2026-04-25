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
  circulation_target?: string | null;
  visibility_scope?: string | null;
  target_role?: string | null;
  audience?: string | null;
  viewer_role?: string | null;
  visible_to?: string[] | null;
}

/**
 * Client-side safety gate for feed visibility.
 * Backend should enforce this; this guard prevents accidental overexposure when payload fields exist.
 */
export function isPostVisibleForOrg(
  post: PostRow,
  opts: { allowLoadPosts: boolean },
): boolean {
  if (post.type === 'LOAD' && !opts.allowLoadPosts) return false;

  const normalize = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
  const audienceSignals = [
    normalize(post.circulation_target),
    normalize(post.visibility_scope),
    normalize(post.target_role),
    normalize(post.audience),
    normalize(post.viewer_role),
  ].filter(Boolean);

  if (
    post.type === 'LOAD' &&
    audienceSignals.some((s) => s.includes('supplier') || s.includes('carrier'))
  ) {
    return opts.allowLoadPosts;
  }
  if (post.type === 'LOAD' && audienceSignals.some((s) => s.includes('client'))) {
    return false;
  }
  if (post.type === 'LOAD' && Array.isArray(post.visible_to)) {
    const normalized = post.visible_to.map((v) => normalize(v));
    if (normalized.some((v) => v.includes('supplier') || v.includes('carrier'))) {
      return opts.allowLoadPosts;
    }
    if (normalized.some((v) => v.includes('client'))) {
      return false;
    }
  }
  return true;
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
      // `load_date` is only meaningful for LOAD posts.
      // VEHICLE_AVAILABILITY can carry free-form availability text in `content`.
      load_date: input.type === 'LOAD' ? input.loadDate ?? null : null,
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
