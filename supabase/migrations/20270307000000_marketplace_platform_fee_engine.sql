-- A8.3 — Marketplace Platform Fee Settings + Calculation Engine.
--
-- Config model (deliberately two small tables, not a generic billing
-- platform): one marketplace_fee_configs row is a named fee schedule
-- (comparison_mode + optional max_fee cap); each schedule has 1+
-- marketplace_fee_components (flat or percentage). "3% OR ₹1,000,
-- whichever is higher" is exactly one config (comparison_mode='highest',
-- max_fee=NULL) with two components (percentage_rate=3, flat_amount=1000).
-- A flat component compared via 'highest' IS a minimum-fee floor; max_fee
-- is a separate, always-applied ceiling on top of whichever component wins
-- the comparison -- this covers every rule shape asked for (flat-only,
-- percentage-only, percentage+minimum, multiple components either
-- direction, optional cap) without new tables per shape.
--
-- Only one config may be is_active at a time (mirrors the existing
-- idx_reach_campaigns_one_active_per_org "one active X" convention).
-- Disabling is is_active=false, never a delete -- historical configs stay
-- queryable.
--
-- Scope boundary: this fee applies ONLY inside accept_market_bid()'s DCO
-- branch (bidder_type='dco'). The organization-bidder branch of the same
-- function (relationship/business-to-business Marketplace bidding) and
-- accept_driver_direct_bid() (Reach) are untouched -- Reach monetizes via
-- pulse_credit_wallets/pulse_credit_transactions, a fully separate ledger,
-- and must not also pick up a transaction commission merely because Reach
-- was used.

-- ---------------------------------------------------------------------
-- 1. Config tables.
CREATE TABLE public.marketplace_fee_configs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  comparison_mode text NOT NULL DEFAULT 'highest' CHECK (comparison_mode IN ('highest', 'lowest')),
  max_fee        numeric(12,2) NULL CHECK (max_fee IS NULL OR max_fee >= 0),
  is_active      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NULL REFERENCES auth.users(id)
);

-- At most one active config at a time.
CREATE UNIQUE INDEX idx_marketplace_fee_configs_one_active
  ON public.marketplace_fee_configs ((true))
  WHERE is_active;

CREATE TABLE public.marketplace_fee_components (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id        uuid NOT NULL REFERENCES public.marketplace_fee_configs(id) ON DELETE CASCADE,
  component_type   text NOT NULL CHECK (component_type IN ('flat', 'percentage')),
  flat_amount      numeric(12,2) NULL CHECK (flat_amount IS NULL OR flat_amount >= 0),
  percentage_rate  numeric(5,2) NULL CHECK (percentage_rate IS NULL OR (percentage_rate >= 0 AND percentage_rate <= 100)),
  sort_order       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_fee_components_type_value_check CHECK (
    (component_type = 'flat' AND flat_amount IS NOT NULL AND percentage_rate IS NULL)
    OR
    (component_type = 'percentage' AND percentage_rate IS NOT NULL AND flat_amount IS NULL)
  )
);

CREATE INDEX idx_marketplace_fee_components_config_id ON public.marketplace_fee_components(config_id);

-- Track who last touched a config -- reward_rules (the closest existing
-- precedent) has no actor column at all; this is a small, deliberate
-- improvement for a financial config, not scope creep.
CREATE OR REPLACE FUNCTION public.set_marketplace_fee_config_updated_by()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_marketplace_fee_configs_updated_by
  BEFORE UPDATE ON public.marketplace_fee_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_marketplace_fee_config_updated_by();

-- "Invalid/empty configurations cannot become active": a config being
-- (re)activated must have at least one component, and a flat component
-- (a minimum-fee floor under comparison_mode='highest') must not exceed
-- max_fee when both are set -- that combination can never produce anything
-- but max_fee, which is a self-contradictory configuration, not a valid one.
CREATE OR REPLACE FUNCTION public.validate_marketplace_fee_config_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_component_count int;
  v_max_flat        numeric;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  SELECT count(*), max(flat_amount) FILTER (WHERE component_type = 'flat')
  INTO v_component_count, v_max_flat
  FROM public.marketplace_fee_components
  WHERE config_id = NEW.id;

  IF coalesce(v_component_count, 0) = 0 THEN
    RAISE EXCEPTION 'invalid_config: cannot activate a fee config with no components';
  END IF;

  IF NEW.max_fee IS NOT NULL AND v_max_flat IS NOT NULL AND v_max_flat > NEW.max_fee THEN
    RAISE EXCEPTION 'invalid_config: a flat/minimum component (%) cannot exceed max_fee (%)', v_max_flat, NEW.max_fee;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_marketplace_fee_configs_validate_activation
  BEFORE INSERT OR UPDATE ON public.marketplace_fee_configs
  FOR EACH ROW EXECUTE FUNCTION public.validate_marketplace_fee_config_activation();

