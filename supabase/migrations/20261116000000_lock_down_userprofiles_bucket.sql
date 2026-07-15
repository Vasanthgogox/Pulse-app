-- =============================================================================
-- Lock down the userprofiles storage bucket to match actual app behavior.
-- =============================================================================
-- Bucket was marked public with a broad `SELECT` policy (bucket_id = 'userprofiles'),
-- letting anyone list every file in the bucket via the Storage API — not just
-- fetch a known object by URL. The app itself already assumes this bucket is
-- private: lib/avatarUpload.ts explicitly documents "userprofiles is private —
-- public URLs 400; callers must use getSignedAvatarUrl." Flipping the bucket
-- to private and dropping the public SELECT policy closes the listing gap;
-- existing signed-URL reads are unaffected since Storage's sign/download
-- endpoints validate the signature independently of this RLS policy, and the
-- scoped INSERT/UPDATE/DELETE policies (own folder / own org) are untouched.

UPDATE storage.buckets SET public = false WHERE id = 'userprofiles';

DROP POLICY IF EXISTS "Public can read userprofiles avatars" ON storage.objects;
