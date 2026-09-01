-- WS1 (Gate 4, step 5 of 7): market_bids -- DCO/Business bids directly on a
-- Market-shared Indent. Deliberately a new, separate table, not a widened
-- driver_direct_bids: the two are different commercial objects (a bid
-- against a boosted Reach story vs. a bid against a structured Indent), and
-- keeping them separate avoids a nullable-dual-FK table with permanent
-- "if post_id ... else if indent_id ..." branching throughout its consumers.
--
-- bidder_type discriminator encodes the one invariant locked for this table:
-- a DCO bid never carries an organization; a Business bid always does.

CREATE TABLE IF NOT EXISTS public.market_bids (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_id               uuid NOT NULL REFERENCES public.indents(id) ON DELETE CASCADE,
  bidder_type             text NOT NULL CHECK (bidder_type IN ('dco', 'organization')),
  bidder_user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bidder_organization_id  uuid NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_vehicle_id        uuid NULL REFERENCES public.owner_vehicles(id) ON DELETE SET NULL,
  amount                  numeric NOT NULL CHECK (amount > 0),
  note                    text,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  accepted_at             timestamptz,
  CONSTRAINT market_bids_bidder_shape CHECK (
    (bidder_type = 'dco' AND bidder_organization_id IS NULL)
    OR (bidder_type = 'organization' AND bidder_organization_id IS NOT NULL)
  ),
  UNIQUE (indent_id, bidder_user_id)
);

COMMENT ON TABLE public.market_bids IS
  'WS1: a bid directly against a Market-shared Indent, from either a DCO (bidder_type=dco, no organization) or a Business with capacity (bidder_type=organization). Distinct from driver_direct_bids (scoped to boosted Reach/Post stories) and from bids/direct_quotes (org-to-org, unrelated to this workstream).';

CREATE INDEX IF NOT EXISTS idx_market_bids_indent ON public.market_bids (indent_id);
CREATE INDEX IF NOT EXISTS idx_market_bids_bidder_user ON public.market_bids (bidder_user_id);

DROP TRIGGER IF EXISTS set_market_bids_updated_at ON public.market_bids;
CREATE TRIGGER set_market_bids_updated_at
  BEFORE UPDATE ON public.market_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.market_bids ENABLE ROW LEVEL SECURITY;

-- One SELECT policy (One Authorization Truth -- docs/REALTIME_PLATFORM_RULES.md):
-- the bidder who placed it, or an active member of the organization that
-- owns the indent being bid on. Mirrors driver_direct_bids_select's shape,
-- adjusted for indent-scoping instead of post-scoping.
DROP POLICY IF EXISTS market_bids_select ON public.market_bids;
CREATE POLICY market_bids_select ON public.market_bids
  FOR SELECT
  TO authenticated
  USING (
    bidder_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.indents i
      JOIN public.organization_members om
        ON om.organization_id = i.organization_id
       AND om.user_id = (select auth.uid())
       AND om.status = 'active'
      WHERE i.id = market_bids.indent_id
    )
  );

-- Inserts only via submit_market_bid() (SECURITY DEFINER) -- matches the
-- existing bids/direct_quotes/driver_direct_bids convention of RPC-gated
-- writes for anything that touches money or award state.
REVOKE ALL ON public.market_bids FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.market_bids TO authenticated;

