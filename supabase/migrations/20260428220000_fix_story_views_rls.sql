-- Fix story_views INSERT/UPDATE RLS — checking organization_members is too strict
-- for viewers; just verify the row belongs to the authenticated user.

DROP POLICY IF EXISTS "story_views_insert" ON public.story_views;
DROP POLICY IF EXISTS "story_views_update" ON public.story_views;

CREATE POLICY "story_views_insert" ON public.story_views
  FOR INSERT WITH CHECK (viewer_user_id = auth.uid());

CREATE POLICY "story_views_update" ON public.story_views
  FOR UPDATE USING (viewer_user_id = auth.uid());
