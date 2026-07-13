-- =============================================================================
-- Fix: userprofiles signed URLs 400 for every avatar/org-logo (regression from
-- 20261116000000_lock_down_userprofiles_bucket.sql).
-- =============================================================================
-- That migration dropped the bucket's SELECT policy assuming createSignedUrl
-- doesn't need one — it does. Storage's /object/sign endpoint mints a new
-- signature and must look up the object row via a SELECT-permitted query to
-- do so; with RLS enabled and zero SELECT policies, every lookup returns
-- nothing and the endpoint 400s "not found", even for files that exist.
--
-- Restore SELECT, scoped to authenticated users only (not anon/public) —
-- this still closes the original gap (anonymous listing/scraping) while
-- letting legitimate signed-URL reads succeed. Avatars and org logos are
-- routinely viewed across org boundaries (driver photos, counterparty org
-- logos in Network/Finance), so a tighter own-folder-only policy would keep
-- breaking those cross-org views.

CREATE POLICY "Authenticated can read userprofiles avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'userprofiles');
