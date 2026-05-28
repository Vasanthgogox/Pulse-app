-- Phase 1: Optional trip odometer verification (non-blocking).
-- Adds additive trip fields + extends trip_documents document_type allowlist.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS start_odometer_km numeric(10, 1),
  ADD COLUMN IF NOT EXISTS end_odometer_km numeric(10, 1),
  ADD COLUMN IF NOT EXISTS odometer_distance_km numeric(10, 1),
  ADD COLUMN IF NOT EXISTS gps_distance_km numeric(10, 1),
  ADD COLUMN IF NOT EXISTS distance_discrepancy_km numeric(10, 1),
  ADD COLUMN IF NOT EXISTS distance_source text,
  ADD COLUMN IF NOT EXISTS odometer_verification_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS odometer_notes text,
  ADD COLUMN IF NOT EXISTS odometer_updated_by uuid,
  ADD COLUMN IF NOT EXISTS odometer_updated_at timestamptz;

ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_distance_source_check;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_distance_source_check
  CHECK (
    distance_source = ANY (
      ARRAY[
        'odometer'::text,
        'gps'::text,
        'hybrid'::text,
        'estimated'::text
      ]
    ) OR distance_source IS NULL
  );

ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_odometer_verification_state_check;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_odometer_verification_state_check
  CHECK (
    odometer_verification_state = ANY (
      ARRAY[
        'none'::text,
        'partial'::text,
        'driver_verified'::text,
        'business_verified'::text,
        'gps_verified'::text
      ]
    )
  );

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
        'loading_slip'::text,
        'odometer_start_photo'::text,
        'odometer_end_photo'::text
      ]
    )
  );
