-- Load Hub / direct_quotes supplier eligibility gate.
--
-- Bug: an org that is only a CLIENT (or has no relationship at all) could bid
-- on a Load Hub load, have their counter-offer accepted, and be awarded as if
-- they were an approved supplier. Confirmed live: SpaceXLogistics accepted
-- ITS Logistics Company's (an existing client, not a supplier) counter-offer
-- on indent 180cd415-7d9c-48de-ab71-3d236a92668f, which set
-- indents.assigned_supplier_id = ITS's org id and status = 'awarded' with no
-- suppliers row ever linking the two orgs. 3 more indents found in the same
-- state during audit (18f61272, 29fbd996, 93496642) — none has a
-- corresponding trip yet. These 4 are left untouched by this migration;
-- they are manual-review items.
--
-- Root cause: neither the accept-quote trigger nor any of the four
-- trip-creation RPCs ever verified that the bidder is a registered, active
-- supplier of the load owner. Two of the four RPCs
-- (create_trip_from_assigned_indent, create_trip_from_direct_quote) made
-- this worse by auto-creating a suppliers row as a side effect of award,
-- manufacturing the very relationship that should have been a precondition.
--
-- Scope decision (explicit product/architecture call, this session):
--   - Reach / Open Market `bids` + acceptBid() + canAward() are UNCHANGED.
--     That path follows ADR-012 (docs/ADR-012-commerce-earned-relationship.md)
--     — relationships earned through execution, no pre-award connection
--     required. Not touched by this migration.
--   - Load Hub / direct_quotes follows the Guard v1 model instead
--     (docs/architecture/11-relationship-guard-v1.md): a bidder must already
--     be an active, approved supplier of the load owner before their
--     counter-offer can be accepted or the load awarded to them.
--
-- assign_aggregate_trip_driver (manual/dispatcher driver assignment) is a
-- different flow with different consent semantics and is NOT touched here.
--
-- All five gated functions below share one canonical eligibility check
-- (is_approved_supplier) so the rule can never again be implemented
-- inconsistently across call sites, which is exactly how this bug happened
-- (create_trip_from_direct_quote was missed when create_trip_from_assigned_indent
-- was first investigated).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Canonical eligibility helper.
--
-- Deliberately does NOT check is_verified: confirmed live that a supplier
-- row created via the legitimate connection-request approval flow
-- (organization_relations trigger) has is_verified = false by default.
-- Requiring it would break every existing, legitimately-approved supplier.
-- is_active is checked because it is the one field the suppliers table
-- already reserves specifically for soft-disabling a relationship.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_approved_supplier(p_owner_org uuid, p_bidder_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.organization_id = p_owner_org
      AND s.linked_organization_id = p_bidder_org
      AND s.is_active = true
  );
$function$;

COMMENT ON FUNCTION public.is_approved_supplier(uuid, uuid) IS
  'Canonical Load Hub supplier-eligibility check: is p_bidder_org an active, approved supplier of p_owner_org? Backed by suppliers.organization_id + suppliers.linked_organization_id + suppliers.is_active. Deliberately excludes is_verified (display-only badge, not an authorization gate — confirmed false on legitimately-approved suppliers). Used by every Load Hub (direct_quotes) accept/award path; NOT used by Reach/bids (see ADR-012).';

