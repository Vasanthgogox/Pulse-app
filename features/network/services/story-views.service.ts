import { supabase } from '@/lib/supabase';

export interface StoryViewRow {
  id: string;
  post_id: string;
  viewer_org_id: string;
  viewer_org_name: string | null;
  viewer_user_id: string;
  viewed_at: string;
}

export async function recordStoryView(
  postId: string,
  orgId: string,
  orgName: string,
): Promise<void> {
  const { data: session } = await supabase().auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) {
    if (__DEV__) console.warn('[story-views] recordStoryView skipped — no authenticated user');
    return;
  }
  if (!postId || !orgId) {
    if (__DEV__) console.warn('[story-views] recordStoryView skipped — missing postId or orgId', { postId, orgId });
    return;
  }

  const { error } = await supabase()
    .from('story_views')
    .upsert(
      { post_id: postId, viewer_org_id: orgId, viewer_org_name: orgName, viewer_user_id: userId, viewed_at: new Date().toISOString() },
      { onConflict: 'post_id,viewer_org_id', ignoreDuplicates: true },
    );

  if (error) {
    // 23505 = unique_violation — already viewed, keep first view time, ignore
    if ((error as { code?: string }).code === '23505') return;
    if (__DEV__) console.error('[story-views] recordStoryView failed:', error.message, error);
  }
}

export async function getStoryViews(
  postId: string,
): Promise<{ error: Error | null; views: StoryViewRow[] }> {
  const { data, error } = await supabase()
    .from('story_views')
    .select('id, post_id, viewer_org_id, viewer_org_name, viewer_user_id, viewed_at')
    .eq('post_id', postId)
    .order('viewed_at', { ascending: false });

  if (error) return { error: new Error(error.message), views: [] };
  return { error: null, views: (data ?? []) as StoryViewRow[] };
}
