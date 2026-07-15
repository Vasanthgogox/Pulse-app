-- Idempotent fix for columns referenced in CLIENT_COLUMNS / DRIVER_COLUMNS
-- that are missing from the live DB, causing "column does not exist" errors
-- and triggering the crash loop.

-- drivers: emergency contact fields
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS emergency_name    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

-- clients: integrated-org display fields (populated by get_clients_with_profiles RPC)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS avatar_url       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_seed      TEXT,
  ADD COLUMN IF NOT EXISTS owner_full_name  TEXT;

-- suppliers: owner display field (populated by get_suppliers_with_profiles RPC)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS owner_full_name  TEXT;
