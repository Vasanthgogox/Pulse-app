-- 1) Create trip_documents table if it doesn't exist (fixes "relation trip_documents does not exist").
-- 2) Allow drivers to manage trip_documents and storage for their assigned trips (POD upload).
--
-- Run in Supabase Dashboard → SQL Editor (so the role can alter storage.objects).
-- If you see "must be owner of relation objects", run this file in the Dashboard, not from another client.
-- Ensure the storage bucket "trip-documents" exists (Storage → New bucket).

-- ---------------------------------------------------------------------------
-- Function: driver_id_belongs_to_user (required by driver policies; skip if already exists)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_id_belongs_to_user(p_driver_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drivers
    WHERE id = p_driver_id AND user_id = p_user_id
  );
$$;

ALTER FUNCTION public.driver_id_belongs_to_user(uuid, uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.driver_id_belongs_to_user(uuid, uuid) IS 'Used by RLS: checks driver ownership (drivers.id = p_driver_id and drivers.user_id = p_user_id).';

GRANT EXECUTE ON FUNCTION public.driver_id_belongs_to_user(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.driver_id_belongs_to_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_id_belongs_to_user(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Table: trip_documents (skip if already exists)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."trip_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" text,
  "size_bytes" bigint,
  "uploaded_at" timestamptz DEFAULT now() NOT NULL,
  "uploaded_by" uuid
);

ALTER TABLE "public"."trip_documents" OWNER TO "postgres";
COMMENT ON TABLE "public"."trip_documents" IS 'Metadata for files stored in trip-documents bucket; one row per file.';

-- Constraints (ignore if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_documents_pkey') THEN
    ALTER TABLE "public"."trip_documents" ADD CONSTRAINT "trip_documents_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_documents_storage_path_unique') THEN
    ALTER TABLE "public"."trip_documents" ADD CONSTRAINT "trip_documents_storage_path_unique" UNIQUE ("storage_path");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_documents_trip_id_fkey') THEN
    ALTER TABLE "public"."trip_documents" ADD CONSTRAINT "trip_documents_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_documents_uploaded_by_fkey') THEN
    ALTER TABLE "public"."trip_documents" ADD CONSTRAINT "trip_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_trip_documents_trip_id" ON "public"."trip_documents" USING btree ("trip_id");
-- Composite index so list-by-trip with order by uploaded_at is fast (avoids slow sort).
CREATE INDEX IF NOT EXISTS "idx_trip_documents_trip_uploaded" ON "public"."trip_documents" USING btree ("trip_id", "uploaded_at" DESC);

ALTER TABLE "public"."trip_documents" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."trip_documents" TO "anon";
GRANT ALL ON TABLE "public"."trip_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_documents" TO "service_role";

-- ---------------------------------------------------------------------------
-- Driver policies (POD upload for assigned trips)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Drivers can manage trip documents for own trips" ON "public"."trip_documents";
CREATE POLICY "Drivers can manage trip documents for own trips"
  ON "public"."trip_documents"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "public"."trips" t
      WHERE t.id = trip_documents.trip_id
        AND t.driver_id IS NOT NULL
        AND public.driver_id_belongs_to_user(t.driver_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."trips" t
      WHERE t.id = trip_documents.trip_id
        AND t.driver_id IS NOT NULL
        AND public.driver_id_belongs_to_user(t.driver_id, auth.uid())
    )
  );

COMMENT ON POLICY "Drivers can manage trip documents for own trips" ON "public"."trip_documents"
  IS 'Allows integrated drivers to upload POD (proof of delivery) for trips assigned to them.';

-- Allow drivers to upload/read trip document files in storage for their assigned trip.
-- Path format: {trip_id}/{filename}
-- (Wrapped in block: if you get "must be owner of relation objects", run this file in
--  Supabase Dashboard → SQL Editor, which uses a role that can alter storage.objects.)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Drivers can manage trip document files for own trips" ON storage.objects;
  CREATE POLICY "Drivers can manage trip document files for own trips"
    ON storage.objects
    FOR ALL
    USING (
      bucket_id = 'trip-documents'
      AND EXISTS (
        SELECT 1 FROM public.trips t
        WHERE (t.id)::text = (storage.foldername(name))[1]
          AND t.driver_id IS NOT NULL
          AND public.driver_id_belongs_to_user(t.driver_id, auth.uid())
      )
    )
    WITH CHECK (
      bucket_id = 'trip-documents'
      AND EXISTS (
        SELECT 1 FROM public.trips t
        WHERE (t.id)::text = (storage.foldername(name))[1]
          AND t.driver_id IS NOT NULL
          AND public.driver_id_belongs_to_user(t.driver_id, auth.uid())
      )
    );
  RAISE NOTICE 'Storage policy "Drivers can manage trip document files for own trips" created.';
EXCEPTION
  WHEN insufficient_privilege OR OTHERS THEN
    RAISE NOTICE 'Skipped storage policy (run this script in Supabase Dashboard → SQL Editor to apply it): %', SQLERRM;
END $$;