ALTER TABLE public.marketplace_fee_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_fee_components ENABLE ROW LEVEL SECURITY;

-- 2. New permission, admin-only read+write on the raw config tables
-- (mirrors reward_rules_platform_read/write exactly, keyed on a new
-- permission rather than reusing an unrelated one).
INSERT INTO public.platform_permissions (key, description) VALUES
  ('marketplace_fees.manage', 'View and edit Marketplace platform fee configuration')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'super_admin' AND p.key = 'marketplace_fees.manage'
ON CONFLICT DO NOTHING;

CREATE POLICY marketplace_fee_configs_platform_read ON public.marketplace_fee_configs
  FOR SELECT
  USING (has_platform_permission((select auth.uid()), 'marketplace_fees.manage'));

CREATE POLICY marketplace_fee_configs_platform_write ON public.marketplace_fee_configs
  FOR ALL
  USING (has_platform_permission((select auth.uid()), 'marketplace_fees.manage'))
  WITH CHECK (has_platform_permission((select auth.uid()), 'marketplace_fees.manage'));

CREATE POLICY marketplace_fee_components_platform_read ON public.marketplace_fee_components
  FOR SELECT
  USING (has_platform_permission((select auth.uid()), 'marketplace_fees.manage'));

CREATE POLICY marketplace_fee_components_platform_write ON public.marketplace_fee_components
  FOR ALL
  USING (has_platform_permission((select auth.uid()), 'marketplace_fees.manage'))
  WITH CHECK (has_platform_permission((select auth.uid()), 'marketplace_fees.manage'));

