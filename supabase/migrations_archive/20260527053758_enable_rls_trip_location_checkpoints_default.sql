-- Enable RLS on the default partition of trip_location_checkpoints.
-- The parent table already has RLS + policies; each Postgres partition
-- must have RLS enabled independently to prevent direct-partition access bypass.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trip_location_checkpoints_default') THEN
    ALTER TABLE public.trip_location_checkpoints_default ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
