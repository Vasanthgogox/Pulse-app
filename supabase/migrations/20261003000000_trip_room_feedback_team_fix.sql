-- Trip room: stop mirroring lane-only feedback debrief cards; dedupe existing junk;
-- expose refresh_trip_chat_room_team for assignment-driven participant sync.

-- ── 1. Remove feedback_request from operational → team room mirror ───────────

CREATE OR REPLACE FUNCTION public.fn_mirror_operational_to_trip_room()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id   uuid;
  v_event     text;
  v_title     text;
  v_body      text;
  v_meta      jsonb;
  v_card_meta jsonb;
BEGIN
  -- Mission debrief belongs on client/supplier party lanes only — not the unified team room.
  IF NEW.message_type IN ('feedback_request', 'feedback') THEN
    RETURN NEW;
  END IF;

  IF NEW.message_type NOT IN (
    'status_change', 'system', 'system_log', 'update',
    'ledger_event', 'ledger', 'payment', 'ledger_update',
    'document_upload', 'document_share',
    'location_log', 'tracking', 'assignment_update'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT tc.trip_id INTO v_trip_id
  FROM public.trip_conversations tc
  WHERE tc.id = NEW.conversation_id;
  IF v_trip_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.fn_ensure_trip_chat_room_core(v_trip_id);

  v_meta := coalesce(NEW.metadata, '{}'::jsonb);
  v_body := coalesce(NEW.content, '');

  v_event := coalesce(
    v_meta->>'event_type',
    CASE NEW.message_type
      WHEN 'status_change' THEN 'status_change'
      WHEN 'ledger_event' THEN 'ledger_event'
      WHEN 'ledger' THEN 'ledger_event'
      WHEN 'payment' THEN 'payment_received'
      WHEN 'document_upload' THEN 'pod_uploaded'
      WHEN 'document_share' THEN 'document_shared'
      ELSE NEW.message_type
    END
  );

  v_title := CASE v_event
    WHEN 'status_change' THEN
      'Status: ' || coalesce(v_meta->>'new_status', v_meta->'event_payload'->>'new_status', 'updated')
    WHEN 'ledger_event' THEN
      'Payment update'
    WHEN 'payment_received' THEN
      'Payment received'
    WHEN 'pod_uploaded' THEN
      'Document uploaded'
    WHEN 'document_shared' THEN
      coalesce(v_meta->>'document_name', 'Document shared')
    ELSE
      left(v_body, 80)
  END;

  v_card_meta := v_meta || jsonb_build_object(
    'source_lane', (SELECT party_type FROM trip_conversations WHERE id = NEW.conversation_id),
    'sender_name', NEW.sender_name,
    'sender_role', NEW.sender_role
  );

  IF v_event = 'status_change' THEN
    v_card_meta := v_card_meta || jsonb_build_object(
      'actions', jsonb_build_array(
        jsonb_build_object('id', 'view_trip', 'label', 'View trip')
      )
    );
  ELSIF v_event IN ('pod_uploaded', 'document_shared') THEN
    v_card_meta := v_card_meta || jsonb_build_object(
      'actions', jsonb_build_array(
        jsonb_build_object('id', 'view_document', 'label', 'View document')
      )
    );
  ELSIF v_event IN ('ledger_event', 'payment_received') THEN
    v_card_meta := v_card_meta || jsonb_build_object(
      'actions', jsonb_build_array(
        jsonb_build_object('id', 'view_ledger', 'label', 'View ledger')
      )
    );
  END IF;

  PERFORM public.fn_post_trip_room_action_card(
    v_trip_id, v_event, v_title, v_body, v_card_meta, NEW.id
  );

  RETURN NEW;
END;
$$;

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

  IF v_msg.message_type IN ('feedback_request', 'feedback') THEN
    RETURN false;
  END IF;

  IF v_msg.message_type NOT IN (
    'status_change', 'system', 'system_log', 'update',
    'ledger_event', 'ledger', 'payment', 'ledger_update',
    'document_upload', 'document_share',
    'location_log', 'tracking', 'assignment_update'
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
      'location_log', 'tracking', 'assignment_update'
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

-- ── 2. One-time cleanup: remove mirrored debrief spam from team rooms ────────

DELETE FROM public.chat_messages cm
USING public.chat_conversations cc
WHERE cm.conversation_id = cc.id
  AND cc.conversation_type = 'trip'
  AND (
    cm.message_type IN ('feedback_request', 'feedback')
    OR (
      cm.message_type = 'action_card'
      AND coalesce(cm.metadata->>'event_type', '') IN ('feedback_request', 'feedback')
    )
    OR (
      cm.message_type = 'action_card'
      AND coalesce(cm.metadata->>'body', cm.content, '') ILIKE '%rate this partner to close the mission debrief%'
    )
  );

-- ── 3. Refresh team participants from trip assignment (no message backfill) ───

CREATE OR REPLACE FUNCTION public.refresh_trip_chat_room_team(p_trip_id uuid)
RETURNS public.chat_conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.chat_conversations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_can_access_trip_for_chat(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized for trip chat room' USING ERRCODE = '42501';
  END IF;

  v_row := public.fn_ensure_trip_chat_room_core(p_trip_id, auth.uid());

  INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
  VALUES (v_row.id, auth.uid(), 'member')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_trip_chat_room_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_trip_chat_room_team(uuid) TO authenticated;

COMMENT ON FUNCTION public.refresh_trip_chat_room_team(uuid) IS
  'Re-syncs trip room participants from current trip driver/client/supplier/org roster (idempotent).';
