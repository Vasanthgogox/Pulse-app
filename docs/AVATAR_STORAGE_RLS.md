# Avatar storage bucket – RLS policies

If you see **"new row violates row-level security policy"** when uploading a profile photo in the driver app, the Supabase Storage bucket `avatars` exists but RLS policies are missing or too strict.

Apply the following in your Supabase project (Dashboard → SQL Editor, or add a migration in Q-unified-base).

## 1. Ensure the bucket exists

Create the bucket if needed (Dashboard → Storage → New bucket, name: `avatars`, **Private**).

## 2. Storage RLS policies

The app uploads to path `{user_id}/avatar.jpg` and uses signed URLs for read. Use policies like:

```sql
-- Allow authenticated users to upload only into their own folder: {auth.uid()}/...
CREATE POLICY "Users can upload avatar to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- Allow authenticated users to update/upsert their own file (same path)
CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- Allow authenticated users to read their own file (for signed URL / client read)
CREATE POLICY "Users can read own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- Optional: allow delete so "Remove photo" can delete the object (app currently only clears avatar_url)
-- CREATE POLICY "Users can delete own avatar"
-- ON storage.objects FOR DELETE TO authenticated
-- USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);
```

If policies with these names already exist, drop them first or use different names:

```sql
DROP POLICY IF EXISTS "Users can upload avatar to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own avatar" ON storage.objects;
```

Then run the `CREATE POLICY` statements above.

## 3. Verify

After applying, upload a profile photo again from the driver app (Profile → Change avatar → Upload). The "new row violates row-level security policy" error should be resolved.
