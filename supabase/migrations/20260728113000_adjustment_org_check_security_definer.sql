-- Make check_trip_finance_adjustment_org_match() SECURITY DEFINER.
--
-- Why: the trigger validates NEW.organization_id by looking up public.trips and
-- public.suppliers. It ran as the INVOKING user, so those lookups were filtered
-- by that user's own RLS. A carrier inserting an adjustment on the shipper's
-- trip cannot read the shipper's `suppliers` row, so the counterparty EXISTS
-- check found nothing and the trigger raised — even though the relationship
-- genuinely exists.
--
-- This is why the insert succeeded from a service_role connection (RLS bypassed)
-- but failed for the real user. Reproduced directly with
-- `set local role authenticated` + the user's jwt claims.
--
-- The same flaw was latent in the original owner-only version: it happened to
-- work only because a user can always read a trip in their own org, so the
-- lookup never needed rows they could not see.
--
-- A trigger that enforces an invariant must see the whole table to do so —
-- otherwise it silently rejects valid writes. SECURITY DEFINER is correct here
-- and does not widen anyone's access: the function only reads, returns no data
-- to the caller, and RLS on trip_finance_adjustments still independently
-- restricts which organization_id a user may write.
--
-- search_path stays pinned to '' with fully-qualified table names, so
-- SECURITY DEFINER cannot be hijacked via a mutable search_path.

CREATE OR REPLACE FUNCTION public.check_trip_finance_adjustment_org_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Trip owner.
  IF EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = NEW.trip_id
      AND t.organization_id = NEW.organization_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Carrier settling this trip: the org linked through trips.supplier_id.
  IF EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.suppliers s ON s.id = t.supplier_id
    WHERE t.id = NEW.trip_id
      AND s.linked_organization_id IS NOT NULL
      AND s.linked_organization_id = NEW.organization_id
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'trip_finance_adjustments: organization_id must be the trip owner or the trip''s linked carrier';
END;
$function$;
