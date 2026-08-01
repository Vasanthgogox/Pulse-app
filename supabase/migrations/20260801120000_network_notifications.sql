-- Network notifications: cross-org inbox for the indent → bid → award lifecycle.
--
-- Why a table (and not the derived ops feed): the registry feed is computed from
-- the viewer's own bootstrap store, so it can never describe another org's action.
-- Cross-org delivery needs a durable row written at the moment of the action.
--
-- Why triggers (and not service-layer inserts): the same lifecycle transitions are
-- driven from web, native and seed scripts. Triggers make delivery unconditional
-- and cost no extra client round-trip.

CREATE TABLE IF NOT EXISTS public.network_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Recipient org. Every read path filters on this.
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Org whose action produced the row (never the recipient).
  actor_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  title text NOT NULL,
  subtitle text,
  amount_meta numeric,
  indent_id uuid REFERENCES public.indents(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.direct_quotes(id) ON DELETE CASCADE,
  bid_id uuid REFERENCES public.bids(id) ON DELETE CASCADE,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- One row per (recipient, event, subject). Makes trigger writes idempotent.
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  handled_at timestamptz,
  handled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT network_notifications_event_type_chk CHECK (
    event_type = ANY (ARRAY[
      'indent_created',
      'bid_received',
      'awarded',
      'quote_requested',
      'counter_offered'
    ])
  ),
  CONSTRAINT network_notifications_status_chk CHECK (
    status = ANY (ARRAY['open', 'read', 'handled', 'resolved'])
  ),
  -- An org must never be notified about its own action.
  CONSTRAINT network_notifications_no_self_notify CHECK (
    actor_org_id IS NULL OR actor_org_id <> organization_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS network_notifications_dedupe_uidx
  ON public.network_notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- The inbox query: newest-first for one org. Partial on unread for the badge count.
CREATE INDEX IF NOT EXISTS network_notifications_org_created_idx
  ON public.network_notifications (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS network_notifications_org_open_idx
  ON public.network_notifications (organization_id, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS network_notifications_indent_idx
  ON public.network_notifications (indent_id)
  WHERE indent_id IS NOT NULL;

CREATE TRIGGER set_network_notifications_updated_at
  BEFORE UPDATE ON public.network_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Recipients read and update (mark read/handled) their own rows. Nobody inserts
-- from the client: rows come only from SECURITY DEFINER triggers below.
ALTER TABLE public.network_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS network_notifications_select_own_org ON public.network_notifications;
CREATE POLICY network_notifications_select_own_org
  ON public.network_notifications FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS network_notifications_update_own_org ON public.network_notifications;
CREATE POLICY network_notifications_update_own_org
  ON public.network_notifications FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── Shared insert helper ───────────────────────────────────────────────────
-- SECURITY DEFINER so a trigger can write a row owned by the *recipient* org,
-- which the acting user is not a member of. Silently no-ops on self-notify and
-- on duplicate dedupe_key so lifecycle writes stay idempotent.
CREATE OR REPLACE FUNCTION public.emit_network_notification(
  p_organization_id uuid,
  p_actor_org_id uuid,
  p_event_type text,
  p_title text,
  p_subtitle text,
  p_amount_meta numeric,
  p_indent_id uuid,
  p_quote_id uuid,
  p_bid_id uuid,
  p_dedupe_key text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;
  -- Never notify an org about its own action.
  IF p_actor_org_id IS NOT NULL AND p_actor_org_id = p_organization_id THEN
    RETURN;
  END IF;

  INSERT INTO public.network_notifications (
    organization_id, actor_org_id, event_type, title, subtitle,
    amount_meta, indent_id, quote_id, bid_id, dedupe_key, payload_json
  ) VALUES (
    p_organization_id, p_actor_org_id, p_event_type, p_title, p_subtitle,
    p_amount_meta, p_indent_id, p_quote_id, p_bid_id, p_dedupe_key,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_network_notification(
  uuid, uuid, text, text, text, numeric, uuid, uuid, uuid, text, jsonb
) FROM PUBLIC;

-- ── Route label helper ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.indent_route_label(p_indent public.indents)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(
    CONCAT_WS(' → ',
      NULLIF(TRIM(COALESCE(p_indent.pickup_area, '')), ''),
      NULLIF(TRIM(COALESCE(p_indent.drop_location, '')), '')
    ), ''
  );
$$;

-- ── 1. indent_created → fan out to connected supplier orgs ─────────────────
-- Fires when an indent first becomes 'broadcast' (on insert or draft→broadcast),
-- never for drafts. Recipients are orgs with an accepted carrier/supplier
-- connection in either direction.
CREATE OR REPLACE FUNCTION public.notify_indent_broadcast()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_route text;
  v_supplier uuid;
BEGIN
  IF NEW.status <> 'broadcast' THEN
    RETURN NEW;
  END IF;
  -- Only on the transition into broadcast, so edits don't re-notify.
  IF TG_OP = 'UPDATE' AND OLD.status = 'broadcast' THEN
    RETURN NEW;
  END IF;

  v_code := COALESCE(NEW.indent_operational_code, NEW.indent_number, NEW.indent_code, 'Indent');
  v_route := public.indent_route_label(NEW);

  FOR v_supplier IN
    SELECT DISTINCT other_org FROM (
      SELECT cr.to_organization_id AS other_org
        FROM public.connection_requests cr
       WHERE cr.from_organization_id = NEW.organization_id
         AND cr.status = 'accepted'
         AND cr.request_carrier_supplier IS TRUE
      UNION
      SELECT cr.from_organization_id AS other_org
        FROM public.connection_requests cr
       WHERE cr.to_organization_id = NEW.organization_id
         AND cr.status = 'accepted'
         AND cr.request_carrier_supplier IS TRUE
    ) s
    WHERE other_org IS NOT NULL AND other_org <> NEW.organization_id
  LOOP
    PERFORM public.emit_network_notification(
      v_supplier,
      NEW.organization_id,
      'indent_created',
      CONCAT(v_code, ' is open for bids'),
      v_route,
      NEW.supplier_target,
      NEW.id, NULL, NULL,
      CONCAT('indent_created:', NEW.id, ':', v_supplier),
      jsonb_build_object('indent_code', v_code, 'route', v_route)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_indent_broadcast ON public.indents;
CREATE TRIGGER trg_notify_indent_broadcast
  AFTER INSERT OR UPDATE OF status ON public.indents
  FOR EACH ROW EXECUTE FUNCTION public.notify_indent_broadcast();

-- ── 2. bid_received / counter_offered / awarded on direct_quotes ───────────
-- One trigger covers the quote lifecycle:
--   INSERT                       → bid_received      (→ indent owner)
--   counter_amount first set     → counter_offered   (→ the other side)
--   status → accepted            → awarded           (→ bidder)
CREATE OR REPLACE FUNCTION public.notify_direct_quote_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
  v_code text;
  v_route text;
  v_bidder_name text;
BEGIN
  SELECT i.organization_id,
         COALESCE(i.indent_operational_code, i.indent_number, i.indent_code, 'Indent'),
         public.indent_route_label(i)
    INTO v_owner_org, v_code, v_route
    FROM public.indents i
   WHERE i.id = NEW.indent_id;

  IF v_owner_org IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.name INTO v_bidder_name
    FROM public.organizations o
   WHERE o.id = NEW.bidder_organization_id;

  -- A supplier quoted → tell the indent owner.
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_network_notification(
      v_owner_org,
      NEW.bidder_organization_id,
      'bid_received',
      CONCAT(COALESCE(v_bidder_name, 'A partner'), ' quoted on ', v_code),
      v_route,
      NEW.amount,
      NEW.indent_id, NEW.id, NULL,
      CONCAT('bid_received:', NEW.id),
      jsonb_build_object('indent_code', v_code, 'route', v_route)
    );
    RETURN NEW;
  END IF;

  -- Counter offer: whoever did not place the original quote is the actor, so the
  -- owner countering notifies the bidder and vice versa.
  IF NEW.counter_amount IS DISTINCT FROM OLD.counter_amount
     AND NEW.counter_amount IS NOT NULL THEN
    PERFORM public.emit_network_notification(
      NEW.bidder_organization_id,
      v_owner_org,
      'counter_offered',
      CONCAT('Counter offer on ', v_code),
      v_route,
      NEW.counter_amount,
      NEW.indent_id, NEW.id, NULL,
      CONCAT('counter_offered:', NEW.id, ':', NEW.counter_amount),
      jsonb_build_object('indent_code', v_code, 'route', v_route)
    );
  END IF;

  -- Award: the owner accepted this supplier's quote.
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    PERFORM public.emit_network_notification(
      NEW.bidder_organization_id,
      v_owner_org,
      'awarded',
      CONCAT(v_code, ' awarded to you'),
      v_route,
      COALESCE(NEW.counter_amount, NEW.amount),
      NEW.indent_id, NEW.id, NULL,
      CONCAT('awarded:', NEW.id),
      jsonb_build_object('indent_code', v_code, 'route', v_route)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_direct_quote_lifecycle ON public.direct_quotes;
CREATE TRIGGER trg_notify_direct_quote_lifecycle
  AFTER INSERT OR UPDATE OF status, counter_amount ON public.direct_quotes
  FOR EACH ROW EXECUTE FUNCTION public.notify_direct_quote_lifecycle();

-- ── 3. quote_requested → owner invited a specific supplier ─────────────────
-- `indents.assigned_supplier_id` being set is the request/award signal on the
-- indent itself (set directly, or by trg_quote_accepted_set_indent_supplier).
CREATE OR REPLACE FUNCTION public.notify_indent_supplier_requested()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_route text;
  v_supplier_org uuid;
BEGIN
  IF NEW.assigned_supplier_id IS NULL
     OR NEW.assigned_supplier_id IS NOT DISTINCT FROM OLD.assigned_supplier_id THEN
    RETURN NEW;
  END IF;

  -- assigned_supplier_id is already an FK to organizations(id).
  v_supplier_org := NEW.assigned_supplier_id;

  v_code := COALESCE(NEW.indent_operational_code, NEW.indent_number, NEW.indent_code, 'Indent');
  v_route := public.indent_route_label(NEW);

  PERFORM public.emit_network_notification(
    v_supplier_org,
    NEW.organization_id,
    'quote_requested',
    CONCAT('Quote requested on ', v_code),
    v_route,
    NEW.supplier_target,
    NEW.id, NULL, NULL,
    CONCAT('quote_requested:', NEW.id, ':', v_supplier_org),
    jsonb_build_object('indent_code', v_code, 'route', v_route)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_indent_supplier_requested ON public.indents;
CREATE TRIGGER trg_notify_indent_supplier_requested
  AFTER UPDATE OF assigned_supplier_id ON public.indents
  FOR EACH ROW EXECUTE FUNCTION public.notify_indent_supplier_requested();

-- ── 4. bid_received on marketplace `bids` (post-based flow) ────────────────
CREATE OR REPLACE FUNCTION public.notify_post_bid_received()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
  v_indent_id uuid;
  v_bidder_name text;
BEGIN
  SELECT p.organization_id, p.source_indent_id
    INTO v_owner_org, v_indent_id
    FROM public.posts p
   WHERE p.id = NEW.post_id;

  IF v_owner_org IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.name INTO v_bidder_name
    FROM public.organizations o
   WHERE o.id = NEW.bidder_organization_id;

  PERFORM public.emit_network_notification(
    v_owner_org,
    NEW.bidder_organization_id,
    'bid_received',
    CONCAT(COALESCE(v_bidder_name, 'A partner'), ' placed a bid'),
    NULL,
    NEW.amount,
    v_indent_id, NULL, NEW.id,
    CONCAT('bid_received:post:', NEW.id),
    '{}'::jsonb
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_bid_received ON public.bids;
CREATE TRIGGER trg_notify_post_bid_received
  AFTER INSERT ON public.bids
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_bid_received();

-- Realtime delivery for the inbox.
ALTER PUBLICATION supabase_realtime ADD TABLE public.network_notifications;
