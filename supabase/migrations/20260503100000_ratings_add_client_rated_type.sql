-- Allow rated_type = 'client' so suppliers/orgs can rate their clients.
-- Previously only 'supplier' and 'driver' were allowed, causing client ratings
-- to fail at the DB level and fall back silently to AsyncStorage only.

ALTER TABLE public.ratings
  DROP CONSTRAINT IF EXISTS ratings_rated_type_check,
  ADD CONSTRAINT ratings_rated_type_check
    CHECK (rated_type IN ('supplier', 'driver', 'client'));

COMMENT ON COLUMN public.ratings.rated_type IS
  'supplier = rated by client; driver = rated by supplier or org; client = rated by supplier or org.';
