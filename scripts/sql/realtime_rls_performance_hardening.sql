-- Realtime + RLS performance hardening for trip chat.
--
-- Run from Supabase SQL Editor, or with:
--   supabase db query --linked -f scripts/sql/realtime_rls_performance_hardening.sql -o table
--
-- This patch targets:
-- - High latency in send_trip_chat_message RPC
-- - Slow RLS evaluation for trip_messages / trip_conversations
-- - Realtime worker pressure from expensive policy checks
--
-- Notes:
-- - Idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- - Keeps functional behavior: dispatcher, driver, supplier (linked org + indent path), mirroring.

-- =====================================================================================
-- 1) JWT org helper with safe fallback to organization_members
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_my_jwt_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH jwt_orgs AS (
    SELECT
      CASE
        WHEN x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN x::uuid
        ELSE NULL
      END AS org_id
    FROM jsonb_array_elements_text(
      COALESCE(
        (
          COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
          -> 'app_metadata' -> 'organization_ids'
        ),
        '[]'::jsonb
      )
    ) AS x
  ),
  fallback_orgs AS (
    SELECT om.organization_id AS org_id
    FROM public.organization_members om
    WHERE om.user_id = (SELECT auth.uid())
      AND COALESCE(om.status, 'active') = 'active'
  )
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT org_id
      FROM jwt_orgs
      WHERE org_id IS NOT NULL
    ),
    ARRAY[]::uuid[]
  )
  ||
  COALESCE(
    ARRAY(
      SELECT DISTINCT org_id
      FROM fallback_orgs
    ),
    ARRAY[]::uuid[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_jwt_org_ids() TO authenticated;

-- =====================================================================================
-- 2) Fast chat visibility function (single check path used by policies)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.can_access_trip_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      (SELECT auth.uid()) AS uid,
      public.get_my_jwt_org_ids() AS my_orgs
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN me ON true
    WHERE tc.id = p_conversation_id
      AND (
        -- Dispatcher / org member for owning org
        tc.organization_id = ANY(me.my_orgs)

        -- Driver can access their own driver conversation
        OR (
          tc.party_type = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = tc.driver_id
              AND d.user_id = me.uid
          )
        )

        -- Supplier path via linked organization on supplier row
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          JOIN public.suppliers s ON s.id = t.supplier_id
          WHERE t.id = tc.trip_id
            AND s.linked_organization_id = ANY(me.my_orgs)
        )

        -- Supplier path via accepted direct quote
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          JOIN public.direct_quotes dq
            ON dq.indent_id = t.indent_id
           AND lower(trim(COALESCE(dq.status, ''))) = 'accepted'
          WHERE t.id = tc.trip_id
            AND dq.bidder_organization_id = ANY(me.my_orgs)
        )

        -- Supplier path while supplier_id still null (indent assigned supplier)
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          JOIN public.indents i ON i.id = t.indent_id
          WHERE t.id = tc.trip_id
            AND t.supplier_id IS NULL
            AND i.assigned_supplier_id = ANY(me.my_orgs)
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_trip_conversation(uuid) TO authenticated;

-- =====================================================================================
-- 3) Replace expensive trip chat read policies with unified checks
-- =====================================================================================

-- trip_conversations SELECT policies
DROP POLICY IF EXISTS "Linked supplier org reads trip conversations for supplied trips" ON public.trip_conversations;
DROP POLICY IF EXISTS "Linked supplier via indent reads trip conversations" ON public.trip_conversations;

CREATE POLICY "optimized_read_trip_conversations"
  ON public.trip_conversations
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_trip_conversation(trip_conversations.id)
  );

COMMENT ON POLICY "optimized_read_trip_conversations" ON public.trip_conversations IS
  'Consolidated fast path for dispatcher, driver, linked supplier, accepted quote, and indent-assigned supplier access.';

-- trip_messages SELECT policies
DROP POLICY IF EXISTS "Drivers can view messages in their conversations" ON public.trip_messages;
DROP POLICY IF EXISTS "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages;
DROP POLICY IF EXISTS "Linked supplier via indent reads trip messages" ON public.trip_messages;

CREATE POLICY "optimized_read_trip_messages"
  ON public.trip_messages
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_trip_conversation(trip_messages.conversation_id)
  );

COMMENT ON POLICY "optimized_read_trip_messages" ON public.trip_messages IS
  'Consolidated fast read policy to reduce per-row RLS join complexity in chat and Realtime.';

