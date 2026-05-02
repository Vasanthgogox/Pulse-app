-- Fixes DELETE /rest/v1/trip_documents → 404 when the table was never created in this project
-- (older SQL lived under migrations/ but not supabase/migrations). PostgREST returns 404 if the
-- relation is missing from the exposed schema.

CREATE TABLE IF NOT EXISTS public.trip_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT trip_documents_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_id ON public.trip_documents USING btree (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_uploaded ON public.trip_documents USING btree (trip_id, uploaded_at DESC);

ALTER TABLE public.trip_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_documents TO service_role;

-- Baseline RLS if this table was empty / policies never applied (e.g. prior migration failed on DROP POLICY).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_documents'
      AND policyname = 'Authenticated users can select trip documents for visible trips'
  ) THEN
    CREATE POLICY "Authenticated users can select trip documents for visible trips"
      ON public.trip_documents
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.trips t
          WHERE t.id = trip_documents.trip_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trip_documents'
      AND policyname = 'Authenticated users can insert trip documents for their trips'
  ) THEN
    CREATE POLICY "Authenticated users can insert trip documents for their trips"
      ON public.trip_documents
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.trips t
          WHERE t.id = trip_documents.trip_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trip_documents'
      AND policyname = 'Authenticated users can manage trip documents for their trips'
  ) THEN
    CREATE POLICY "Authenticated users can manage trip documents for their trips"
      ON public.trip_documents
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.trips t
          WHERE t.id = trip_documents.trip_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trip_documents'
      AND policyname = 'Authenticated users can delete trip documents for their trips'
  ) THEN
    CREATE POLICY "Authenticated users can delete trip documents for their trips"
      ON public.trip_documents
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.trips t
          WHERE t.id = trip_documents.trip_id
        )
      );
  END IF;
END;
$$;

COMMENT ON TABLE public.trip_documents IS 'Metadata for files in trip-documents bucket; one row per file (POD, etc.).';