REVOKE ALL ON FUNCTION public.is_approved_supplier(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_supplier(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_supplier(uuid, uuid) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. Gate the accept-quote trigger. This is the earliest point in the Load
--    Hub flow and covers BOTH known ways direct_quotes.status can reach
--    'accepted' (the client updates the row directly under RLS; there is no
--    single "accept RPC" to gate instead) since the trigger fires on the
--    column transition regardless of which code path wrote it.
--
--    Preserves the exact prior body (status stamping, terminal-status
--    guard) — only adds the eligibility check ahead of it.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_indent_assigned_supplier_on_quote_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_org uuid;
BEGIN
  IF new.status = 'accepted' THEN
    SELECT i.organization_id INTO v_owner_org
    FROM public.indents i
    WHERE i.id = new.indent_id;

    IF v_owner_org IS NULL THEN
      RAISE EXCEPTION 'Indent % not found', new.indent_id;
    END IF;

    IF NOT public.is_approved_supplier(v_owner_org, new.bidder_organization_id) THEN
      RAISE EXCEPTION 'Bidder is not an approved supplier of this load owner. Add and approve them as a supplier before accepting this offer.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.indents
    SET
      assigned_supplier_id = new.bidder_organization_id,
      assigned_supplier_rate = new.amount,
      -- Accepting a quote is the award event. Keep terminal statuses intact.
      status = CASE
        WHEN lower(coalesce(status, '')) IN (
          'awarded', 'completed', 'cancelled', 'closed', 'expired'
        ) THEN status
        ELSE 'awarded'
      END,
      updated_at = now()
    WHERE id = new.indent_id;
  END IF;
  RETURN new;
END;
$function$;

COMMENT ON FUNCTION public.set_indent_assigned_supplier_on_quote_accepted() IS
  'On direct_quotes.status -> accepted: rejects (RAISE EXCEPTION) unless the bidder is an active approved supplier of the indent owner (is_approved_supplier). Otherwise sets indent.assigned_supplier_id/assigned_supplier_rate and stamps status=awarded, unchanged from prior behavior.';


-- ─────────────────────────────────────────────────────────────────────────
-- 3. award_indent_to_trip — add the eligibility check as defense-in-depth
--    (the RPC must be safe even if called directly, bypassing the trigger
--    path entirely). Signature UNCHANGED. Every existing check, the
--    idempotent update-existing-trip branch, and supplier_id resolution
--    logic are preserved verbatim; only the new guard is inserted before
--    the INSERT.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.award_indent_to_trip(p_indent_id uuid, p_supplier_rate numeric DEFAULT NULL::numeric, p_supplier_id uuid DEFAULT NULL::uuid, p_supplier_org_id uuid DEFAULT NULL::uuid, p_driver_id uuid DEFAULT NULL::uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_vehicle_display_number text DEFAULT NULL::text)
 RETURNS SETOF trips
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_indent        public.indents%ROWTYPE;
  v_org_id        uuid;
  v_trip          public.trips%ROWTYPE;
  v_supplier_id   uuid;
  v_supplier_rate numeric;
  v_vehicle_disp  text;
  v_bidder_org_id uuid;
BEGIN
  SELECT * INTO v_indent FROM public.indents WHERE id = p_indent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent % not found', p_indent_id;
  END IF;

  IF lower(coalesce(v_indent.status, '')) = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot create trip: indent % is cancelled', p_indent_id;
  END IF;

  IF coalesce(trim(v_indent.pickup_area), '') = '' THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no pickup_area', p_indent_id;
  END IF;
  IF coalesce(trim(v_indent.drop_location), '') = '' THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no drop_location', p_indent_id;
  END IF;
  IF coalesce(v_indent.client_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no client_price', p_indent_id;
  END IF;

  v_org_id := v_indent.organization_id;

  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not authorized: caller is not a member of org %', v_org_id;
  END IF;

  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = p_indent_id
  LIMIT 1;

  IF FOUND THEN
    IF lower(coalesce(v_trip.status, '')) NOT IN ('completed', 'cancelled') THEN
      UPDATE public.trips
      SET
        driver_id             = COALESCE(p_driver_id,  driver_id),
        vehicle_id            = COALESCE(p_vehicle_id, vehicle_id),
        vehicle_display_number = CASE
          WHEN p_vehicle_display_number IS NOT NULL AND trim(p_vehicle_display_number) <> ''
          THEN trim(p_vehicle_display_number)
          ELSE vehicle_display_number
        END,
        updated_at = now()
      WHERE id = v_trip.id;
      SELECT * INTO v_trip FROM public.trips WHERE id = v_trip.id;
    END IF;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  -- Resolve the bidder org id the same way supplier_id resolution below
  -- does, so the eligibility check covers every way the caller can name
  -- the bidder (assigned_supplier_id on the indent, or an explicit param).
  v_bidder_org_id := COALESCE(v_indent.assigned_supplier_id, p_supplier_org_id);

  IF v_bidder_org_id IS NOT NULL AND NOT public.is_approved_supplier(v_org_id, v_bidder_org_id) THEN
    RAISE EXCEPTION 'Bidder is not an approved supplier of this load owner. Add and approve them as a supplier before awarding.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_supplier_rate := COALESCE(
    p_supplier_rate,
    (v_indent.assigned_supplier_rate)::numeric,
    v_indent.supplier_target,
    0
  );

  v_supplier_id := p_supplier_id;

  IF v_supplier_id IS NULL AND v_indent.assigned_supplier_id IS NOT NULL THEN
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND linked_organization_id = v_indent.assigned_supplier_id
    LIMIT 1;
  END IF;

  IF v_supplier_id IS NULL AND p_supplier_org_id IS NOT NULL THEN
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND linked_organization_id = p_supplier_org_id
    LIMIT 1;
  END IF;

  v_vehicle_disp := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  INSERT INTO public.trips (
    organization_id, trip_number, indent_id, source, pickup_area, drop_location,
    client_name, client_price, supplier_rate, supplier_id, trip_payout_mode,
    driver_id, vehicle_id, vehicle_display_number, status, pickup_date, load_type,
    platform_fee, driver_commission, payment_status, amount_paid
  ) VALUES (
    v_org_id, '', p_indent_id, 'indent',
    coalesce(v_indent.pickup_area, ''), coalesce(v_indent.drop_location, ''),
    coalesce(v_indent.client_name, ''), coalesce(v_indent.client_price, 0),
    v_supplier_rate, v_supplier_id,
    CASE WHEN v_supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
    p_driver_id, p_vehicle_id, v_vehicle_disp,
    CASE WHEN p_driver_id IS NOT NULL THEN 'assigned' ELSE 'draft' END,
    v_indent.pickup_date, coalesce(v_indent.load_type, ''), 0, 0, 'pending', 0
  )
  RETURNING * INTO v_trip;

  UPDATE public.indents
  SET status = 'completed', updated_at = now()
  WHERE id = p_indent_id;

  RETURN NEXT v_trip;
  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.award_indent_to_trip(uuid, numeric, uuid, uuid, uuid, uuid, text) IS
  'Award an indent to a trip (manual assignment path). Defense-in-depth: rejects if the resolved bidder org (assigned_supplier_id or p_supplier_org_id) is not an active approved supplier of the indent owner (is_approved_supplier). Idempotent update-existing-trip branch and all prior validation preserved unchanged.';


-- ─────────────────────────────────────────────────────────────────────────
-- 4. create_trip_from_assigned_indent — same defense-in-depth guard.
--    Signature UNCHANGED. The auto-create-supplier-row fallback is REMOVED:
--    it existed only to paper over exactly the case we now reject earlier
--    (assigned_supplier_id pointing at a non-supplier). Legitimate callers
--    (Staff Handshake / Deploy modal — useStaffHandshake.ts, useTripDeployment.ts)
--    are unaffected: by the time this function is called, assigned_supplier_id
--    can now only be set to an org that already passed the eligibility check
--    in step 2, so the supplier row is guaranteed to already exist.
--    Concurrency/idempotency (row lock, existing-trip branch, retry-on-conflict
--    loop) is preserved verbatim.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_trip_from_assigned_indent(p_indent_id uuid, p_driver_id uuid DEFAULT NULL::uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_vehicle_display_number text DEFAULT NULL::text)
 RETURNS SETOF trips
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_indent             public.indents%ROWTYPE;
  v_org_id             uuid;
  v_supplier_org_id    uuid;
  v_supplier_id        uuid;
  v_trip               public.trips%ROWTYPE;
  v_vehicle_display    text;
  v_supplier_rate      numeric;
  v_actor_user_id      uuid := auth.uid();
  v_created_by_user_id uuid := NULL;
  v_try                integer := 0;
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

  SELECT * INTO v_indent FROM public.indents WHERE id = p_indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent % not found', p_indent_id;
  END IF;

  IF lower(coalesce(v_indent.status, '')) IN ('cancelled', 'closed') THEN
    RAISE EXCEPTION 'Cannot create trip: indent % is not available', p_indent_id;
  END IF;

  v_supplier_org_id := v_indent.assigned_supplier_id;
  IF v_supplier_org_id IS NULL THEN
    RAISE EXCEPTION 'Indent has no assigned supplier';
  END IF;

  IF NOT public.is_org_member(v_supplier_org_id) THEN
    RAISE EXCEPTION 'Not authorized to deploy this load';
  END IF;

  v_org_id := v_indent.organization_id;

  IF NOT public.is_approved_supplier(v_org_id, v_supplier_org_id) THEN
    RAISE EXCEPTION 'Bidder is not an approved supplier of this load owner. Add and approve them as a supplier before deploying.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF coalesce(trim(v_indent.pickup_area), '') = '' THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no pickup_area', p_indent_id;
  END IF;
  IF coalesce(trim(v_indent.drop_location), '') = '' THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no drop_location', p_indent_id;
  END IF;
  IF coalesce(v_indent.client_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot create trip: indent % has no client_price', p_indent_id;
  END IF;

  IF p_driver_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = p_driver_id AND d.organization_id = v_supplier_org_id
    ) THEN
      RAISE EXCEPTION 'Driver must belong to your organization';
    END IF;
  END IF;

  IF p_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = p_vehicle_id AND v.organization_id = v_supplier_org_id
    ) THEN
      RAISE EXCEPTION 'Vehicle must belong to your organization';
    END IF;
  END IF;

  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = p_indent_id
  LIMIT 1;

  IF FOUND THEN
    IF lower(coalesce(v_trip.status, '')) NOT IN ('completed', 'cancelled') THEN
      UPDATE public.trips
      SET
        driver_id = COALESCE(p_driver_id, driver_id),
        vehicle_id = COALESCE(p_vehicle_id, vehicle_id),
        vehicle_display_number = CASE
          WHEN v_vehicle_display IS NOT NULL THEN v_vehicle_display
          ELSE vehicle_display_number
        END,
        updated_at = now()
      WHERE id = v_trip.id;
      SELECT * INTO v_trip FROM public.trips WHERE id = v_trip.id;
    END IF;
    UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = p_indent_id;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  v_supplier_rate := COALESCE(
    (v_indent.assigned_supplier_rate)::numeric,
    v_indent.supplier_target,
    0
  );

  -- Eligibility was already confirmed above; resolve (never auto-create)
  -- the shipper's supplier row for the bidder org.
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = v_supplier_org_id
    AND is_active = true
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Bidder is not an approved supplier of this load owner. Add and approve them as a supplier before deploying.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  LOOP
    v_try := v_try + 1;
    BEGIN
      INSERT INTO public.trips (
        organization_id, owner_user_id, created_by_user_id, trip_number, indent_id,
        source, pickup_area, drop_location, client_name, client_price, supplier_rate,
        supplier_id, trip_payout_mode, driver_id, vehicle_id, status, pickup_date,
        load_type, vehicle_display_number, platform_fee, driver_commission,
        payment_status, amount_paid
      ) VALUES (
        v_org_id, v_indent.owner_user_id, v_created_by_user_id, '', p_indent_id,
        'indent', coalesce(v_indent.pickup_area, ''), coalesce(v_indent.drop_location, ''),
        coalesce(v_indent.client_name, ''), coalesce(v_indent.client_price, 0),
        v_supplier_rate, v_supplier_id,
        CASE WHEN v_supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
        p_driver_id, p_vehicle_id,
        CASE WHEN p_driver_id IS NOT NULL THEN 'assigned' ELSE 'draft' END,
        v_indent.pickup_date, coalesce(v_indent.load_type, ''), v_vehicle_display,
        0, 0, 'pending', 0
      )
      RETURNING * INTO v_trip;

      UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = p_indent_id;
      RETURN NEXT v_trip;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT t.* INTO v_trip
        FROM public.trips t
        WHERE t.indent_id = p_indent_id
        LIMIT 1;
        IF FOUND THEN
          UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = p_indent_id;
          RETURN NEXT v_trip;
          RETURN;
        END IF;
        IF v_try >= 3 THEN
          RAISE;
        END IF;
    END;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.create_trip_from_assigned_indent(uuid, uuid, uuid, text) IS
  'Create a trip from an indent whose assigned_supplier_id already points at an approved supplier (deploy path, e.g. Staff Handshake / useTripDeployment). Rejects (RAISE EXCEPTION) if the assigned org is not an active approved supplier of the indent owner (is_approved_supplier) — no longer auto-creates a suppliers row as a side effect. Idempotent update-existing-trip branch and retry-on-conflict loop preserved unchanged.';


-- ─────────────────────────────────────────────────────────────────────────
-- 5. create_trip_from_direct_quote — DROP both live overloads first
--    (confirmed via pg_proc: (uuid) and (uuid, text) both exist today,
--    same overload-duplication pattern as the earlier
--    assign_aggregate_trip_driver incident). Recreate only the canonical
--    signature actually used by the live client
--    (features/indents/services/accept-awarded-quote.service.ts calls
--    p_quote_id + p_vehicle_display_number). The auto-create-supplier
--    fallback is REMOVED for the same reason as step 4: eligibility is now
--    a precondition enforced earlier (step 2), so by the time this runs the
--    supplier row is guaranteed to exist for any legitimate call.
--    Row-locking (FOR UPDATE), the idempotent existing-trip branch,
--    retry-on-conflict loop, and the _ensure_mover_asset_trip calls are all
--    preserved verbatim from the newer overload's body.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_trip_from_direct_quote(uuid);
DROP FUNCTION IF EXISTS public.create_trip_from_direct_quote(uuid, text);

CREATE FUNCTION public.create_trip_from_direct_quote(p_quote_id uuid, p_vehicle_display_number text DEFAULT NULL::text)
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

  -- Defense-in-depth: quote acceptance is already gated by
  -- set_indent_assigned_supplier_on_quote_accepted, but this RPC must be
  -- safe even if called directly against a quote whose acceptance somehow
  -- bypassed the trigger (e.g. status set before this migration).
  IF NOT public.is_approved_supplier(v_org_id, (v_quote).bidder_organization_id) THEN
    RAISE EXCEPTION 'Bidder is not an approved supplier of this load owner. Add and approve them as a supplier before creating this trip.'
      USING ERRCODE = 'insufficient_privilege';
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

  -- Eligibility already confirmed above; resolve (never auto-create) the
  -- shipper's supplier row for the bidder org.
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = (v_quote).bidder_organization_id
    AND is_active = true
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Bidder is not an approved supplier of this load owner. Add and approve them as a supplier before creating this trip.'
      USING ERRCODE = 'insufficient_privilege';
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
        CASE WHEN (v_quote).driver_id IS NOT NULL AND (v_quote).vehicle_id IS NOT NULL AND v_supplier_id IS NULL THEN 'asset' ELSE 'market' END,
        (v_quote).driver_id, (v_quote).vehicle_id, 'assigned',
        (v_indent).pickup_date, coalesce((v_indent).load_type, ''),
        v_vehicle_display, 0, 0, 'pending', 0
      )
      RETURNING * INTO v_trip;

      UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;

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