-- =====================================================================================
-- 4) Rewrite send_trip_chat_message (flattened auth checks + race-safe mirror upsert)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.send_trip_chat_message(
  p_conversation_id uuid,
  p_content         text,
  p_sender_role     text,
  p_sender_name     text,
  p_sender_user_id  uuid    DEFAULT NULL::uuid,
  p_message_type    text    DEFAULT 'text'::text,
  p_metadata        jsonb   DEFAULT NULL::jsonb
)
RETURNS public.trip_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv               public.trip_conversations%ROWTYPE;
  v_source_trip        public.trips%ROWTYPE;
  v_source_msg         public.trip_messages%ROWTYPE;
  v_my_orgs            uuid[];
  v_is_authorized      boolean := false;

  v_target_org_id      uuid;
  v_target_conv_id     uuid;
  v_target_sender_role text;
  v_target_party_type  text;
  v_target_party_id    uuid;
  v_target_party_name  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_sender_role NOT IN ('dispatcher', 'client', 'supplier', 'driver', 'system') THEN
    RAISE EXCEPTION 'Invalid sender_role: %', p_sender_role;
  END IF;

  IF p_message_type NOT IN (
    'text', 'update', 'question', 'challenge', 'system', 'ledger_event', 'document_share', 'feedback_request'
  ) THEN
    RAISE EXCEPTION 'Invalid message_type: %', p_message_type;
  END IF;

  IF COALESCE(length(trim(p_content)), 0) = 0 AND p_message_type = 'text' THEN
    RAISE EXCEPTION 'Message content cannot be empty for text messages';
  END IF;

  SELECT * INTO v_conv
  FROM public.trip_conversations
  WHERE id = p_conversation_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found: %', p_conversation_id;
  END IF;

  v_my_orgs := public.get_my_jwt_org_ids();

  IF p_sender_role = 'system' THEN
    v_is_authorized := true;
  ELSIF p_sender_role = 'dispatcher' THEN
    v_is_authorized := (v_conv.organization_id = ANY(v_my_orgs));
  ELSIF p_sender_role = 'driver' AND v_conv.party_type = 'driver' THEN
    v_is_authorized := EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = v_conv.driver_id
        AND d.user_id = (SELECT auth.uid())
    );
  ELSIF p_sender_role = 'supplier' AND v_conv.party_type IN ('supplier', 'driver') THEN
    v_is_authorized := EXISTS (
      SELECT 1
      FROM public.trips t
      LEFT JOIN public.suppliers s ON s.id = t.supplier_id
      LEFT JOIN public.indents i ON i.id = t.indent_id
      LEFT JOIN public.direct_quotes dq
        ON dq.indent_id = t.indent_id
       AND lower(trim(COALESCE(dq.status, ''))) = 'accepted'
      WHERE t.id = v_conv.trip_id
        AND (
          s.linked_organization_id = ANY(v_my_orgs)
          OR i.assigned_supplier_id = ANY(v_my_orgs)
          OR dq.bidder_organization_id = ANY(v_my_orgs)
        )
    );
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized for source organization or conversation' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_source_trip
  FROM public.trips
  WHERE id = v_conv.trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source trip not found for conversation: %', p_conversation_id;
  END IF;

  INSERT INTO public.trip_messages (
    conversation_id,
    organization_id,
    sender_user_id,
    sender_role,
    sender_name,
    content,
    message_type,
    is_read,
    metadata
  )
  VALUES (
    v_conv.id,
    v_conv.organization_id,
    p_sender_user_id,
    p_sender_role,
    p_sender_name,
    p_content,
    p_message_type,
    false,
    p_metadata
  )
  RETURNING * INTO v_source_msg;

  -- No mirror path for feedback_request, driver/supplier/client authored messages.
  IF p_message_type = 'feedback_request' OR p_sender_role NOT IN ('dispatcher', 'system') THEN
    RETURN v_source_msg;
  END IF;

  IF v_conv.party_type = 'client' THEN
    SELECT c.linked_organization_id
      INTO v_target_org_id
    FROM public.clients c
    WHERE c.id = v_conv.client_id;

    v_target_party_type := 'supplier';
    v_target_sender_role := 'supplier';

    SELECT s.id, COALESCE(NULLIF(s.company_name, ''), NULLIF(s.name, ''), 'Supplier')
      INTO v_target_party_id, v_target_party_name
    FROM public.suppliers s
    WHERE s.organization_id = v_target_org_id
      AND s.linked_organization_id = v_conv.organization_id
    ORDER BY s.created_at DESC
    LIMIT 1;
  ELSIF v_conv.party_type = 'supplier' THEN
    SELECT s.linked_organization_id
      INTO v_target_org_id
    FROM public.suppliers s
    WHERE s.id = v_conv.supplier_id;

    v_target_party_type := 'client';
    v_target_sender_role := 'client';

    SELECT c.id, COALESCE(NULLIF(c.name, ''), 'Client')
      INTO v_target_party_id, v_target_party_name
    FROM public.clients c
    WHERE c.organization_id = v_target_org_id
      AND c.linked_organization_id = v_conv.organization_id
    ORDER BY c.created_at DESC
    LIMIT 1;
  ELSE
    RETURN v_source_msg;
  END IF;

  IF v_target_org_id IS NULL OR v_target_party_id IS NULL THEN
    RETURN v_source_msg;
  END IF;

  INSERT INTO public.trip_conversations (
    organization_id,
    trip_id,
    party_type,
    party_name,
    client_id,
    supplier_id,
    driver_id
  )
  SELECT
    v_target_org_id,
    t.id,
    v_target_party_type,
    v_target_party_name,
    CASE WHEN v_target_party_type = 'client' THEN v_target_party_id ELSE NULL END,
    CASE WHEN v_target_party_type = 'supplier' THEN v_target_party_id ELSE NULL END,
    NULL
  FROM public.trips t
  WHERE t.organization_id = v_target_org_id
    AND t.trip_number = v_source_trip.trip_number
  ORDER BY t.created_at DESC
  LIMIT 1
  ON CONFLICT (trip_id, party_type) DO UPDATE
  SET
    party_name = COALESCE(NULLIF(trim(EXCLUDED.party_name), ''), trip_conversations.party_name),
    client_id = COALESCE(EXCLUDED.client_id, trip_conversations.client_id),
    supplier_id = COALESCE(EXCLUDED.supplier_id, trip_conversations.supplier_id),
    updated_at = now()
  RETURNING id INTO v_target_conv_id;

  IF v_target_conv_id IS NOT NULL THEN
    INSERT INTO public.trip_messages (
      conversation_id,
      organization_id,
      sender_user_id,
      sender_role,
      sender_name,
      content,
      message_type,
      is_read,
      metadata
    )
    VALUES (
      v_target_conv_id,
      v_target_org_id,
      p_sender_user_id,
      v_target_sender_role,
      p_sender_name,
      p_content,
      p_message_type,
      false,
      p_metadata
    );
  END IF;

  RETURN v_source_msg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_trip_chat_message(uuid, text, text, text, uuid, text, jsonb) TO authenticated;

