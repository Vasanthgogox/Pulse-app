-- Enable RLS on the default partition of trip_location_checkpoints.
-- The parent table already has RLS + policies; each Postgres partition
-- must have RLS enabled independently to prevent direct-partition access bypass.
ALTER TABLE public.trip_location_checkpoints_default ENABLE ROW LEVEL SECURITY;
