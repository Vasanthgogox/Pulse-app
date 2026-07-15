-- 1. Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('userprofiles', 'userprofiles', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS policies
DROP POLICY IF EXISTS "Users can upload avatar to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- Allow authenticated users to upload only into their own folder: {auth.uid()}/...
CREATE POLICY "Users can upload avatar to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- Allow authenticated users to update/upsert their own file (same path)
CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- Allow authenticated users to read their own file (for signed URL / client read)
CREATE POLICY "Users can read own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- Optional: allow delete so "Remove photo" can delete the object (app currently only clears avatar_url)
CREATE POLICY "Users can delete own avatar"
ON storage.objects 
FOR DELETE 
TO authenticated
USING (
  bucket_id = 'userprofiles' 
  AND (storage.foldername(name))[1] = (auth.uid())::text
);