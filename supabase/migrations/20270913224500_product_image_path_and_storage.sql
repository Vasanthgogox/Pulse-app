-- Product catalog photos for Pulse Commerce.
-- Images live in the public org-assets bucket under product-images/<org_id>/...
-- so they can be read with getPublicUrl (same pattern as org logos).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_path text;

COMMENT ON COLUMN public.products.image_path IS
  'org-assets storage path, e.g. product-images/<organization_id>/<product_id>-<unix>.jpg';

UPDATE storage.buckets
SET file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 5242880)
WHERE id = 'org-assets';

DROP POLICY IF EXISTS "Org members can upload product images to org-assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update product images in org-assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete product images in org-assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can read product images in org-assets" ON storage.objects;

CREATE POLICY "Org members can upload product images to org-assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = 'product-images'
    AND public.is_org_member(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "Org members can update product images in org-assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = 'product-images'
    AND public.is_org_member(((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = 'product-images'
    AND public.is_org_member(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "Org members can delete product images in org-assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = 'product-images'
    AND public.is_org_member(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "Org members can read product images in org-assets"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = 'product-images'
    AND public.is_org_member(((storage.foldername(name))[2])::uuid)
  );
