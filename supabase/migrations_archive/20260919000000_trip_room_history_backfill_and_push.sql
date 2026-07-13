-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 4: Historical backfill + push notification foundation
--
-- 1. Extend action-card poster to preserve legacy timestamps (backfill).
-- 2. One-shot + repeatable batch backfill of operational trip_messages → trip rooms.
-- 3. user_push_tokens + chat_push_outbox + enqueue trigger on chat_messages INSERT.
-- 4. register_push_token RPC for client token registration.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Action card poster (add optional created_at for backfill) ─────────────

CREATE OR REPLACE FUNCTION public.fn_post_trip_room_action_card(
  p_trip_id       uuid,
  p_event_type    text,
  p_title         text,
  p_body          text    DEFAULT '',
  p_metadata      jsonb   DEFAULT '{}'::jsonb,
  p_legacy_msg_id uuid    DEFAULT NULL,
  p_created_at    timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.chat_conversations%ROWTYPE;
  v_meta jsonb;
BEGIN
  SELECT * INTO v_room
  FROM public.chat_conversations
  WHERE trip_id = p_trip_id AND conversation_type = 'trip';
  IF NOT FOUND THEN RETURN; END IF;

  IF p_legacy_msg_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.conversation_id = v_room.id
      AND m.metadata->>'legacy_trip_message_id' = p_legacy_msg_id::text
  ) THEN
    RETURN;
  END IF;

  v_meta := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'event_type', p_event_type,
      'trip_id', p_trip_id,
      'trip_room_mirror', '1'
    );
  IF p_legacy_msg_id IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('legacy_trip_message_id', p_legacy_msg_id::text);
  END IF;

  INSERT INTO public.chat_messages (
    conversation_id, organization_id,
    sender_user_id, sender_type, sender_name,
    message_type, content, metadata, legacy_source, created_at
  )
  VALUES (
    v_room.id, v_room.organization_id,
    NULL, 'system', 'Pulse',
    'action_card',
    coalesce(p_title, ''),
    v_meta || jsonb_build_object('body', coalesce(p_body, '')),
    'trip',
    coalesce(p_created_at, now())
  );
END;
$$;

-- ── 2. Mirror one legacy row (idempotent; used by backfill batches) ─────────

