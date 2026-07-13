-- drivers: avatar fields referenced in DRIVER_COLUMNS constant and explicit selects
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS avatar_seed TEXT;

-- suppliers: avatar fields referenced in SUPPLIER_COLUMNS constant
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS avatar_seed TEXT;
