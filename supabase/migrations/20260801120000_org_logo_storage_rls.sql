-- Org logo uploads use userprofiles bucket at orgs/{org_id}/logo-{timestamp}.jpg.
-- Existing avatar policies only allow {auth.uid()}/... — add owner-scoped org logo policies.

DROP POLICY IF EXISTS "Org owners can upload org logo" ON storage.objects;
DROP POLICY IF EXISTS "Org owners can update org logo" ON storage.objects;
DROP POLICY IF EXISTS "Org owners can delete org logo" ON storage.objects;

CREATE POLICY "Org owners can upload org logo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = 'orgs'
  AND EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = ((storage.foldername(name))[2])::uuid
      AND o.owner_id = auth.uid()
  )
);

CREATE POLICY "Org owners can update org logo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = 'orgs'
  AND EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = ((storage.foldername(name))[2])::uuid
      AND o.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = 'orgs'
  AND EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = ((storage.foldername(name))[2])::uuid
      AND o.owner_id = auth.uid()
  )
);

CREATE POLICY "Org owners can delete org logo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'userprofiles'
  AND (storage.foldername(name))[1] = 'orgs'
  AND EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = ((storage.foldername(name))[2])::uuid
      AND o.owner_id = auth.uid()
  )
);
