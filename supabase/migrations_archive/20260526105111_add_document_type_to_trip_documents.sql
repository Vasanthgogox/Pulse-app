-- Discriminate trip_documents by business role (POD vs manifest, etc.).
-- Idempotent: matches remote history version 20260526105111.

ALTER TABLE public.trip_documents
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'pod';

ALTER TABLE public.trip_documents
  DROP CONSTRAINT IF EXISTS trip_documents_type_check;

ALTER TABLE public.trip_documents
  ADD CONSTRAINT trip_documents_type_check
  CHECK (
    document_type = ANY (
      ARRAY[
        'manifest'::text,
        'pod'::text,
        'invoice'::text,
        'eway_bill'::text,
        'loading_slip'::text
      ]
    )
  );
