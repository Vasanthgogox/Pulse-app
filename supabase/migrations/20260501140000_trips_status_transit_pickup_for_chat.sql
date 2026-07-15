-- Driver "transit" step must change `trips.status` (was in_progress → in_progress, so chat never fired).
-- Expands allowable status enum to include picked_up/in_transit and common legacy literals.

ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_status_check CHECK (
    status = ANY (
      ARRAY[
        'draft',
        'pending_acceptance',
        'assigned',
        'in_progress',
        'picked_up',
        'in_transit',
        'transit',
        'at_pickup',
        'loading',
        'at_drop',
        'unloading',
        'completed',
        'cancelled',
        'delivered',
        'done',
        'active'
      ]::text[]
    )
  );

COMMENT ON CONSTRAINT trips_status_check ON public.trips IS
  'Trip lifecycle statuses; in_transit + picked_up unblock driver chat broadcasts. Legacy literals kept for existing rows.';
