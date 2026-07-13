-- Org members may delete posts for organizations they belong to.
-- Matches posts_update scope; enables deactivatePost() DELETE fallback when UPDATE is denied.

DROP POLICY IF EXISTS "posts_delete" ON public.posts;

CREATE POLICY "posts_delete" ON public.posts
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
