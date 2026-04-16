-- Make userprofiles bucket public and allow anyone to read avatars.
-- The bucket was already toggled PUBLIC in the dashboard; this migration makes it reproducible.
-- Public reads mean no signed URLs are needed — use getPublicUrl() directly in the app.

UPDATE storage.buckets
SET public = true
WHERE id = 'userprofiles';

-- Drop the old private read policy (only allowed own folder reads).
DROP POLICY IF EXISTS "Users can read own avatar" ON storage.objects;

-- Allow anyone (authenticated or anonymous) to read from the public userprofiles bucket.
-- This is required so that org B can show org A's avatar in their transaction list.
CREATE POLICY "Public can read userprofiles avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'userprofiles');
