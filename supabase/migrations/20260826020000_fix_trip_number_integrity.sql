-- Fix: trip number generation integrity
--
-- Bugs resolved:
--   1. Drop V1 overload of create_trip_from_direct_quote(uuid) — V2 with DEFAULT NULL
--      covers all callers; V1 was reachable without the optional arg and had no row locks.
--   2. Add partial unique index trips_one_per_indent — DB-enforces one trip per indent.
--      Application-layer idempotency checks are advisory only; this is the invariant owner.
--   3. Replace V2 create_trip_from_direct_quote with idempotent unique_violation handler:
--      concurrent inserts that race on the new index return the winner's row instead of 500.
--   4. Revoke public EXECUTE on next_trip_number() — internal counter utility only;
--      public exposure allows callers to advance the counter without creating a trip (gaps).
--   5. Fix counter sync regex in retry loop: '^TRP[0-9]+$' missed old date-format trip
--      numbers; replaced with trailing-number extraction that is format-agnostic.
--   6. Remove column_exists() from set_trip_number trigger — catalog lookup on every INSERT;
--      both columns are permanent, direct assignment is correct.

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1: Drop old overload (no row locks, race-prone idempotency check)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_trip_from_direct_quote(uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2: One trip per indent — DB-level invariant
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_per_indent
  ON public.trips (indent_id)
  WHERE indent_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 3 + 5: Idempotent V2 with graceful unique_violation + format-agnostic
--            counter sync regex
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_trip_from_direct_quote(
  p_quote_id uuid,
  p_vehicle_display_number text DEFAULT NULL
)
RETURNS SETOF trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote              public.direct_quotes%ROWTYPE;
  v_indent             public.indents%ROWTYPE;
  v_supplier_id        uuid;
  v_org_id             uuid;
  v_trip               public.trips%ROWTYPE;
  v_vehicle_display    text;
  v_try                integer := 0;
  v_actor_user_id      uuid := auth.uid();
  v_created_by_user_id uuid := NULL;
  v_bidder_org_name    text;
BEGIN
  v_vehicle_display := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  IF v_actor_user_id IS NOT NULL THEN
    INSERT INTO public.users (id, name)
    VALUES (v_actor_user_id, 'User')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT id INTO v_created_by_user_id
  FROM public.users
  WHERE id = v_actor_user_id
  LIMIT 1;

  -- Lock quote and indent rows to serialize concurrent calls for the same indent
  SELECT * INTO v_quote FROM public.direct_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct quote not found';
  END IF;
  IF (v_quote.status IS NULL OR lower(v_quote.status) <> 'accepted') THEN
    RAISE EXCEPTION 'Quote must be accepted before creating a trip';
  END IF;

  SELECT * INTO v_indent FROM public.indents WHERE id = (v_quote).indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent not found';
  END IF;

  v_org_id := v_indent.organization_id;

  IF NOT (
    public.is_org_member(v_org_id) OR public.is_org_member((v_quote).bidder_organization_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to create trip from this quote';
  END IF;

  -- Idempotency: if trip already exists for this indent, update and return it
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = (v_quote).indent_id
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.trips
    SET
      driver_id = COALESCE((v_quote).driver_id, driver_id),
      vehicle_id = COALESCE((v_quote).vehicle_id, vehicle_id),
      updated_at = now(),
      vehicle_display_number = CASE
        WHEN v_vehicle_display IS NOT NULL THEN v_vehicle_display
        ELSE vehicle_display_number
      END
    WHERE id = (v_trip).id;
    SELECT * INTO v_trip FROM public.trips WHERE id = (v_trip).id;
    UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  -- Resolve or auto-create supplier row linked to bidder org
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = (v_quote).bidder_organization_id
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    SELECT COALESCE(NULLIF(TRIM(o.name), ''), 'Supplier')
    INTO v_bidder_org_name
    FROM public.organizations o
    WHERE o.id = (v_quote).bidder_organization_id;

    INSERT INTO public.suppliers (
      organization_id, linked_organization_id, name, is_active, is_verified
    )
    VALUES (
      v_org_id, (v_quote).bidder_organization_id,
      COALESCE(v_bidder_org_name, 'Supplier'), true, false
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_supplier_id;

    IF v_supplier_id IS NULL THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE organization_id = v_org_id
        AND linked_organization_id = (v_quote).bidder_organization_id
      LIMIT 1;
    END IF;
  END IF;

  LOOP
    v_try := v_try + 1;
    BEGIN
      INSERT INTO public.trips (
        organization_id, owner_user_id, created_by_user_id,
        trip_number, indent_id, source,
        pickup_area, drop_location, client_name,
        client_price, supplier_rate, supplier_id,
        driver_id, vehicle_id, status,
        pickup_date, load_type, vehicle_display_number,
        platform_fee, driver_commission, payment_status, amount_paid
      ) VALUES (
        v_org_id, (v_indent).owner_user_id, v_created_by_user_id,
        '', (v_quote).indent_id, 'direct_quote',
        coalesce((v_indent).pickup_area, ''), coalesce((v_indent).drop_location, ''),
        coalesce((v_indent).client_name, ''),
        coalesce((v_indent).client_price, 0), coalesce((v_quote).amount, 0), v_supplier_id,
        (v_quote).driver_id, (v_quote).vehicle_id, 'assigned',
        (v_indent).pickup_date, coalesce((v_indent).load_type, ''),
        v_vehicle_display, 0, 0, 'pending', 0
      )
      RETURNING * INTO v_trip;

      UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;
      RETURN NEXT v_trip;
      RETURN;

    EXCEPTION
      WHEN unique_violation THEN
        -- Two cases:
        --   (a) trips_one_per_indent fired: concurrent insert won; return that trip
        --   (b) trip_number collision: counter drifted; sync and retry
        SELECT t.* INTO v_trip
        FROM public.trips t
        WHERE t.indent_id = (v_quote).indent_id
        LIMIT 1;
        IF FOUND THEN
          UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;
          RETURN NEXT v_trip;
          RETURN;
        END IF;

        -- Case (b): sync counter to actual max, then retry
        INSERT INTO public.organization_counters (organization_id, trip_seq)
        VALUES (v_org_id, 0)
        ON CONFLICT (organization_id) DO NOTHING;

        UPDATE public.organization_counters oc
        SET trip_seq = greatest(
          oc.trip_seq,
          coalesce((
            SELECT max(
              CASE
                WHEN t.trip_number ~ '[0-9]+$'
                THEN (regexp_match(t.trip_number, '([0-9]+)$'))[1]::bigint
                ELSE 0
              END
            )
            FROM public.trips t
            WHERE t.organization_id = v_org_id
          ), 0)
        )
        WHERE oc.organization_id = v_org_id;

        IF v_try >= 3 THEN
          RAISE EXCEPTION 'Could not create trip: repeated unique conflict after counter sync';
        END IF;
    END;
  END LOOP;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 4: Revoke public access to next_trip_number (internal only)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.next_trip_number(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_trip_number(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_trip_number(uuid) FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 6: Remove column_exists() catalog lookup from set_trip_number trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_trip_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  seq bigint;
BEGIN
  IF NEW.trip_number IS NULL OR trim(NEW.trip_number) = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;

    UPDATE public.organization_counters
    SET trip_seq = trip_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING trip_seq INTO seq;

    NEW.trip_number     := 'TRP' || lpad(seq::text, 3, '0');
    NEW.display_trip_id := NEW.trip_number;
  END IF;
  RETURN NEW;
END;
$function$;