-- =====================================================================================
-- 5) Supporting indexes to prevent sequential scans in hot paths
-- =====================================================================================

CREATE INDEX IF NOT EXISTS idx_drivers_user_id_id
  ON public.drivers(user_id, id);

CREATE INDEX IF NOT EXISTS idx_suppliers_linked_org_id
  ON public.suppliers(linked_organization_id, id);

CREATE INDEX IF NOT EXISTS idx_trip_messages_conversation_org
  ON public.trip_messages(conversation_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_trip_conversations_trip_party
  ON public.trip_conversations(trip_id, party_type);

CREATE INDEX IF NOT EXISTS idx_trips_indent_supplier
  ON public.trips(indent_id, supplier_id);

-- =====================================================================================
-- 6) Verification queries (run after representative load)
-- =====================================================================================

-- 6.1: check that optimized policies exist
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('trip_messages', 'trip_conversations')
  AND policyname IN ('optimized_read_trip_messages', 'optimized_read_trip_conversations')
ORDER BY tablename, policyname;

-- 6.2: check p95/p99 candidate by mean + max for key chat/realtime operations
SELECT
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(max_exec_time::numeric, 2) AS max_ms,
  rows,
  left(query, 220) AS query
FROM extensions.pg_stat_statements
WHERE query ILIKE '%send_trip_chat_message%'
   OR query ILIKE '%trip_messages%'
   OR query ILIKE '%realtime.list_changes%'
ORDER BY total_exec_time DESC
LIMIT 30;

-- 6.3: useful explain probe for a live conversation query shape
-- Replace <conversation_uuid> before running.
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id, created_at, sender_role, content
-- FROM public.trip_messages
-- WHERE conversation_id = '<conversation_uuid>'::uuid
-- ORDER BY created_at DESC
-- LIMIT 50;
