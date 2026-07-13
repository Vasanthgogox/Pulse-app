-- trip_documents: ensure table exists + SELECT RLS aligned with trip visibility.
--
-- Problem: Driver POD uploads insert into trip_documents + storage, but dispatchers
-- see an empty Documents tab when no SELECT policy allows rows for users who can
-- already read the trip (RLS on trips). Legacy table DDL lived only under migrations/
-- (not supabase/migrations), so some linked DBs never got the table.
--
-- Fix: CREATE TABLE IF NOT EXISTS + one SELECT policy using EXISTS (SELECT 1 FROM trips …)
-- so anyone who passes trips SELECT RLS can read document metadata for that trip.

-- ---------------------------------------------------------------------------
-- Table (idempotent; matches migrations/002_driver_trip_documents_policy.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  trip_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz DEFAULT now() NOT NULL,
  uploaded_by uuid
);

COMMENT ON TABLE public.trip_documents IS
  'Metadata for files in storage bucket trip-documents; one row per file (e.g. driver POD).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_documents_pkey') THEN
    ALTER TABLE public.trip_documents ADD CONSTRAINT trip_documents_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_documents_storage_path_unique') THEN
    ALTER TABLE public.trip_documents ADD CONSTRAINT trip_documents_storage_path_unique UNIQUE (storage_path);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_documents_trip_id_fkey') THEN
    ALTER TABLE public.trip_documents
      ADD CONSTRAINT trip_documents_trip_id_fkey
      FOREIGN KEY (trip_id) REFERENCES public.trips (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_documents_uploaded_by_fkey') THEN
    ALTER TABLE public.trip_documents
      ADD CONSTRAINT trip_documents_uploaded_by_fkey
      FOREIGN KEY (uploaded_by) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_id ON public.trip_documents (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_uploaded ON public.trip_documents (trip_id, uploaded_at DESC);

ALTER TABLE public.trip_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_documents TO authenticated;
GRANT ALL ON public.trip_documents TO service_role;

-- ---------------------------------------------------------------------------
-- SELECT: same visibility as trips (inner query is subject to trips RLS).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Suppliers can view their trip documents" ON public.trip_documents;
-- Replaced broken policy (trips.supplier_id is suppliers.id, not auth.uid()).

DROP POLICY IF EXISTS "Users can read trip_documents for trips they can read" ON public.trip_documents;

CREATE POLICY "Users can read trip_documents for trips they can read"
  ON public.trip_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_documents.trip_id
    )
  );

COMMENT ON POLICY "Users can read trip_documents for trips they can read" ON public.trip_documents IS
  'Dispatchers, drivers, supplier org, linked client org: anyone who can SELECT the trip row can list its trip_documents.';
