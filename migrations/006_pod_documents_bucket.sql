-- 006_pod_documents_bucket.sql
-- Creates the "pod-documents" storage bucket and corresponding RLS policies.
-- Run this in Supabase SQL Editor if you see "Bucket not found" when uploading Evidence (PODs).

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('pod-documents', 'pod-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS Policies for the bucket
-- Note: Adjust the access control as needed (e.g. restrict by org member if required),
-- but these provide standard authenticated access for dispatchers/suppliers to upload and read PODs.

-- Allow authenticated users to upload to pod-documents
CREATE POLICY "Authenticated users can upload pod documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pod-documents');

-- Allow authenticated users to read pod documents
CREATE POLICY "Authenticated users can read pod documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pod-documents');

-- Allow authenticated users to update pod documents
CREATE POLICY "Authenticated users can update pod documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'pod-documents');

-- Allow authenticated users to delete pod documents
CREATE POLICY "Authenticated users can delete pod documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pod-documents');

-- 3. (Optional) Ensure pod_attachments and trip_pods tables exist, just in case the backend schema is missing them.
CREATE TABLE IF NOT EXISTS public.trip_pods (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
    lr_number text,
    courier_name text,
    tracking_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'trip_pods' AND policyname = 'Enable all for authenticated'
    ) THEN
        ALTER TABLE public.trip_pods ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Enable all for authenticated" ON public.trip_pods TO authenticated USING (true) WITH CHECK (true);
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.pod_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
    lr_number text,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint,
    file_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Allow all authenticated users to insert/select/update pod_attachments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pod_attachments' AND policyname = 'Enable all for authenticated'
    ) THEN
        ALTER TABLE public.pod_attachments ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Enable all for authenticated" ON public.pod_attachments TO authenticated USING (true) WITH CHECK (true);
    END IF;
END
$$;