-- ── Submit a Market bid (DCO or Business) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_market_bid(
  p_indent_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_bidder_organization_id uuid DEFAULT NULL,
  p_owner_vehicle_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bidder_type text;
  v_bid_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF NOT public.indent_open_for_marketplace_bids(p_indent_id) THEN
    RAISE EXCEPTION 'not_biddable: indent % is not open for marketplace bids', p_indent_id;
  END IF;

  -- p_bidder_organization_id NULL => DCO path. Set => Business path.
  IF p_bidder_organization_id IS NULL THEN
    v_bidder_type := 'dco';

    IF NOT public.is_driver_fleet_owner(v_uid) THEN
      RAISE EXCEPTION 'unauthorized: Fleet Owner capability required for a DCO bid';
    END IF;

    IF p_owner_vehicle_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.owner_vehicles ov
      WHERE ov.id = p_owner_vehicle_id
        AND ov.owner_user_id = v_uid
        AND ov.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'owner_vehicle_id must belong to the caller''s own fleet';
    END IF;
  ELSE
    v_bidder_type := 'organization';

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_bidder_organization_id
        AND om.user_id = v_uid
        AND om.status = 'active'
    ) THEN
      RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.indents i
      WHERE i.id = p_indent_id AND i.organization_id = p_bidder_organization_id
    ) THEN
      RAISE EXCEPTION 'cannot bid on your own organization''s indent';
    END IF;
  END IF;

  INSERT INTO public.market_bids (
    indent_id, bidder_type, bidder_user_id, bidder_organization_id, owner_vehicle_id, amount, note
  )
  VALUES (
    p_indent_id, v_bidder_type, v_uid, p_bidder_organization_id, p_owner_vehicle_id, p_amount,
    NULLIF(TRIM(COALESCE(p_note, '')), '')
  )
  ON CONFLICT (indent_id, bidder_user_id) DO UPDATE SET
    amount = EXCLUDED.amount,
    note = EXCLUDED.note,
    owner_vehicle_id = EXCLUDED.owner_vehicle_id,
    updated_at = now()
  WHERE public.market_bids.status = 'pending'
  RETURNING id INTO v_bid_id;

  IF v_bid_id IS NULL THEN
    RAISE EXCEPTION 'bid_locked: an existing decided bid cannot be changed';
  END IF;

  RETURN jsonb_build_object(
    'bid_id', v_bid_id, 'indent_id', p_indent_id, 'bidder_type', v_bidder_type, 'amount', p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_market_bid(uuid, numeric, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_market_bid(uuid, numeric, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_market_bid IS
  'WS1: bid directly on a Market-shared Indent. p_bidder_organization_id NULL = DCO bid (requires Fleet Owner capability, no organization). Set = Business bid (requires active membership in that organization). Distinct from driver_direct_bids, which stays scoped to boosted Reach/Post stories.';

-- ── Extend the terminal-status cleanup trigger for market_bids ──────────────
-- Function body only (same trigger as before); now that market_bids exists,
-- add its rejection clause alongside the existing bids/driver_direct_bids
-- ones from 20270301020000.
CREATE OR REPLACE FUNCTION public.deactivate_posts_for_terminal_indent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_status := lower(trim(coalesce(NEW.status::text, '')));
  IF NOT (
    v_status = ANY (
      ARRAY['awarded', 'completed', 'cancelled', 'closed', 'expired']::text[]
    )
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.posts p
  SET
    is_active = false,
    updated_at = now()
  WHERE p.source_indent_id = NEW.id
    AND p.is_active = true;

  UPDATE public.bids b
  SET
    status = 'rejected',
    updated_at = now()
  WHERE b.status = 'pending'
    AND b.post_id IN (
      SELECT p.id FROM public.posts p WHERE p.source_indent_id = NEW.id
    );

  UPDATE public.driver_direct_bids ddb
  SET
    status = 'rejected',
    updated_at = now()
  WHERE ddb.status = 'pending'
    AND ddb.post_id IN (
      SELECT p.id FROM public.posts p WHERE p.source_indent_id = NEW.id
    );

  -- WS1: a pending Market bid on this indent must not survive it reaching a
  -- terminal status via any other path (award, cancellation, expiry, close).
  UPDATE public.market_bids mb
  SET
    status = 'rejected',
    updated_at = now()
  WHERE mb.status = 'pending'
    AND mb.indent_id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.deactivate_posts_for_terminal_indent() IS
  'On indent awarded/completed/cancelled/closed/expired: deactivate linked LOAD stories and reject pending bids, driver_direct_bids, and market_bids.';
