-- Vehicle profile photo (storage path in userprofiles bucket) + optional preset seed.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_seed text;

COMMENT ON COLUMN public.vehicles.avatar_url IS
  'Storage path in userprofiles bucket (e.g. {userId}/vehicle-{vehicleId}-{ts}.jpg).';
COMMENT ON COLUMN public.vehicles.avatar_seed IS
  'DiceBear / preset avatar seed when no uploaded photo.';
