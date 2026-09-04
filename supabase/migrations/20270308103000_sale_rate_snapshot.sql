-- Persist client sale basis (₹/MT vs trip total) on indent + trip so
-- after-load weight can recompute client_price. Indent→trip RPCs copy
-- via trigger so we do not rewrite each deploy function.

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS lane_id uuid,
  ADD COLUMN IF NOT EXISTS sale_rate_basis text,
  ADD COLUMN IF NOT EXISTS sale_unit_rate numeric(12, 4);

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS lane_id uuid,
  ADD COLUMN IF NOT EXISTS sale_rate_basis text,
  ADD COLUMN IF NOT EXISTS sale_unit_rate numeric(12, 4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indents_client_id_fkey'
  ) THEN
    ALTER TABLE public.indents
      ADD CONSTRAINT indents_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indents_lane_id_fkey'
  ) THEN
    ALTER TABLE public.indents
      ADD CONSTRAINT indents_lane_id_fkey
      FOREIGN KEY (lane_id) REFERENCES public.client_lane_rates(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trips_lane_id_fkey'
  ) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_lane_id_fkey
      FOREIGN KEY (lane_id) REFERENCES public.client_lane_rates(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indents_sale_rate_basis_check'
  ) THEN
    ALTER TABLE public.indents
      ADD CONSTRAINT indents_sale_rate_basis_check
      CHECK (sale_rate_basis IS NULL OR sale_rate_basis IN ('per_mt', 'per_trip'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trips_sale_rate_basis_check'
  ) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_sale_rate_basis_check
      CHECK (sale_rate_basis IS NULL OR sale_rate_basis IN ('per_mt', 'per_trip'));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.indent_has_convertible_sale(p_indent public.indents)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(p_indent.client_price, 0) > 0
    OR (
      p_indent.sale_rate_basis = 'per_mt'
      AND COALESCE(p_indent.sale_unit_rate, 0) > 0
    );
$$;

CREATE OR REPLACE FUNCTION public.trips_apply_sale_rate_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_indent public.indents%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.indent_id IS NOT NULL THEN
    SELECT * INTO v_indent FROM public.indents WHERE id = NEW.indent_id;
    IF FOUND THEN
      NEW.client_id := COALESCE(NEW.client_id, v_indent.client_id);
      NEW.lane_id := COALESCE(NEW.lane_id, v_indent.lane_id);
      NEW.sale_rate_basis := COALESCE(NEW.sale_rate_basis, v_indent.sale_rate_basis);
      NEW.sale_unit_rate := COALESCE(NEW.sale_unit_rate, v_indent.sale_unit_rate);
      IF NEW.load_tons IS NULL AND COALESCE(v_indent.weight, 0) > 0 THEN
        NEW.load_tons := ROUND((v_indent.weight / 1000.0)::numeric, 3);
      END IF;
    END IF;
  END IF;

  IF NEW.sale_rate_basis = 'per_mt'
     AND COALESCE(NEW.sale_unit_rate, 0) > 0
     AND COALESCE(NEW.load_tons, 0) > 0
     AND (
       TG_OP = 'INSERT'
       OR OLD.load_tons IS DISTINCT FROM NEW.load_tons
       OR OLD.sale_unit_rate IS DISTINCT FROM NEW.sale_unit_rate
       OR OLD.sale_rate_basis IS DISTINCT FROM NEW.sale_rate_basis
     )
  THEN
    NEW.client_price := ROUND(NEW.sale_unit_rate * NEW.load_tons, 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_apply_sale_rate_snapshot ON public.trips;
CREATE TRIGGER trips_apply_sale_rate_snapshot
  BEFORE INSERT OR UPDATE OF load_tons, sale_unit_rate, sale_rate_basis, indent_id
  ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_apply_sale_rate_snapshot();

-- Relax "client_price > 0" on deploy RPCs so per-MT + weight-later indents convert.
DO $$
DECLARE
  r record;
  new_def text;
  old_snip text;
  new_snip text;
BEGIN
  old_snip := $old$IF coalesce(v_indent.client_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no client_price', p_indent_id;
  END IF;$old$;
  new_snip := $new$IF NOT public.indent_has_convertible_sale(v_indent) THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no client_price', p_indent_id;
  END IF;$new$;

  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'award_indent_to_trip',
        'create_trip_from_assigned_indent',
        'create_trip_from_direct_quote'
      )
  LOOP
    new_def := replace(pg_get_functiondef(r.oid), old_snip, new_snip);
    new_def := replace(
      new_def,
      $old2$IF coalesce((v_indent).client_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no client_price', p_indent_id;
  END IF;$old2$,
      new_snip
    );
    IF new_def IS DISTINCT FROM pg_get_functiondef(r.oid) THEN
      EXECUTE new_def;
    END IF;
  END LOOP;
END
$$;
