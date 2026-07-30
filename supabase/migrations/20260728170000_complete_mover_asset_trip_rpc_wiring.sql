-- ============================================================================
-- Completes Section 2 of 20261221000000_direct_quote_deploy_creates_mover_asset_trip.sql
--
-- That migration shipped Sections 0 (trigger exemption), 1 (_ensure_mover_asset_trip
-- helper) and 3 (one-time backfill), but left Section 2 — the RPC wiring — as a
-- comment block only, pending regeneration against live function definitions.
-- This migration completes it.
--
-- ROOT CAUSE (verified on live DB 2026-07-28):
--   Row B (the mover's own source='mover_asset' finance/expense trip) was only
--   ever created by CLIENT code — features/network/hooks/useTripDeployment.ts,
--   gated on `isMover = load.organization_id !== orgId`. That gate means Row B
--   is created ONLY when the mover self-deploys. When the AGGREGATOR deploys on
--   the mover's behalf, isMover is false and Row B is silently skipped, leaving
--   the mover looking at the aggregator's settlement row with no Expense Hub.
--
--   Evidence: all 13 existing source='mover_asset' rows have indent_id IS NULL
--   (manual/self deploys). Zero came from an indent deploy path. NIH250-TRP-093,
--   NIH250-TRP-091 and PAP127-TRP-045 (all deployed after the 2026-07-23
--   backfill) have no Row B at all.
--
-- FIX:
--   Both create_trip_from_direct_quote overloads already stamp trip_payout_mode
--   (added by 20260728100000), so only the _ensure_mover_asset_trip call is
--   missing. Add it on every return path — idempotent-existing, fresh-insert,
--   and the unique_violation recovery path — so Row B is created in the SAME
--   transaction as Row A regardless of which org deploys.
--
--   apply_roster_deploy_from_direct_quote needs no change: it delegates to
--   create_trip_from_direct_quote(p_quote_id, NULL::text) and inherits the fix.
--
-- Bodies below are regenerated from live pg_get_functiondef() output captured
-- 2026-07-28, per the parent migration's instruction to avoid clobbering
-- upstream changes. The ONLY additions are the PERFORM _ensure_mover_asset_trip
-- calls, each marked `-- >>> Section 2`.
--
-- NOT DONE HERE (follow-up, needs a real deploy test first):
--   Delete the now-redundant client-side createMoverAssetTrip() block at
--   features/network/hooks/useTripDeployment.ts:86-111. It stays harmless while
--   both run — the helper is idempotent on (organization_id, source_indent_id) —
--   but the DB should become the single source of truth.
-- ============================================================================

BEGIN;

-- ── create_trip_from_direct_quote(uuid, text) — primary overload ───────────────
CREATE OR REPLACE FUNCTION public.create_trip_from_direct_quote(
  p_quote_id uuid,
  p_vehicle_display_number text DEFAULT NULL::text
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

    -- >>> Section 2: mover's own asset trip (idempotent; no-op if it exists).
    -- Uses the trip's resolved driver/vehicle rather than the quote's, since the
    -- idempotent path may have just filled them in from a later assignment.
    PERFORM public._ensure_mover_asset_trip(
      (v_quote).indent_id,
      (v_trip).driver_id,
      (v_trip).vehicle_id,
      (v_trip).vehicle_display_number,
      v_created_by_user_id
    );

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
        client_price, supplier_rate, supplier_id, trip_payout_mode,
        driver_id, vehicle_id, status,
        pickup_date, load_type, vehicle_display_number,
        platform_fee, driver_commission, payment_status, amount_paid
      ) VALUES (
        v_org_id, (v_indent).owner_user_id, v_created_by_user_id,
        '', (v_quote).indent_id, 'direct_quote',
        coalesce((v_indent).pickup_area, ''), coalesce((v_indent).drop_location, ''),
        coalesce((v_indent).client_name, ''),
        coalesce((v_indent).client_price, 0), coalesce((v_quote).amount, 0), v_supplier_id,
        CASE WHEN (v_quote).driver_id IS NOT NULL AND (v_quote).vehicle_id IS NOT NULL THEN 'asset' ELSE 'market' END,
        (v_quote).driver_id, (v_quote).vehicle_id, 'assigned',
        (v_indent).pickup_date, coalesce((v_indent).load_type, ''),
        v_vehicle_display, 0, 0, 'pending', 0
      )
      RETURNING * INTO v_trip;

      UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;

      -- >>> Section 2: mover's own asset trip, same transaction as Row A.
      PERFORM public._ensure_mover_asset_trip(
        (v_quote).indent_id,
        (v_quote).driver_id,
        (v_quote).vehicle_id,
        v_vehicle_display,
        v_created_by_user_id
      );

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

          -- >>> Section 2: concurrent-insert path still needs Row B. The winning
          -- transaction may not have committed its own _ensure call yet; the
          -- helper's (organization_id, source_indent_id) guard makes a double
          -- attempt a no-op rather than a duplicate.
          PERFORM public._ensure_mover_asset_trip(
            (v_quote).indent_id,
            (v_trip).driver_id,
            (v_trip).vehicle_id,
            (v_trip).vehicle_display_number,
            v_created_by_user_id
          );

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

-- ── create_trip_from_direct_quote(uuid) — legacy single-arg overload ───────────
-- Kept in sync so any caller still resolving to this signature also gets Row B.
CREATE OR REPLACE FUNCTION public.create_trip_from_direct_quote(p_quote_id uuid)
RETURNS SETOF trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote public.direct_quotes%ROWTYPE;
  v_indent public.indents%ROWTYPE;
  v_supplier_id uuid;
  v_org_id uuid;
  v_trip public.trips%ROWTYPE;
  v_shipper_org_name text;
  v_bidder_org_name text;
BEGIN
  SELECT * INTO v_quote FROM public.direct_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct quote not found';
  END IF;
  IF (v_quote.status IS NULL OR lower(v_quote.status) <> 'accepted') THEN
    RAISE EXCEPTION 'Quote must be accepted before creating a trip';
  END IF;

  SELECT * INTO v_indent FROM public.indents WHERE id = v_quote.indent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent not found';
  END IF;

  v_org_id := v_indent.organization_id;

  -- Caller must be member of indent org (shipper) or bidder org (supplier)
  IF NOT (
    public.is_org_member(v_org_id) OR public.is_org_member(v_quote.bidder_organization_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to create trip from this quote';
  END IF;

  -- Idempotent: return existing trip for this indent if any
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = v_quote.indent_id
  LIMIT 1;
  IF FOUND THEN
    -- >>> Section 2: mover's own asset trip (idempotent).
    PERFORM public._ensure_mover_asset_trip(
      v_quote.indent_id,
      (v_trip).driver_id,
      (v_trip).vehicle_id,
      (v_trip).vehicle_display_number,
      NULL
    );
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  -- Resolve org names for supplier/client rows
  SELECT coalesce(nullif(trim(o.name), ''), 'Connected') INTO v_shipper_org_name
  FROM public.organizations o WHERE o.id = v_org_id;

  SELECT coalesce(nullif(trim(o.name), ''), 'Connected') INTO v_bidder_org_name
  FROM public.organizations o WHERE o.id = v_quote.bidder_organization_id;

  -- Ensure organization_relations row exists (shipper → supplier_client direction).
  -- Mirrors what on_connection_request_approved does for request_shipper_client.
  INSERT INTO public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
  VALUES (v_quote.bidder_organization_id, v_org_id, 'supplier_client', 'active')
  ON CONFLICT (from_organization_id, to_organization_id, relation_type)
  DO UPDATE SET status = 'active', updated_at = now();

  -- Ensure the shipper has an integrated suppliers row for the bidder org.
  INSERT INTO public.suppliers (organization_id, name, linked_organization_id, supplier_type, updated_at)
  VALUES (v_org_id, v_bidder_org_name, v_quote.bidder_organization_id, 'integrated', now())
  ON CONFLICT (organization_id, linked_organization_id)
    WHERE linked_organization_id IS NOT NULL
  DO UPDATE SET
    supplier_type = 'integrated',
    linked_organization_id = v_quote.bidder_organization_id,
    updated_at = now();

  -- Resolve supplier_id: shipper's supplier row linked to bidder org (now guaranteed to exist)
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = v_quote.bidder_organization_id
  LIMIT 1;

  INSERT INTO public.trips (
    organization_id,
    trip_number,
    indent_id,
    source,
    pickup_area,
    drop_location,
    client_name,
    client_price,
    supplier_rate,
    supplier_id,
    trip_payout_mode,
    driver_id,
    vehicle_id,
    status,
    pickup_date,
    load_type
  ) VALUES (
    v_org_id,
    '',
    v_quote.indent_id,
    'direct_quote',
    coalesce(v_indent.pickup_area, ''),
    coalesce(v_indent.drop_location, ''),
    coalesce(v_indent.client_name, ''),
    coalesce(v_indent.client_price, 0),
    coalesce(v_quote.amount, 0),
    v_supplier_id,
    CASE WHEN v_quote.driver_id IS NOT NULL AND v_quote.vehicle_id IS NOT NULL THEN 'asset' ELSE 'market' END,
    v_quote.driver_id,
    v_quote.vehicle_id,
    'assigned',
    v_indent.pickup_date,
    coalesce(v_indent.load_type, '')
  )
  RETURNING * INTO v_trip;

  -- >>> Section 2: mover's own asset trip, same transaction as Row A.
  PERFORM public._ensure_mover_asset_trip(
    v_quote.indent_id,
    v_quote.driver_id,
    v_quote.vehicle_id,
    NULL,
    NULL
  );

  RETURN NEXT v_trip;
  RETURN;
END;
$function$;

-- ── Backfill: aggregator trips deployed since the 2026-07-23 one-time run ──────
-- Same shape as Section 3 of the parent migration. Idempotent via the helper's
-- (organization_id, source_indent_id) guard, so re-running is a no-op.
--
-- Known gaps at authoring time (verified 2026-07-28):
--   NIH250-TRP-093  nihas logs  → mover Paperkraft
--   NIH250-TRP-091  nihas logs  → mover Paperkraft
--   PAP127-TRP-045  Paperkraft  → mover nihas logs
--
-- Guarded: this is a one-time repair for specific real production trips
-- (listed above), and its query references trips.source_indent_id, a column
-- not added until 20260828200000_operational_identity_codes_phase1.sql (a
-- month later). Skip entirely on a from-scratch replay -- a fresh local DB
-- has none of these historical rows anyway, so the backfill would be a no-op
-- even if it could run; nothing to backfill-forward later.
DO $backfill$
DECLARE
  r RECORD;
  v_created integer := 0;
BEGIN
  IF to_regclass('public.trips') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('public.trips')
      AND attname = 'source_indent_id' AND attnum > 0 AND NOT attisdropped
  ) THEN
    RAISE NOTICE 'skipping mover asset trip backfill: trips.source_indent_id not present yet (fresh replay)';
    RETURN;
  END IF;

  FOR r IN
    SELECT agg.indent_id, agg.driver_id, agg.vehicle_id, agg.vehicle_display_number,
           agg.created_by_user_id, agg.id AS agg_trip_id,
           (agg.driver_id IS NOT NULL AND agg.vehicle_id IS NOT NULL) AS own_driver_and_vehicle
    FROM public.trips agg
    JOIN public.indents i ON i.id = agg.indent_id
    WHERE agg.source = 'direct_quote'
      AND agg.deleted_at IS NULL
      AND i.assigned_supplier_id IS NOT NULL
      AND agg.driver_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.trips m
        WHERE m.organization_id = i.assigned_supplier_id
          AND m.source_indent_id = agg.indent_id
          AND m.deleted_at IS NULL
      )
  LOOP
    PERFORM public._ensure_mover_asset_trip(
      r.indent_id, r.driver_id, r.vehicle_id, r.vehicle_display_number,
      r.created_by_user_id);
    v_created := v_created + 1;

    -- Stamp trip_payout_mode where the deploy predates 20260728100000.
    -- Mirrors the RPC's own CASE: own driver AND vehicle -> asset, else market.
    -- The parent migration hardcoded 'asset' here, which was wrong for rows
    -- assigned by typed plate (vehicle_id NULL) — those are market.
    UPDATE public.trips
      SET trip_payout_mode = CASE WHEN r.own_driver_and_vehicle THEN 'asset' ELSE 'market' END
      WHERE id = r.agg_trip_id AND trip_payout_mode IS NULL;
  END LOOP;

  RAISE NOTICE 'mover asset trip backfill: % aggregator trip(s) processed', v_created;
END;
$backfill$;

COMMIT;