COMMENT ON FUNCTION public.create_trip_from_direct_quote(uuid, text) IS
  'Create a trip from an accepted direct quote (Load Hub award). Only canonical signature after dropping the (uuid)-only and (uuid,text)-duplicate overloads that existed live simultaneously. Rejects (RAISE EXCEPTION) if the bidder is not an active approved supplier of the indent owner (is_approved_supplier) — no longer auto-creates a suppliers row as a side effect. Row-locking, idempotent existing-trip branch, retry-on-conflict loop, and _ensure_mover_asset_trip wiring preserved unchanged from the pre-migration body.';

REVOKE ALL ON FUNCTION public.create_trip_from_direct_quote(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_trip_from_direct_quote(uuid, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 6. batch_award_indents_to_trips — per-row eligibility filter, independent
--    of the other four (shares no code path with them). Return type stays
--    `integer` (count of trips actually created) to preserve the existing
--    client contract (features/indents/services/indentConversionService.ts
--    reads `Number(data ?? 0)` — changing the return shape would silently
--    break that caller). Ineligible rows are NOT silently discarded: they
--    are simply excluded from `to_convert` and therefore keep their current
--    status ('awarded') and remain queryable/visible via the same
--    "assigned_supplier_id set, status='awarded', no trip" audit query used
--    to find the 4 existing violating indents — plus a RAISE WARNING per
--    skipped row so it surfaces in Postgres logs too. Eligible rows are
--    converted exactly as before; nothing about their handling changes.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_award_indents_to_trips(p_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer;
  v_skipped record;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Surface skipped rows in Postgres logs (not silently discarded), without
  -- changing the function's integer return contract.
  FOR v_skipped IN
    SELECT i.id, i.assigned_supplier_id
    FROM public.indents i
    LEFT JOIN public.trips t ON t.indent_id = i.id
    WHERE i.organization_id = p_org_id
      AND i.status = 'awarded'
      AND t.id IS NULL
      AND (
        i.assigned_supplier_id IS NULL
        OR NOT public.is_approved_supplier(p_org_id, i.assigned_supplier_id)
      )
  LOOP
    RAISE WARNING 'batch_award_indents_to_trips: skipping indent % — assigned_supplier_id % is not an active approved supplier of org %',
      v_skipped.id, v_skipped.assigned_supplier_id, p_org_id;
  END LOOP;

  WITH to_convert AS (
    SELECT i.*
    FROM public.indents i
    LEFT JOIN public.trips t ON t.indent_id = i.id
    WHERE i.organization_id = p_org_id
      AND i.status = 'awarded'
      AND t.id IS NULL
      AND i.assigned_supplier_id IS NOT NULL
      AND public.is_approved_supplier(p_org_id, i.assigned_supplier_id)
  ),
  inserted AS (
    INSERT INTO public.trips (
      organization_id, owner_user_id, created_by_user_id, trip_number, indent_id,
      source, pickup_area, drop_location, pickup_lat, pickup_lon, drop_lat, drop_lon,
      distance, estimated_duration, client_name, client_id, client_price, supplier_rate,
      supplier_id, trip_payout_mode, status, pickup_date, load_type, notes,
      platform_fee, driver_commission, payment_status, amount_paid
    )
    SELECT
      tc.organization_id, tc.owner_user_id, auth.uid(), '', tc.id, 'batch_conversion',
      tc.pickup_area, tc.drop_location, tc.pickup_lat, tc.pickup_lon, tc.drop_lat, tc.drop_lon,
      tc.distance, tc.estimated_duration, tc.client_name, tc.client_id, tc.client_price,
      tc.supplier_target, tc.assigned_supplier_id,
      CASE WHEN tc.assigned_supplier_id IS NOT NULL THEN 'market' ELSE 'asset' END,
      'assigned', tc.pickup_date, tc.load_type, tc.notes, 0, 0, 'pending', 0
    FROM to_convert tc
    RETURNING id
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  UPDATE public.indents
  SET status = 'completed', updated_at = now()
  WHERE id IN (
    SELECT tc.id FROM public.indents tc
    LEFT JOIN public.trips t ON t.indent_id = tc.id
    WHERE tc.organization_id = p_org_id
      AND tc.status = 'awarded'
      AND t.id IS NOT NULL
  );

  RETURN v_inserted;
END;
$function$;

COMMENT ON FUNCTION public.batch_award_indents_to_trips(uuid) IS
  'Bulk-convert awarded indents (with no existing trip) to trips. Only converts indents whose assigned_supplier_id is an active approved supplier of p_org_id (is_approved_supplier); ineligible indents are skipped (RAISE WARNING logged per row) and keep status=awarded, remaining queryable rather than being silently dropped or advanced. Return value (count of trips created) unchanged for client compatibility.';

COMMIT;
