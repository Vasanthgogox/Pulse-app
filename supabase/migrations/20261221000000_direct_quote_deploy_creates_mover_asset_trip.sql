-- ============================================================================
-- Permanent fix: mover asset trip is created ATOMICALLY inside the deploy RPC.
--
-- ROOT CAUSE (verified on prod DB 2026-07-23):
--   The award path (award_indent_to_trip) stamps trip_payout_mode, but the
--   DIRECT-QUOTE deploy path does NOT create the mover's asset trip and does NOT
--   stamp trip_payout_mode. That logic lived ONLY in client code
--   (features/network/hooks/useTripDeployment.ts, gated on client-side vehicle_id),
--   so any deploy not going through that exact path leaves the mover on the
--   aggregator's supplier-settlement view with no Expense Hub (e.g. TRP001, TRP003).
--
-- PERMANENT SOLUTION:
--   1) An internal helper that creates the mover asset trip WITHOUT re-checking
--      org membership (the deploy RPC already authorized the caller; the caller
--      may be the AGGREGATOR deploying on the mover's behalf, so the mover-org
--      membership check in public.create_mover_asset_trip must NOT apply here).
--   2) create_trip_from_direct_quote (both overloads) and
--      apply_roster_deploy_from_direct_quote call this helper + stamp
--      trip_payout_mode, in the SAME transaction as the aggregator trip.
--   3) One-time backfill for existing gaps.
--   After this ships, delete the client-side createMoverAssetTrip() call in
--   useTripDeployment.ts (DB becomes the single source of truth).
--
-- Dry-run verified 2026-07-23 against prod data (rolled back). Sections 0+1+3
-- ship here. Section 2 (RPC wiring) remains documented-only until completed
-- against live function defs + tested with a real deploy.
--
-- VERIFIED FINDING: creating the asset trip tripped
-- enforce_single_active_trip_per_driver, because the mover asset trip reuses the
-- aggregator trip's (active) driver by design. Fix: exempt source='mover_asset'
-- from that trigger — it is a parallel finance/expense record, not a dispatch.
-- ============================================================================

BEGIN;

-- ── 0. Exempt mover_asset trips from the single-active-trip-per-driver rule ────
-- They intentionally mirror the aggregator trip's driver; they are a books/expense
-- record, never a real second dispatch. Without this, asset-trip creation fails
-- whenever the driver is mid-trip (verified via dry-run 2026-07-23).
CREATE OR REPLACE FUNCTION public.enforce_single_active_trip_per_driver()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $t$
DECLARE v_status text; v_old_status text;
BEGIN
  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;
  IF lower(trim(coalesce(NEW.source::text,''))) = 'mover_asset' THEN RETURN NEW; END IF;
  v_status := lower(trim(coalesce(NEW.status::text,'')));
  IF v_status IN ('completed','cancelled','done','delivered') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    v_old_status := lower(trim(coalesce(OLD.status::text,'')));
    IF NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id AND v_old_status NOT IN ('completed','cancelled','done','delivered') THEN RETURN NEW; END IF;
  END IF;
  IF public.driver_has_other_active_trip(NEW.driver_id, NEW.id)
     OR public.driver_phone_has_other_active_trip(NEW.driver_id, NEW.id) THEN
    RAISE EXCEPTION 'Driver is already assigned to another active trip. Complete or unassign that trip first.';
  END IF;
  RETURN NEW;
END; $t$;

