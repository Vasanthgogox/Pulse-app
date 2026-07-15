-- SECURITY FIX: SEC-2 + SEC-3
-- Add SET search_path = '' to all flagged functions.
-- Fix is_org_member: already STABLE + SECURITY DEFINER, add search_path
--   and use (SELECT auth.uid()) for initplan optimization (PERF-1 partial).

-- ── is_org_member ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$;

-- ── set_updated_at ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── sync_conversation_on_message ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  UPDATE public.trip_conversations
  SET
    last_message_at      = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 120),
    unread_dispatcher_count = CASE
      WHEN NEW.sender_role <> 'dispatcher' THEN unread_dispatcher_count + 1
      ELSE unread_dispatcher_count
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- ── sync_network_conversation_on_message ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_network_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_org_a uuid;
  v_org_b uuid;
BEGIN
  SELECT org_a_id, org_b_id INTO v_org_a, v_org_b
  FROM public.network_conversations WHERE id = NEW.conversation_id;

  UPDATE public.network_conversations
  SET
    last_message_at      = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 120),
    unread_count_a = CASE WHEN NEW.sender_org_id <> v_org_a THEN unread_count_a + 1 ELSE unread_count_a END,
    unread_count_b = CASE WHEN NEW.sender_org_id <> v_org_b THEN unread_count_b + 1 ELSE unread_count_b END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

-- ── mark_network_conversation_read ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_network_conversation_read(
  p_conversation_id uuid,
  p_reader_org_id   uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_a uuid;
BEGIN
  SELECT org_a_id INTO v_org_a
  FROM public.network_conversations WHERE id = p_conversation_id;

  IF p_reader_org_id = v_org_a THEN
    UPDATE public.network_conversations SET unread_count_a = 0, updated_at = NOW() WHERE id = p_conversation_id;
  ELSE
    UPDATE public.network_conversations SET unread_count_b = 0, updated_at = NOW() WHERE id = p_conversation_id;
  END IF;

  UPDATE public.network_messages
  SET is_read_by_other = TRUE, read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND sender_org_id <> p_reader_org_id
    AND is_read_by_other = FALSE;
END;
$$;

-- ── normalize_phone_last10 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_phone_last10(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

-- ── discover_extract_city ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.discover_extract_city(p_location text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(
    lower(trim(split_part(coalesce(p_location, ''), ',', 1))),
    ''
  );
$$;

-- ── column_exists ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.column_exists(
  p_schema text,
  p_table  text,
  p_column text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = p_schema
      AND table_name = p_table
      AND column_name = p_column
  );
END;
$$;

-- ── enforce_indent_draft_broadcast_rules ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_indent_draft_broadcast_rules()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'broadcast' AND NEW.shared_at IS NULL THEN
      NEW.shared_at := now();
    END IF;
    IF NEW.status = 'draft' AND NEW.last_saved_at IS NULL THEN
      NEW.last_saved_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'broadcast' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Broadcast indents cannot be reverted to draft'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'broadcast' AND (
    NEW.pickup_area IS DISTINCT FROM OLD.pickup_area OR
    NEW.drop_location IS DISTINCT FROM OLD.drop_location OR
    NEW.client_name IS DISTINCT FROM OLD.client_name OR
    NEW.client_price IS DISTINCT FROM OLD.client_price OR
    NEW.supplier_target IS DISTINCT FROM OLD.supplier_target OR
    NEW.vehicle_type IS DISTINCT FROM OLD.vehicle_type OR
    NEW.load_type IS DISTINCT FROM OLD.load_type OR
    NEW.pickup_date IS DISTINCT FROM OLD.pickup_date OR
    NEW.circulation_target IS DISTINCT FROM OLD.circulation_target
  ) THEN
    RAISE EXCEPTION 'This indent has been shared and cannot be edited'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status <> 'broadcast' AND NEW.status = 'broadcast' AND NEW.shared_at IS NULL THEN
    NEW.shared_at := now();
  END IF;

  IF NEW.status = 'draft' THEN
    NEW.last_saved_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- ── check_trip_finance_adjustment_org_match ────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_trip_finance_adjustment_org_match()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = NEW.trip_id
      AND t.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'trip_finance_adjustments: trip_id must belong to organization_id';
  END IF;
  RETURN NEW;
END;
$$;

-- ── fn_build_chat_lanes ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_build_chat_lanes(p_unified jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH expanded AS (
    SELECT
      nullif(trim(c->>'trip_id'), '') AS trip_id,
      CASE
        WHEN nullif(trim(c->>'indent_id'), '') IS NOT NULL
          THEN trim(c->>'indent_id')::uuid
      END AS indent_id,
      nullif(trim(m->>'id'), '') AS msg_id,
      coalesce(trim(m->>'message_type'), '') AS msg_type
    FROM jsonb_array_elements(coalesce(p_unified, '[]'::jsonb)) AS c
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(c->'messages', '[]'::jsonb)) AS m
  ),
  commercial AS (
    SELECT indent_id::text AS k, jsonb_agg(to_jsonb(msg_id) ORDER BY msg_id) AS v
    FROM expanded
    WHERE indent_id IS NOT NULL
      AND msg_type IN ('ledger_event', 'ledger', 'payment', 'ledger_update')
    GROUP BY indent_id
  ),
  operational AS (
    SELECT trip_id AS k, jsonb_agg(to_jsonb(msg_id) ORDER BY msg_id) AS v
    FROM expanded
    WHERE trip_id IS NOT NULL
      AND msg_type NOT IN ('ledger_event', 'ledger', 'payment', 'ledger_update')
    GROUP BY trip_id
  )
  SELECT jsonb_build_object(
    'commercial_by_indent',
      COALESCE((SELECT jsonb_object_agg(k, v) FROM commercial), '{}'::jsonb),
    'operational_by_trip',
      COALESCE((SELECT jsonb_object_agg(k, v) FROM operational), '{}'::jsonb)
  );
$$;
