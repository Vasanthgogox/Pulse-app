-- Compatibility hotfix for environments missing legacy columns referenced by app SQL/views.
-- Idempotent: safe to run multiple times.

-- drivers.license_number
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS license_number text;

-- clients.contact_percent (legacy typo in some queries; keep for compatibility)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contact_percent text;

UPDATE public.clients
SET contact_percent = contact_person
WHERE contact_percent IS NULL
  AND contact_person IS NOT NULL;

-- organizations.logo_url
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url text;

-- trip_finance_adjustments.voided_at + void_reason
ALTER TABLE public.trip_finance_adjustments
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- trips.display_trip_id
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS display_trip_id text;

UPDATE public.trips
SET display_trip_id = trip_number
WHERE (display_trip_id IS NULL OR btrim(display_trip_id) = '')
  AND trip_number IS NOT NULL
  AND btrim(trip_number) <> '';