CREATE OR REPLACE FUNCTION public.fn_mirror_legacy_trip_message_to_room(p_msg_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg  public.trip_messages%ROWTYPE;
  v_trip uuid;
  v_event text;
  v_title text;
  v_body  text;
  v_meta  jsonb;
  v_card  jsonb;
BEGIN
  SELECT * INTO v_msg FROM public.trip_messages WHERE id = p_msg_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_msg.message_type NOT IN (
    'status_change', 'system', 'system_log', 'update',
    'ledger_event', 'ledger', 'payment', 'ledger_update',
    'document_upload', 'document_share',
    'location_log', 'tracking', 'feedback_request', 'assignment_update'
  ) THEN
    RETURN false;
  END IF;

  SELECT tc.trip_id INTO v_trip
  FROM public.trip_conversations tc
  WHERE tc.id = v_msg.conversation_id;
  IF v_trip IS NULL THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_conversations cc
    WHERE cc.trip_id = v_trip AND cc.conversation_type = 'trip'
  ) THEN
    RETURN false;
  END IF;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  v_body := coalesce(v_msg.content, '');

  v_event := coalesce(
    v_meta->>'event_type',
    CASE v_msg.message_type
      WHEN 'status_change' THEN 'status_change'
      WHEN 'ledger_event' THEN 'ledger_event'
      WHEN 'ledger' THEN 'ledger_event'
      WHEN 'payment' THEN 'payment_received'
      WHEN 'document_upload' THEN 'pod_uploaded'
      WHEN 'document_share' THEN 'document_shared'
      ELSE v_msg.message_type
    END
  );

  v_title := CASE v_event
    WHEN 'status_change' THEN
      'Status: ' || coalesce(v_meta->>'new_status', v_meta->'event_payload'->>'new_status', 'updated')
    WHEN 'ledger_event' THEN 'Payment update'
    WHEN 'payment_received' THEN 'Payment received'
    WHEN 'pod_uploaded' THEN 'Document uploaded'
    WHEN 'document_shared' THEN coalesce(v_meta->>'document_name', 'Document shared')
    ELSE left(v_body, 80)
  END;

  v_card := v_meta || jsonb_build_object(
    'source_lane', (SELECT party_type FROM trip_conversations WHERE id = v_msg.conversation_id),
    'sender_name', v_msg.sender_name,
    'sender_role', v_msg.sender_role
  );

  IF v_event = 'status_change' THEN
    v_card := v_card || jsonb_build_object(
      'actions', jsonb_build_array(jsonb_build_object('id', 'view_trip', 'label', 'View trip'))
    );
  ELSIF v_event IN ('pod_uploaded', 'document_shared') THEN
    v_card := v_card || jsonb_build_object(
      'actions', jsonb_build_array(jsonb_build_object('id', 'view_document', 'label', 'View document'))
    );
  ELSIF v_event IN ('ledger_event', 'payment_received') THEN
    v_card := v_card || jsonb_build_object(
      'actions', jsonb_build_array(jsonb_build_object('id', 'view_ledger', 'label', 'View ledger'))
    );
  END IF;

  PERFORM public.fn_post_trip_room_action_card(
    v_trip, v_event, v_title, v_body, v_card, v_msg.id, v_msg.created_at
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_trip_room_operational_batch(p_limit int DEFAULT 3000)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   record;
  v_done  integer := 0;
  v_limit integer := greatest(coalesce(p_limit, 3000), 1);
BEGIN
  FOR v_row IN
    SELECT tm.id
    FROM public.trip_messages tm
    JOIN public.trip_conversations tc ON tc.id = tm.conversation_id
    JOIN public.chat_conversations cc
      ON cc.trip_id = tc.trip_id AND cc.conversation_type = 'trip'
    WHERE tm.message_type IN (
      'status_change', 'system', 'system_log', 'update',
      'ledger_event', 'ledger', 'payment', 'ledger_update',
      'document_upload', 'document_share',
      'location_log', 'tracking', 'feedback_request', 'assignment_update'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_messages cm
      WHERE cm.conversation_id = cc.id
        AND cm.metadata->>'legacy_trip_message_id' = tm.id::text
    )
    ORDER BY tm.created_at
    LIMIT v_limit
  LOOP
    IF public.fn_mirror_legacy_trip_message_to_room(v_row.id) THEN
      v_done := v_done + 1;
    END IF;
  END LOOP;
  RETURN v_done;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_trip_room_operational_batch(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_trip_room_operational_batch(int) TO service_role;

-- Initial backfill (batched; safe to re-run migration repair if partial).
DO $$
DECLARE
  v_batch int;
  v_total int := 0;
BEGIN
  LOOP
    v_batch := public.backfill_trip_room_operational_batch(4000);
    v_total := v_total + v_batch;
    EXIT WHEN v_batch = 0;
    -- Cap migration runtime; remaining rows: call backfill_trip_room_operational_batch via service_role.
    EXIT WHEN v_total >= 40000;
  END LOOP;
  RAISE NOTICE 'trip_room operational backfill migrated rows: %', v_total;
END $$;

-- ── 3. Push token storage + outbox ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text        NOT NULL,
  platform    text        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user
  ON public.user_push_tokens (user_id);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_push_tokens_select_own" ON public.user_push_tokens;
CREATE POLICY "user_push_tokens_select_own"
  ON public.user_push_tokens FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_push_tokens_upsert_own" ON public.user_push_tokens;
CREATE POLICY "user_push_tokens_upsert_own"
  ON public.user_push_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_push_tokens_update_own" ON public.user_push_tokens;
CREATE POLICY "user_push_tokens_update_own"
  ON public.user_push_tokens FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_push_tokens_delete_own" ON public.user_push_tokens;
CREATE POLICY "user_push_tokens_delete_own"
  ON public.user_push_tokens FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.chat_push_outbox (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL,
  conversation_id  uuid        NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id       uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  title            text        NOT NULL DEFAULT '',
  body             text        NOT NULL DEFAULT '',
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_push_outbox_pending
  ON public.chat_push_outbox (created_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.chat_push_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_push_outbox_select_own" ON public.chat_push_outbox;
CREATE POLICY "chat_push_outbox_select_own"
  ON public.chat_push_outbox FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.fn_enqueue_chat_push_outbox()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body  text;
  v_part  record;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.sender_type = 'system' AND NEW.message_type = 'action_card' THEN
    v_title := coalesce(NEW.content, 'Trip update');
    v_body := coalesce(NEW.metadata->>'body', '');
  ELSE
    v_title := coalesce(nullif(trim(NEW.sender_name), ''), 'New message');
    v_body := left(coalesce(NEW.content, ''), 180);
  END IF;

  FOR v_part IN
    SELECT cp.user_id
    FROM public.chat_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id IS DISTINCT FROM NEW.sender_user_id
      AND EXISTS (
        SELECT 1 FROM public.user_push_tokens upt WHERE upt.user_id = cp.user_id
      )
  LOOP
    INSERT INTO public.chat_push_outbox (
      user_id, organization_id, conversation_id, message_id,
      title, body,
      payload
    )
    VALUES (
      v_part.user_id, NEW.organization_id, NEW.conversation_id, NEW.id,
      v_title, v_body,
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'message_id', NEW.id,
        'trip_id', (SELECT trip_id FROM chat_conversations WHERE id = NEW.conversation_id),
        'message_type', NEW.message_type
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_chat_push_outbox ON public.chat_messages;
CREATE TRIGGER trg_enqueue_chat_push_outbox
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_chat_push_outbox();

-- ── 4. Client RPC: register push token ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token    text,
  p_platform text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_token), '') = '' THEN
    RAISE EXCEPTION 'Token required';
  END IF;
  IF p_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'Invalid platform';
  END IF;

  INSERT INTO public.user_push_tokens (user_id, token, platform, updated_at)
  VALUES (auth.uid(), trim(p_token), p_platform, now())
  ON CONFLICT (user_id, token)
  DO UPDATE SET platform = excluded.platform, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;

COMMENT ON TABLE public.user_push_tokens IS
  'Expo/FCM/APNs device tokens per user. Registered via register_push_token RPC.';
COMMENT ON TABLE public.chat_push_outbox IS
  'Pending push payloads for trip room / platform chat. Process via Edge Function or cron.';
COMMENT ON FUNCTION public.backfill_trip_room_operational_batch(int) IS
  'Idempotent batch backfill of legacy operational trip_messages into unified trip rooms.';
