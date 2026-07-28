-- Carry the indent's weight onto trips created from an indent, as trips.load_tons.
--
-- Why: all three trip-creation RPCs (create_trip_from_direct_quote in its 1-arg
-- and 2-arg forms, and create_trip_from_assigned_indent) copy pickup_area /
-- drop_location / client_name / client_price / pickup_date / load_type from the
-- indent, but none copies weight. Measured before this migration: 0 of 57
-- indent-created trips had load_tons set, versus 32 of 64 manually-created
-- trips. A supplier could enter tons on the Deploy Load step, have it saved to
-- the indent, and still get a trip with no tonnage.
--
-- Unit conversion is the subtle part:
--   indents.weight  is KILOGRAMS  (6t stored as 6000)
--   trips.load_tons is TONS       (6t stored as 6)
-- Hence weight / 1000.0, with ::numeric division so 6500 kg -> 6.5 t rather
-- than truncating to 6.
--
-- Implemented as a BEFORE INSERT trigger rather than by editing the three RPC
-- bodies. Reasons:
--   * The three INSERT statements differ in column order, whitespace, and
--     variable syntax (v_indent.x vs (v_indent).x), so a text patch over
--     pg_get_functiondef is unreliable, and re-pasting ~150 lines of plpgsql
--     each risks silently dropping the trip_number retry loop or the
--     idempotency branch.
--   * One trigger covers every current and future insert path.
--
-- Deliberately conservative:
--   * Only fills when load_tons IS NULL, so an explicit value (including one a
--     user typed on a manual trip) is never overwritten.
--   * Only acts when indent_id is present and the indent has a positive weight.
--   * Leaves load_tons NULL when weight is absent or non-positive.
--
-- Existing trips are NOT backfilled here; that is a separate data decision.

CREATE OR REPLACE FUNCTION public.trips_fill_load_tons_from_indent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_weight_kg numeric;
BEGIN
  -- Respect any explicitly supplied tonnage.
  IF NEW.load_tons IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.indent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.weight INTO v_weight_kg
  FROM public.indents i
  WHERE i.id = NEW.indent_id;

  IF v_weight_kg IS NOT NULL AND v_weight_kg > 0 THEN
    -- kg -> tons; ::numeric keeps fractional tonnage (6500 kg -> 6.5).
    NEW.load_tons := (v_weight_kg)::numeric / 1000.0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_fill_load_tons_from_indent ON public.trips;

CREATE TRIGGER trips_fill_load_tons_from_indent
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_fill_load_tons_from_indent();
