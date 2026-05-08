-- ==============================================================================
-- MASTER REALTIME OPTIMIZATION (SAFE / IDEMPOTENT)
-- Fixes: chat RLS latency, send_trip_chat_message bottlenecks, refresh lock pressure
-- ==============================================================================
--
-- Run with:
--   supabase db query --linked -f scripts/sql/master_realtime_optimization_safe.sql -o table
--
-- Design goals:
-- - Idempotent DDL (safe to re-run)
-- - Preserve existing write behavior (do not remove broad manage policies blindly)
-- - Avoid duplicate pg_cron jobs
-- - Keep runtime checks cheap for Realtime/RLS

-- ==============================================================================
-- PHASE 1: JWT HOOK + HELPERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  claims jsonb;
  user_role text;
  org_ids uuid[];
BEGIN
  SELECT p.role
    INTO user_role
  FROM public.profiles p
  WHERE p.id = (event->>'user_id')::uuid;

  SELECT array_agg(om.organization_id)
    INTO org_ids
  FROM public.organization_members om
  WHERE om.user_id = (event->>'user_id')::uuid
    AND COALESCE(om.status, 'active') = 'active';

  claims := COALESCE(event->'claims', '{}'::jsonb);

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata,user_role}', to_jsonb(user_role), true);
  END IF;

  claims := jsonb_set(
    claims,
    '{app_metadata,organization_ids}',
    COALESCE(to_jsonb(org_ids), '[]'::jsonb),
    true
  );

  RETURN jsonb_set(event, '{claims}', claims, true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'JWT hook failed: %', SQLERRM;
    RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO authenticated;

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
        (COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
          -> 'app_metadata' -> 'organization_ids'),
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
  SELECT ARRAY(
    SELECT DISTINCT org_id
    FROM (
      SELECT org_id FROM jwt_orgs WHERE org_id IS NOT NULL
      UNION ALL
      SELECT org_id FROM fallback_orgs
    ) u
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_jwt_org_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_cross_org_read_message(p_conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.trips t ON t.id = tc.trip_id
    LEFT JOIN public.suppliers s ON s.id = t.supplier_id
    LEFT JOIN public.indents i ON i.id = t.indent_id
    LEFT JOIN public.direct_quotes dq
      ON dq.indent_id = t.indent_id
     AND lower(trim(COALESCE(dq.status, ''))) = 'accepted'
    WHERE tc.id = p_conv_id
      AND (
        s.linked_organization_id = ANY(public.get_my_jwt_org_ids())
        OR i.assigned_supplier_id = ANY(public.get_my_jwt_org_ids())
        OR dq.bidder_organization_id = ANY(public.get_my_jwt_org_ids())
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_cross_org_read_message(uuid) TO authenticated;

-- ==============================================================================
-- PHASE 2: RLS READ-PATH FLATTENING (keep existing write policies)
-- ==============================================================================

DROP POLICY IF EXISTS "optimized_read_trip_messages" ON public.trip_messages;
CREATE POLICY "optimized_read_trip_messages"
ON public.trip_messages
FOR SELECT
TO authenticated
USING (
  organization_id = ANY(public.get_my_jwt_org_ids())
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.drivers d ON d.id = tc.driver_id
    WHERE tc.id = trip_messages.conversation_id
      AND d.user_id = (SELECT auth.uid())
  )
  OR public.can_cross_org_read_message(trip_messages.conversation_id)
);

DROP POLICY IF EXISTS "optimized_read_trip_conversations" ON public.trip_conversations;
CREATE POLICY "optimized_read_trip_conversations"
ON public.trip_conversations
FOR SELECT
TO authenticated
USING (
  organization_id = ANY(public.get_my_jwt_org_ids())
  OR (
    party_type = 'driver'
    AND EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = trip_conversations.driver_id
        AND d.user_id = (SELECT auth.uid())
    )
  )
  OR public.can_cross_org_read_message(trip_conversations.id)
);

-- ==============================================================================
-- PHASE 3: send_trip_chat_message optimization
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.send_trip_chat_message(
  p_conversation_id uuid,
  p_content text,
  p_sender_role text,
  p_sender_name text,
  p_sender_user_id uuid DEFAULT NULL::uuid,
  p_message_type text DEFAULT 'text'::text,
  p_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS public.trip_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_conv               public.trip_conversations%ROWTYPE;
  v_source_trip        public.trips%ROWTYPE;
  v_source_msg         public.trip_messages%ROWTYPE;
  v_my_orgs            uuid[];
  v_is_authorized      boolean := false;
  v_target_org_id      uuid;
  v_target_party_type  text;
  v_target_party_id    uuid;
  v_target_party_name  text;
  v_target_conv_id     uuid;
  v_target_sender_role text;
BEGIN
  IF p_sender_role NOT IN ('dispatcher', 'client', 'supplier', 'driver', 'system') THEN
    RAISE EXCEPTION 'Invalid sender_role: %', p_sender_role;
  END IF;

  IF p_message_type NOT IN ('text', 'update', 'question', 'challenge', 'system', 'ledger_event', 'document_share', 'feedback_request') THEN
    RAISE EXCEPTION 'Invalid message_type: %', p_message_type;
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
    v_is_authorized := public.can_cross_org_read_message(v_conv.id);
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized for source organization or conversation';
  END IF;

  SELECT * INTO v_source_trip
  FROM public.trips
  WHERE id = v_conv.trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source trip not found for conversation: %', p_conversation_id;
  END IF;

  INSERT INTO public.trip_messages (
    conversation_id, organization_id, sender_user_id, sender_role,
    sender_name, content, message_type, is_read, metadata
  )
  VALUES (
    v_conv.id, v_conv.organization_id, p_sender_user_id, p_sender_role,
    p_sender_name, p_content, p_message_type, false, p_metadata
  )
  RETURNING * INTO v_source_msg;

  IF p_message_type = 'feedback_request' OR p_sender_role NOT IN ('dispatcher', 'system') THEN
    RETURN v_source_msg;
  END IF;

  IF v_conv.party_type = 'client' THEN
    SELECT linked_organization_id INTO v_target_org_id
    FROM public.clients WHERE id = v_conv.client_id;
  ELSIF v_conv.party_type = 'supplier' THEN
    SELECT linked_organization_id INTO v_target_org_id
    FROM public.suppliers WHERE id = v_conv.supplier_id;
  END IF;

  IF v_target_org_id IS NULL THEN
    RETURN v_source_msg;
  END IF;

  IF v_conv.party_type = 'client' THEN
    v_target_party_type := 'supplier';
    v_target_sender_role := 'supplier';
    SELECT id, COALESCE(NULLIF(company_name, ''), NULLIF(name, ''), 'Supplier')
      INTO v_target_party_id, v_target_party_name
    FROM public.suppliers
    WHERE organization_id = v_target_org_id
      AND linked_organization_id = v_conv.organization_id
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    v_target_party_type := 'client';
    v_target_sender_role := 'client';
    SELECT id, COALESCE(NULLIF(name, ''), 'Client')
      INTO v_target_party_id, v_target_party_name
    FROM public.clients
    WHERE organization_id = v_target_org_id
      AND linked_organization_id = v_conv.organization_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_target_party_id IS NULL THEN
    RETURN v_source_msg;
  END IF;

  INSERT INTO public.trip_conversations (
    organization_id, trip_id, party_type, party_name,
    client_id, supplier_id, driver_id
  )
  SELECT
    v_target_org_id, t.id, v_target_party_type, v_target_party_name,
    CASE WHEN v_target_party_type = 'client' THEN v_target_party_id ELSE NULL END,
    CASE WHEN v_target_party_type = 'supplier' THEN v_target_party_id ELSE NULL END,
    NULL
  FROM public.trips t
  WHERE t.organization_id = v_target_org_id
    AND t.trip_number = v_source_trip.trip_number
  ORDER BY t.created_at DESC
  LIMIT 1
  ON CONFLICT (trip_id, party_type) DO UPDATE
  SET updated_at = now()
  RETURNING id INTO v_target_conv_id;

  IF v_target_conv_id IS NOT NULL THEN
    INSERT INTO public.trip_messages (
      conversation_id, organization_id, sender_user_id, sender_role,
      sender_name, content, message_type, is_read, metadata
    )
    VALUES (
      v_target_conv_id, v_target_org_id, p_sender_user_id, v_target_sender_role,
      p_sender_name, p_content, p_message_type, false, p_metadata
    );
  END IF;

  RETURN v_source_msg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_trip_chat_message(uuid, text, text, text, uuid, text, jsonb) TO authenticated;

-- ==============================================================================
-- PHASE 4: handle_new_user safety patch
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  r text := COALESCE(NULLIF(trim(new.raw_user_meta_data->>'role'), ''), 'user');
  org_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, aggregated, asset, company_name, phone)
    VALUES (
      new.id,
      new.email,
      COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
      CASE WHEN r IN ('user', 'driver') THEN r ELSE 'user' END,
      CASE WHEN r = 'driver' THEN false ELSE COALESCE((new.raw_user_meta_data->>'aggregated')::boolean, true) END,
      CASE WHEN r = 'driver' THEN false ELSE COALESCE((new.raw_user_meta_data->>'asset')::boolean, true) END,
      NULLIF(trim(new.raw_user_meta_data->>'company_name'), ''),
      NULLIF(trim(new.raw_user_meta_data->>'phone'), '')
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  IF r = 'user' AND NOT COALESCE((new.raw_user_meta_data->>'skip_org_creation')::boolean, false) THEN
    BEGIN
      INSERT INTO public.organizations (owner_id, name)
      VALUES (new.id, COALESCE(NULLIF(trim(new.raw_user_meta_data->>'company_name'), ''), 'My Organization'))
      RETURNING id INTO org_id;

      INSERT INTO public.organization_members (organization_id, user_id, role, status)
      VALUES (org_id, new.id, 'owner', 'active')
      ON CONFLICT DO NOTHING;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Org creation failed for user %: %', new.id, SQLERRM;
    END;
  END IF;

  RETURN new;
END;
$$;

-- ==============================================================================
-- PHASE 5: dashboard refresh lock mitigation
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_refresh_dashboard_trip_metrics ON public.trips;
DROP FUNCTION IF EXISTS public.refresh_dashboard_trip_metrics();

CREATE SCHEMA IF NOT EXISTS ops;

CREATE OR REPLACE FUNCTION ops.refresh_dashboard_metrics_safe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_trip_metrics;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Dashboard refresh failed: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'refresh-dashboard';

    PERFORM cron.schedule(
      'refresh-dashboard',
      '*/3 * * * *',
      'SELECT ops.refresh_dashboard_metrics_safe()'
    );
  END IF;
END;
$$;

-- ==============================================================================
-- PHASE 6: schema/index optimizations
-- ==============================================================================

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS phone_canonical text
  GENERATED ALWAYS AS (right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10)) STORED;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_canonical text
  GENERATED ALWAYS AS (right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10)) STORED;

CREATE INDEX IF NOT EXISTS idx_drivers_phone_canonical_fast ON public.drivers(phone_canonical);
CREATE INDEX IF NOT EXISTS idx_profiles_phone_canonical_fast ON public.profiles(phone_canonical);

DROP INDEX IF EXISTS public.idx_drivers_unlinked_phone_last10;
DROP INDEX IF EXISTS public.idx_profiles_driver_phone_last10;

CREATE INDEX IF NOT EXISTS idx_drivers_user_id_id ON public.drivers(user_id, id);
CREATE INDEX IF NOT EXISTS idx_suppliers_linked_org_id ON public.suppliers(linked_organization_id, id);
CREATE INDEX IF NOT EXISTS idx_trip_messages_conversation_org ON public.trip_messages(conversation_id, organization_id);

-- ==============================================================================
-- Verification
-- ==============================================================================

SELECT 'fn.custom_access_token_hook' AS check_name, EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook'
) AS ok
UNION ALL
SELECT 'fn.get_my_jwt_org_ids', EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_my_jwt_org_ids'
)
UNION ALL
SELECT 'fn.can_cross_org_read_message', EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'can_cross_org_read_message'
)
UNION ALL
SELECT 'fn.ops.refresh_dashboard_metrics_safe', EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'ops' AND p.proname = 'refresh_dashboard_metrics_safe'
);

SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'refresh-dashboard';
