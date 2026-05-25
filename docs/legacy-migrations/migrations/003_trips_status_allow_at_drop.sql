-- Fix: allow status 'at_drop' for driver "Reached at drop" step.
-- If your DB was created without at_drop in trips_status_check, this migration adds it.
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_status_check;
ALTER TABLE public.trips ADD CONSTRAINT trips_status_check CHECK (
  status = ANY (ARRAY[
    'pending_acceptance'::text,
    'assigned'::text,
    'in_transit'::text,
    'at_pickup'::text,
    'loading'::text,
    'at_drop'::text,
    'unloading'::text,
    'completed'::text,
    'cancelled'::text,
    'active'::text,
    'in_progress'::text
  ])
);
