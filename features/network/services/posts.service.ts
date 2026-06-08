/**
 * Posts service — business updates and load posts in the network feed.
 */
import { supabase } from '@/lib/supabase';

/** Pulse network: business-only. `UPDATE` is legacy (hidden in UI; migrate off DB when ready). */
export type PostType = 'UPDATE' | 'LOAD' | 'VEHICLE_AVAILABILITY';
const VEHICLE_POST_MARKER = '[VEHICLE_AVAILABILITY]';

function hasVehicleMarker(content: string | null | undefined): boolean {
  return (content ?? '').trimStart().startsWith(VEHICLE_POST_MARKER);
}

function stripVehicleMarker(content: string | null): string | null {
  if (!content) return content;
  return content.replace(VEHICLE_POST_MARKER, '').trimStart();
}

function toStoredVehicleContent(content: string | undefined): string {
  const clean = (content ?? '').trim();
  return hasVehicleMarker(clean) ? clean : `${VEHICLE_POST_MARKER} ${clean}`.trim();
}

function normalizeFeedPost(row: PostRow): PostRow {
  const isLegacyVehicle = row.type === 'UPDATE' && hasVehicleMarker(row.content);
  if (!isLegacyVehicle && row.type !== 'VEHICLE_AVAILABILITY') return row;
  return {
    ...row,
    type: 'VEHICLE_AVAILABILITY',
    content: stripVehicleMarker(row.content),
  };
}

function isPostExpired(row: PostRow): boolean {
  const now = Date.now();
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : NaN;
  if (Number.isFinite(expiresAt)) return expiresAt <= now;
  const createdAt = new Date(row.created_at).getTime();
  if (!Number.isFinite(createdAt)) return false;
  return createdAt + 24 * 60 * 60 * 1000 <= now;
}

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
  /** Set when a LOAD story is published from an indent (Pulse / Share load). */
  source_indent_id?: string | null;
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

  // Supplier-targeted circulation (including integrated_supplier) should be visible
  // only to supplier-side viewers. We currently infer that via allowLoadPosts.
  if (audienceSignals.some((s) => s.includes('supplier') || s.includes('carrier'))) {
    return opts.allowLoadPosts;
  }
  if (audienceSignals.some((s) => s.includes('client'))) {
    return false;
  }
  if (Array.isArray(post.visible_to)) {
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
  /** When broadcasting from an indent — drives Load Center bid counts and BidSheet → direct_quote. */
  sourceIndentId?: string | null;
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
  const rawPosts = (data ?? []) as PostRow[];
  const activePosts = rawPosts.filter(
    (p) => p.is_active === true && !isPostExpired(p),
  );

  // Best effort: auto-deactivate expired own stories so they disappear for everyone.
  const expiredOwnIds = rawPosts
    .filter((p) => p.organization_id === orgId && isPostExpired(p))
    .map((p) => p.id);
  if (expiredOwnIds.length > 0) {
    supabase()
      .from('posts')
      .update({ is_active: false })
      .in('id', expiredOwnIds)
      .eq('organization_id', orgId)
      .then(({ error }) => {
        if (error && __DEV__) console.warn('[posts] auto-deactivate expired posts failed:', error.message);
      })
      .catch((err) => {
        if (__DEV__) console.warn('[posts] auto-deactivate unexpected error:', err);
      });
  }

  const posts = activePosts.map(normalizeFeedPost);
  return { error: null, posts };
}

export async function createPost(
  input: CreatePostInput,
): Promise<{ error: Error | null; postId: string | null }> {
  const { data: session } = await supabase().auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return { error: new Error('Not authenticated'), postId: null };

  const buildInsert = (type: PostType | 'UPDATE', content: string | undefined) => ({
    organization_id: input.organizationId,
    author_user_id: userId,
    type,
    content: content ?? null,
    origin: input.origin ?? null,
    destination: input.destination ?? null,
    // `load_date` is only meaningful for LOAD posts.
    load_date: type === 'LOAD' ? input.loadDate ?? null : null,
    vehicle_type: input.vehicleType ?? null,
    weight_tonnes: input.weightTonnes ?? null,
    rate_offer: input.rateOffer ?? null,
    material: input.material ?? null,
    expires_at: input.expiresAt ?? null,
    source_indent_id: input.sourceIndentId ?? null,
  });

  const primaryType = input.type;
  const primaryContent =
    input.type === 'VEHICLE_AVAILABILITY' ? toStoredVehicleContent(input.content) : input.content;

  const primary = await supabase()
    .from('posts')
    .insert(buildInsert(primaryType, primaryContent))
    .select('id')
    .maybeSingle();

  if (!primary.error) {
    return { error: null, postId: primary.data?.id ?? null };
  }

  // Backward-compatible fallback: older DB check constraints may allow only UPDATE/LOAD.
  if (
    input.type === 'VEHICLE_AVAILABILITY' &&
    (primary.error.message.includes('posts_type_check') ||
      primary.error.message.toLowerCase().includes('check constraint'))
  ) {
    const fallback = await supabase()
      .from('posts')
      .insert(buildInsert('UPDATE', toStoredVehicleContent(input.content)))
      .select('id')
      .maybeSingle();
    if (!fallback.error) {
      return { error: null, postId: fallback.data?.id ?? null };
    }
    return { error: new Error(fallback.error.message), postId: null };
  }

  return { error: new Error(primary.error.message), postId: null };
}

export async function deactivatePost(
  postId: string,
  organizationId?: string | null,
): Promise<{ error: Error | null }> {
  const baseUpdate = supabase().from('posts').update({ is_active: false }).eq('id', postId);
  const scopedUpdate = organizationId ? baseUpdate.eq('organization_id', organizationId) : baseUpdate;
  const { error } = await scopedUpdate;
  if (!error) return { error: null };

  // Fallback for stricter RLS variants where update is blocked but delete is allowed.
  const baseDelete = supabase().from('posts').delete().eq('id', postId);
  const scopedDelete = organizationId ? baseDelete.eq('organization_id', organizationId) : baseDelete;
  const { error: deleteError } = await scopedDelete;
  if (deleteError) return { error: new Error(deleteError.message) };
  return { error: null };
}

export async function incrementPostViewCount(postId: string): Promise<void> {
  try {
    await supabase().rpc('increment_post_view_count', { p_post_id: postId });
  } catch {
    // best-effort
  }
}
