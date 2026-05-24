# Avatar storage bucket – RLS policies

If you see **"new row violates row-level security policy"** when uploading a profile photo in the app, the Supabase Storage bucket `userprofiles` exists but RLS policies are missing or too strict.

Apply the following in your Supabase project (Dashboard → SQL Editor, or add a migration in Q-unified-base).

## 1. Ensure the bucket exists

Create the bucket if needed (Dashboard → Storage → New bucket, name: `userprofiles`, **Private**).

## 2. Storage RLS policies

The app uploads to path `{user_id}/avatar.jpg` and uses signed URLs for read. Use policies like:

```sql
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
-- CREATE POLICY "Users can delete own avatar"
-- ON storage.objects FOR DELETE TO authenticated
-- USING (bucket_id = 'userprofiles' AND (storage.foldername(name))[1] = (auth.uid())::text);
```

If policies with these names already exist, drop them first or use different names:

```sql
DROP POLICY IF EXISTS "Users can upload avatar to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own avatar" ON storage.objects;
```

Then run the `CREATE POLICY` statements above.

## 3. Org logo uploads (`orgs/{org_id}/logo-*.jpg`)

Organization logos upload to the same `userprofiles` bucket under `orgs/{org_id}/...`.
Avatar policies above only allow `{auth.uid()}/...`, so org logo uploads need separate policies (migration `20260801120000_org_logo_storage_rls.sql`):

```sql
-- Org owners can INSERT/UPDATE/DELETE orgs/{their_org_id}/...
CREATE POLICY "Org owners can upload org logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = 'orgs'
  AND EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = ((storage.foldername(name))[2])::uuid
      AND o.owner_id = auth.uid()
  )
);
-- See migration for UPDATE/DELETE variants.
```

Reads are already covered by the public read policy on `userprofiles`.

## 4. Verify

After applying, upload a profile photo again from the driver app (Profile → Change avatar → Upload). The "new row violates row-level security policy" error should be resolved.

For org logos: Profile → Org Logo → pick an image. Only the **organization owner** can upload (matches `organizations` UPDATE RLS).
