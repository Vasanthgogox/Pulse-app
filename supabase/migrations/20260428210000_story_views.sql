-- Story views: track who viewed each story and when (WhatsApp-style)

CREATE TABLE IF NOT EXISTS public.story_views (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         UUID         NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewer_org_id   UUID         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  viewer_org_name TEXT,
  viewer_user_id  UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE(post_id, viewer_org_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_post_id ON public.story_views(post_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer  ON public.story_views(viewer_org_id);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_views_select" ON public.story_views;
DROP POLICY IF EXISTS "story_views_insert" ON public.story_views;
DROP POLICY IF EXISTS "story_views_update" ON public.story_views;

-- Post owners can see who viewed their posts
CREATE POLICY "story_views_select" ON public.story_views
  FOR SELECT USING (
    post_id IN (
      SELECT p.id FROM public.posts p
      JOIN public.organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Authenticated org members can insert a view for their org
CREATE POLICY "story_views_insert" ON public.story_views
  FOR INSERT WITH CHECK (
    viewer_org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow upsert (ON CONFLICT UPDATE) for viewed_at refresh
CREATE POLICY "story_views_update" ON public.story_views
  FOR UPDATE USING (
    viewer_org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