-- ---------------------------------------------------------------------
-- 3. The single authoritative calculation function. SECURITY DEFINER so
-- any authenticated caller (a business previewing a fee before award, or
-- accept_market_bid() itself) can get a resolved fee without needing
-- direct table access to the admin-only config tables -- same abstraction
-- pattern list_market_bids_for_indent() already uses for its own
-- authorization, just for table access rather than a permission check.
--
-- Never duplicate this formula anywhere else. If a screen or another RPC
-- needs a Marketplace fee number, it calls this function.
CREATE FUNCTION public.calculate_marketplace_platform_fee(p_bid_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_config      public.marketplace_fee_configs;
  v_components  jsonb := '[]'::jsonb;
  v_amounts     numeric[] := '{}';
  v_resolved    numeric;
  v_capped      boolean := false;
  v_row         record;
  v_amount      numeric;
BEGIN
  IF p_bid_amount IS NULL OR p_bid_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: p_bid_amount must be positive';
  END IF;

  SELECT * INTO v_config
  FROM public.marketplace_fee_configs
  WHERE is_active
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_active_config_found', false,
      'bid_amount', p_bid_amount,
      'components', '[]'::jsonb,
      'comparison_mode', NULL,
      'resolved_fee', 0,
      'capped', false,
      'client_price', p_bid_amount
    );
  END IF;

  FOR v_row IN
    SELECT component_type, flat_amount, percentage_rate
    FROM public.marketplace_fee_components
    WHERE config_id = v_config.id
    ORDER BY sort_order, created_at
  LOOP
    v_amount := CASE
      WHEN v_row.component_type = 'flat' THEN v_row.flat_amount
      ELSE round(p_bid_amount * v_row.percentage_rate / 100, 2)
    END;
    v_amounts := array_append(v_amounts, v_amount);
    v_components := v_components || jsonb_build_object(
      'component_type', v_row.component_type,
      'flat_amount', v_row.flat_amount,
      'percentage_rate', v_row.percentage_rate,
      'computed_amount', v_amount
    );
  END LOOP;

  v_resolved := CASE
    WHEN v_config.comparison_mode = 'highest' THEN (SELECT max(x) FROM unnest(v_amounts) x)
    ELSE (SELECT min(x) FROM unnest(v_amounts) x)
  END;

  IF v_config.max_fee IS NOT NULL AND v_resolved > v_config.max_fee THEN
    v_resolved := v_config.max_fee;
    v_capped := true;
  END IF;

  RETURN jsonb_build_object(
    'is_active_config_found', true,
    'config_id', v_config.id,
    'config_name', v_config.name,
    'comparison_mode', v_config.comparison_mode,
    'max_fee', v_config.max_fee,
    'bid_amount', p_bid_amount,
    'components', v_components,
    'resolved_fee', v_resolved,
    'capped', v_capped,
    'client_price', p_bid_amount + v_resolved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.calculate_marketplace_platform_fee(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_marketplace_platform_fee(numeric) TO authenticated;

COMMENT ON FUNCTION public.calculate_marketplace_platform_fee(numeric) IS
  'A8.3: single authoritative Marketplace platform-fee calculation. Reads the one active marketplace_fee_configs row and its components, applies the comparison rule (highest/lowest across components) then the optional max_fee cap. Returns full breakdown metadata for UI display, not just the number. is_active_config_found=false (resolved_fee=0) when no config is active -- the safe no-fee default. Never reimplement this formula elsewhere.';

-- ---------------------------------------------------------------------
-- 4. Wire into accept_market_bid()'s DCO branch only. Every other line is
-- byte-identical to the live definition read immediately before writing
-- this migration -- only the fee-calc call and the three changed INSERT
-- values (client_price, platform_fee; driver_commission unchanged) differ.
CREATE OR REPLACE FUNCTION public.accept_market_bid(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_bid         public.market_bids;
  v_indent      public.indents;
  v_driver_id   uuid;
  v_trip        public.trips%ROWTYPE;
  v_fee_calc    jsonb;
  v_platform_fee numeric;
  v_client_price numeric;
BEGIN
  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  -- Lock the INDENT first -- the concurrency rule locked for this contract.
  -- Any concurrent award attempt on this same indent (another market_bids
  -- row, a driver_direct_bids accept via an indent-linked post, or an
  -- org-to-org award RPC) serializes on this same row lock.
  SELECT * INTO v_indent FROM public.indents WHERE id = v_bid.indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: indent % for bid %', v_bid.indent_id, p_bid_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_indent.organization_id
      AND om.user_id = (select auth.uid())
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this indent';
  END IF;

  -- Idempotency 1: a trip already exists for this bid (DCO path always,
  -- organization path once allocation/Phase 3 has run).
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.source = 'market_bid' AND t.source_market_bid_id = v_bid.id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', v_bid.status);
  END IF;

  -- Idempotency 2: organization award already accepted, no trip yet (the
  -- normal, expected state between accept and allocation).
  IF v_bid.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', NULL, 'status', 'accepted');
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

  IF lower(trim(coalesce(v_indent.status, ''))) NOT IN ('open', 'broadcast') THEN
    RAISE EXCEPTION 'indent_not_open: indent % is not open for award (status=%)', v_indent.id, v_indent.status;
  END IF;

  -- At most one non-cancelled canonical trip per indent -- the same guard
  -- release_and_reopen_indent() uses, backstopped by the narrowed
  -- trips_one_per_indent unique index.
  IF EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.indent_id = v_indent.id AND t.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'already_awarded: indent % already has an active canonical trip', v_indent.id;
  END IF;

  IF v_bid.bidder_type = 'organization' THEN
    IF v_bid.bidder_organization_id IS NULL THEN
      RAISE EXCEPTION 'invalid_bid: organization bid % has no bidder_organization_id', v_bid.id;
    END IF;

    UPDATE public.market_bids
    SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE id = p_bid_id;

    -- Only one bid may win this indent -- same rule as the DCO path.
    UPDATE public.market_bids
    SET status = 'rejected', updated_at = now()
    WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

    UPDATE public.indents
    SET status = 'awarded',
        assigned_supplier_id = v_bid.bidder_organization_id,
        updated_at = now()
    WHERE id = v_indent.id;

    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', NULL, 'status', 'accepted');
  END IF;

  IF v_bid.bidder_type <> 'dco' THEN
    RAISE EXCEPTION 'unexpected_bidder_type: %', v_bid.bidder_type;
  END IF;

  -- A6.3: clean pre-check before attempting the trip insert, so a business
  -- gets a real error instead of enforce_single_active_trip_per_driver()'s
  -- raw trigger exception. The trigger itself is unchanged and remains the
  -- final backstop.
  IF NOT public.is_driver_available(v_bid.bidder_user_id) THEN
    RAISE EXCEPTION 'driver_unavailable: this driver is already on an active trip';
  END IF;

  -- H4 (Gate 4 hardening): the vehicle was valid when the bid was submitted,
  -- but acceptance is the moment it becomes part of a real Trip -- revalidate
  -- rather than trust a snapshot that may be stale by the time of award.
  -- Same check submit_market_bid already performs at submission time
  -- (ownership + not soft-deleted); acceptance re-checks the same two
  -- things, not a new, stricter bar.
  IF v_bid.owner_vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.owner_vehicles ov
    WHERE ov.id = v_bid.owner_vehicle_id
      AND ov.owner_user_id = v_bid.bidder_user_id
      AND ov.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'vehicle_no_longer_eligible: owner_vehicle % is no longer valid for bidder %', v_bid.owner_vehicle_id, v_bid.bidder_user_id;
  END IF;

  -- A8.3: resolve the Marketplace platform fee once, here, at the moment
  -- of award -- this is the only place the fee is ever computed for a DCO
  -- Marketplace trip. The resolved numbers (platform_fee, client_price)
  -- are written once into the trip row below and never recomputed later,
  -- so a subsequent Admin change to marketplace_fee_configs cannot alter
  -- this trip's already-locked-in economics. driver_commission stays the
  -- raw bid amount -- the bidder's payout is untouched by this fee.
  v_fee_calc := public.calculate_marketplace_platform_fee(v_bid.amount);
  v_platform_fee := coalesce((v_fee_calc->>'resolved_fee')::numeric, 0);
  v_client_price := v_bid.amount + v_platform_fee;

  v_driver_id := public._resolve_or_create_market_driver(v_indent.organization_id, v_bid.bidder_user_id);

  INSERT INTO public.trips (
    organization_id,
    trip_number,
    source,
    source_market_bid_id,
    indent_id,
    owner_vehicle_id,
    pickup_area,
    drop_location,
    client_name,
    client_price,
    supplier_rate,
    supplier_id,
    trip_payout_mode,
    driver_id,
    status,
    pickup_date,
    load_type,
    platform_fee,
    driver_commission,
    payment_status,
    amount_paid,
    platform_fee_calc_snapshot
  ) VALUES (
    v_indent.organization_id,
    '',
    'market_bid',
    v_bid.id,
    v_indent.id,
    v_bid.owner_vehicle_id,
    coalesce(v_indent.pickup_area, ''),
    coalesce(v_indent.drop_location, ''),
    coalesce(v_indent.client_name, ''),
    v_client_price,
    0,
    NULL,
    'asset',
    v_driver_id,
    'assigned',
    v_indent.pickup_date,
    coalesce(v_indent.load_type, ''),
    v_platform_fee,
    v_bid.amount,
    'pending',
    0,
    v_fee_calc
  )
  RETURNING * INTO v_trip;

  UPDATE public.market_bids
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = p_bid_id;

  -- Only one bid may win this indent -- close out the rest, across the
  -- market_bids table itself. Pending bids/driver_direct_bids on any
  -- indent-linked LOAD post are already handled by the terminal-status
  -- trigger fired by the indents.status update below.
  UPDATE public.market_bids
  SET status = 'rejected', updated_at = now()
  WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

  -- A6.3: this driver just became unavailable (this trip is now their
  -- active trip) -- close out every OTHER pending bid this same driver
  -- holds, across BOTH Market and Reach, on any OTHER load. Runs in the
  -- same transaction as the trip insert above, so there is never a window
  -- where this trip exists but a competing pending bid for this driver is
  -- still actionable.
  UPDATE public.market_bids
  SET status = 'superseded', updated_at = now()
  WHERE bidder_user_id = v_bid.bidder_user_id
    AND status = 'pending'
    AND id <> v_bid.id;

  UPDATE public.driver_direct_bids
  SET status = 'superseded', updated_at = now()
  WHERE driver_user_id = v_bid.bidder_user_id
    AND status = 'pending';

  UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. Minimal schema additions on trips: the resolved fee snapshot
-- (historical-safety requirement -- preserved alongside the trip, immune
-- to later Admin config changes) and a 'platform' ledger entity type so
-- the completion-time ledger entry (added in the client, see
-- ensureAssetCompletionAutoEntries) can be tagged distinctly rather than
-- left NULL or misclassified as client/supplier/driver/vehicle.
ALTER TABLE public.trips ADD COLUMN platform_fee_calc_snapshot jsonb NULL;

COMMENT ON COLUMN public.trips.platform_fee_calc_snapshot IS
  'A8.3: full calculate_marketplace_platform_fee() breakdown at the moment this trip was awarded (Marketplace DCO only). Preserved so a later Admin change to marketplace_fee_configs cannot retroactively alter this trip''s recorded economics -- platform_fee itself is the authoritative resolved number, this column is the explain-why breakdown.';

ALTER TABLE public.transactions DROP CONSTRAINT transactions_ledger_entity_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_ledger_entity_type_check
  CHECK (ledger_entity_type IS NULL OR ledger_entity_type = ANY (ARRAY['client'::text, 'supplier'::text, 'driver'::text, 'vehicle'::text, 'platform'::text]));
