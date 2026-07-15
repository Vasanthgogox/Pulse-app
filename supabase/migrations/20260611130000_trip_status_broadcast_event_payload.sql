-- Trip status → chat: embed structured event_payload for client silent merges,
-- and skip fn_ensure_trip_party_conversations when threads already exist (less locking).

-- ── 1. Status broadcast messages carry event_payload inside metadata JSONB ─────

CREATE OR REPLACE FUNCTION public.fn_post_system_message_to_trip_chats(
  p_trip_id       UUID,
  p_content       TEXT,
  p_dedupe_status TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv          RECORD;
  v_meta          JSONB;
  v_source_trip   RECORD;
  v_partner_org   UUID;
  v_partner_trip  RECORD;
  v_partner_conv  UUID;
BEGIN
  v_meta := jsonb_build_object(
    'trip_status_broadcast', '1',
    'status', COALESCE(p_dedupe_status, ''),
    'event_payload', jsonb_build_object(
      'new_status', NULLIF(trim(COALESCE(p_dedupe_status, '')), ''),
      'trip_id', p_trip_id
    )
  );

  SELECT id, organization_id, trip_number, client_id, supplier_id
  INTO   v_source_trip
  FROM   public.trips
  WHERE  id = p_trip_id;

  IF NOT FOUND THEN RETURN; END IF;

  FOR v_conv IN
    SELECT id, party_type, organization_id, client_id, supplier_id
    FROM   public.trip_conversations
    WHERE  trip_id = p_trip_id
  LOOP

    IF p_dedupe_status IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trip_messages tm
      WHERE  tm.conversation_id = v_conv.id
        AND  tm.message_type    = 'system'
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (
          (tm.metadata->>'status') = trim(p_dedupe_status)
          OR (tm.metadata->'event_payload'->>'new_status') = trim(p_dedupe_status)
        )
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,     sender_user_id,
      sender_role,      sender_name,         content,
      message_type,     is_read,             metadata
    ) VALUES (
      v_conv.id,        v_conv.organization_id, NULL,
      'system',         'Trip System',          p_content,
      'system',         FALSE,                  v_meta
    );

    v_partner_org := NULL;

    IF v_conv.party_type = 'client' AND v_conv.client_id IS NOT NULL THEN
      SELECT linked_organization_id INTO v_partner_org
      FROM   public.clients
      WHERE  id = v_conv.client_id;

    ELSIF v_conv.party_type = 'supplier' AND v_conv.supplier_id IS NOT NULL THEN
      SELECT linked_organization_id INTO v_partner_org
      FROM   public.suppliers
      WHERE  id = v_conv.supplier_id;
    END IF;

    IF v_partner_org IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id, organization_id INTO v_partner_trip
    FROM   public.trips
    WHERE  organization_id = v_partner_org
      AND  trip_number     = v_source_trip.trip_number
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT id INTO v_partner_conv
    FROM   public.trip_conversations
    WHERE  trip_id    = v_partner_trip.id
      AND  party_type = v_conv.party_type
    LIMIT 1;

    IF v_partner_conv IS NULL THEN CONTINUE; END IF;

    IF p_dedupe_status IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trip_messages tm
      WHERE  tm.conversation_id = v_partner_conv
        AND  tm.message_type    = 'system'
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (
          (tm.metadata->>'status') = trim(p_dedupe_status)
          OR (tm.metadata->'event_payload'->>'new_status') = trim(p_dedupe_status)
        )
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,           sender_user_id,
      sender_role,      sender_name,               content,
      message_type,     is_read,                   metadata
    ) VALUES (
      v_partner_conv,   v_partner_trip.organization_id, NULL,
      'system',         'Trip System',                  p_content,
      'system',         FALSE,                          v_meta
    );

  END LOOP;
END;
$$;

-- ── 2. Broadcast trigger: only ensure conversations when none exist yet ────────

CREATE OR REPLACE FUNCTION public.fn_broadcast_trip_status_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg      TEXT;
  v_terminal BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_msg := public.fn_trip_status_chat_message_body(NEW);
  IF v_msg IS NULL THEN
    RETURN NEW;
  END IF;

  v_terminal := NEW.status IN ('completed', 'delivered', 'done', 'cancelled');

  IF NOT EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = NEW.id LIMIT 1) THEN
    PERFORM public.fn_ensure_trip_party_conversations(NEW.id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = NEW.id LIMIT 1) THEN
    PERFORM public.fn_post_system_message_to_trip_chats(NEW.id, v_msg, NEW.status::text);
  END IF;

  IF v_terminal THEN
    PERFORM public.fn_post_trip_feedback_prompt_to_chats(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;