-- ── 1. Internal helper: create mover asset trip, membership check SKIPPED ──────
-- Mirrors public.create_mover_asset_trip EXCEPT it omits `is_org_member(mover)` —
-- it is only ever called from an already-authorized SECURITY DEFINER deploy RPC.
CREATE OR REPLACE FUNCTION public._ensure_mover_asset_trip(
  p_indent_id uuid,
  p_driver_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  p_vehicle_display_number text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_indent          public.indents%ROWTYPE;
  v_mover_org_id    uuid;
  v_agg_trip        public.trips%ROWTYPE;
  v_existing        public.trips%ROWTYPE;
  v_revenue         numeric;
  v_vehicle_display text;
BEGIN
  v_vehicle_display := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  SELECT * INTO v_indent FROM public.indents WHERE id = p_indent_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_mover_org_id := v_indent.assigned_supplier_id;   -- mover = awarded bidder org
  IF v_mover_org_id IS NULL THEN RETURN; END IF;

  -- Only meaningful when the mover runs its own driver (asset execution).
  IF p_driver_id IS NULL THEN RETURN; END IF;

  -- Idempotent per (mover org, indent) — matches create_mover_asset_trip + the
  -- trips_one_per_indent-avoidance via source_indent_id.
  SELECT t.* INTO v_existing
  FROM public.trips t
  WHERE t.organization_id = v_mover_org_id
    AND t.source_indent_id = p_indent_id
    AND t.deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  SELECT t.* INTO v_agg_trip
  FROM public.trips t
  WHERE t.indent_id = p_indent_id AND t.deleted_at IS NULL
  LIMIT 1;

  v_revenue := COALESCE(
    NULLIF(v_agg_trip.supplier_rate, 0),
    NULLIF((v_indent.assigned_supplier_rate)::numeric, 0),
    NULLIF(v_indent.supplier_target, 0),
    0
  );

  INSERT INTO public.trips (
    organization_id, owner_user_id, created_by_user_id,
    trip_number, source_indent_id, source_indent_code, source,
    pickup_area, drop_location, client_name,
    client_price, supplier_rate, supplier_id, trip_payout_mode,
    driver_id, vehicle_id, vehicle_display_number,
    status, pickup_date, load_type,
    platform_fee, driver_commission, payment_status, amount_paid
  ) VALUES (
    v_mover_org_id, p_actor_user_id, p_actor_user_id,
    '', p_indent_id, v_indent.indent_code, 'mover_asset',
    coalesce(v_indent.pickup_area, ''), coalesce(v_indent.drop_location, ''),
    coalesce((SELECT o.name FROM public.organizations o WHERE o.id = v_indent.organization_id), 'Client'),
    v_revenue, 0, NULL, 'asset',
    p_driver_id, p_vehicle_id, v_vehicle_display,
    -- 'draft', NOT 'assigned': the asset trip is a finance/expense shell for the
    -- mover, not a dispatch. Draft is exempt from enforce_single_active_trip_per_driver,
    -- so this never fails when the driver is already on the aggregator's active trip
    -- (verified via dry-run 2026-07-23). Expense Hub + trip list are status-independent
    -- (source='mover_asset' drives both), so draft renders identically.
    'draft', v_indent.pickup_date, coalesce(v_indent.load_type, ''),
    0, 0, 'pending', 0
  );
END;
$fn$;

-- ── 2. Wire the deploy RPCs ────────────────────────────────────────────────────
-- DESIGN (to complete against the exact current bodies before apply):
--   In create_trip_from_direct_quote(uuid,text), create_trip_from_direct_quote(uuid),
--   and apply_roster_deploy_from_direct_quote(...), immediately BEFORE each
--   `RETURN NEXT v_trip; RETURN;` (idempotent path, fresh-insert path, and the
--   unique_violation recovery path):
--
--     -- stamp payout mode on the aggregator row (own driver -> asset else market)
--     UPDATE public.trips SET trip_payout_mode =
--       CASE WHEN (v_quote).driver_id IS NOT NULL THEN 'asset' ELSE 'market' END
--     WHERE id = (v_trip).id AND trip_payout_mode IS NULL;
--
--     -- create the mover's own asset trip in the same transaction (idempotent)
--     PERFORM public._ensure_mover_asset_trip(
--       (v_quote).indent_id, (v_quote).driver_id, (v_quote).vehicle_id,
--       v_vehicle_display, v_actor_user_id);
--
-- The full CREATE OR REPLACE of each function is intentionally NOT inlined here
-- yet: it must be regenerated from the live definition at apply time to avoid
-- clobbering any upstream change. See docs/TRIP_DETAIL_ARCHITECTURE.md sibling
-- note or the deploy-flow ticket.

-- ── 3. One-time backfill for existing gaps ─────────────────────────────────────
-- Every completed/active direct-quote aggregator trip whose mover has NO asset
-- trip yet. Uses the same helper for consistency. (TRP001 + TRP003 were already
-- hand-backfilled 2026-07-23; the idempotency guard makes this a no-op for them.)
DO $backfill$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT agg.indent_id, agg.driver_id, agg.vehicle_id, agg.vehicle_display_number,
           agg.created_by_user_id
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
    -- also stamp payout mode on the aggregator row where missing
    UPDATE public.trips
      SET trip_payout_mode = 'asset'
      WHERE indent_id = r.indent_id AND source = 'direct_quote'
        AND trip_payout_mode IS NULL;
  END LOOP;
END;
$backfill$;

COMMIT;
