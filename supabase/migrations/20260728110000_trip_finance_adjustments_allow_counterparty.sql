-- Allow a trip's carrier (counterparty) to post its own finance adjustments.
--
-- Why: two rules made this impossible, so the "+ SALE / + DRIVER" buttons on the
-- trip-detail Finance Hub could never succeed for a non-owner:
--   1. RLS `is_org_member(organization_id)` — the carrier is not a member of the
--      shipper's org, so stamping the shipper's org is rejected.
--   2. trigger check_trip_finance_adjustment_org_match — required
--      adjustment.organization_id = trips.organization_id, so stamping the
--      carrier's OWN org is rejected too.
-- Either choice failed. Measured before this migration: 14 adjustment rows
-- exist, 14 belong to the trip owner and 0 to a counterparty — this path has
-- never worked, so nothing depends on the current behaviour.
--
-- What changes: the trigger now also accepts the org linked to the trip via
-- trips.supplier_id -> suppliers.linked_organization_id. That is the carrier
-- that won the load and is settling against this trip. Each side then owns its
-- own adjustment lines, which is what the Shared Ledger's You-vs-They split
-- already assumes (trip_finance_adjustments.organization_id is the "owning org"
-- used for that split).
--
-- Deliberately narrow:
--   * Only the directly linked carrier qualifies — not "any org", not partners
--     of partners. An unrelated org still cannot attach rows to a trip.
--   * RLS is UNCHANGED. A carrier can only write rows stamped with an org it is
--     a member of, so it cannot forge lines on the shipper's behalf.
--   * The owner path is untouched: owner-stamped rows still pass exactly as before.
--
-- Net effect: an adjustment must be stamped either by the trip owner or by the
-- trip's linked carrier, and (via RLS) only by a member of that org.

CREATE OR REPLACE FUNCTION public.check_trip_finance_adjustment_org_match()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  -- Trip owner: unchanged.
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
