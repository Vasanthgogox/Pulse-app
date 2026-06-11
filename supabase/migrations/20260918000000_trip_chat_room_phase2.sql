-- ═════════════════════════════════════════════════════════════════════════════
-- Pulse Chat Platform — Phase 2: Unified Trip Room
--
-- One `chat_conversations` row per trip (conversation_type = 'trip') with
-- fan-in participants: fleet org members, assigned driver, linked client &
-- supplier org members.
--
-- Operational legacy messages (status, ledger, documents, tracking) mirror into
-- the unified room as action_card / system lines (deduped by legacy message id).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Deterministic one-room-per-trip constraint ────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_conversations_trip_room
  ON public.chat_conversations (trip_id)
  WHERE conversation_type = 'trip' AND trip_id IS NOT NULL;

-- ── 2. Access helper ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_can_access_trip_for_chat(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = p_trip_id
      AND (
        public.fn_chat_is_org_member(t.organization_id)
        OR EXISTS (
          SELECT 1 FROM public.drivers d
          WHERE d.id = t.driver_id AND d.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = t.client_id
            AND c.linked_organization_id IS NOT NULL
            AND public.fn_chat_is_org_member(c.linked_organization_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.suppliers s
          WHERE s.id = t.supplier_id
            AND s.linked_organization_id IS NOT NULL
            AND public.fn_chat_is_org_member(s.linked_organization_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.fn_can_access_trip_for_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_access_trip_for_chat(uuid) TO authenticated;

-- ── 3. Participant fan-in ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_sync_trip_room_participants(
  p_conversation_id uuid,
  p_trip_id         uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Fleet org: dispatchers, ops, finance, owner.
  INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
  SELECT p_conversation_id, om.user_id,
         CASE WHEN om.role IN ('owner', 'admin') THEN 'admin' ELSE 'member' END
  FROM public.organization_members om
  WHERE om.organization_id = v_trip.organization_id
    AND om.status = 'active'
    AND om.user_id IS NOT NULL
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- Assigned driver (driver app JWT).
  IF v_trip.driver_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    SELECT p_conversation_id, d.user_id, 'driver'
    FROM public.drivers d
    WHERE d.id = v_trip.driver_id
      AND d.user_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  -- Linked customer org members.
  IF v_trip.client_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    SELECT p_conversation_id, om.user_id, 'client'
    FROM public.clients c
    JOIN public.organization_members om
      ON om.organization_id = c.linked_organization_id
    WHERE c.id = v_trip.client_id
      AND c.linked_organization_id IS NOT NULL
      AND om.status = 'active'
      AND om.user_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  -- Linked supplier org members.
  IF v_trip.supplier_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    SELECT p_conversation_id, om.user_id, 'supplier'
    FROM public.suppliers s
    JOIN public.organization_members om
      ON om.organization_id = s.linked_organization_id
    WHERE s.id = v_trip.supplier_id
      AND s.linked_organization_id IS NOT NULL
      AND om.status = 'active'
      AND om.user_id IS NOT NULL
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  -- Trip owner / assigner when present on the row.
  IF v_trip.owner_user_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    VALUES (p_conversation_id, v_trip.owner_user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  IF v_trip.assigned_by_user_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    VALUES (p_conversation_id, v_trip.assigned_by_user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
END;
$$;

-- ── 4. Ensure unified trip room (idempotent) ─────────────────────────────────

-- Core: callable from triggers (no auth.uid() required).
CREATE OR REPLACE FUNCTION public.fn_ensure_trip_chat_room_core(
  p_trip_id    uuid,
  p_created_by uuid DEFAULT NULL
)
RETURNS public.chat_conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_row  public.chat_conversations%ROWTYPE;
  v_key  text;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found: %', p_trip_id;
  END IF;

  SELECT * INTO v_row
  FROM public.chat_conversations
  WHERE trip_id = p_trip_id AND conversation_type = 'trip';
  IF FOUND THEN
    PERFORM public.fn_sync_trip_room_participants(v_row.id, p_trip_id);
    RETURN v_row;
  END IF;

  v_key := 'trip:' || p_trip_id::text;

  INSERT INTO public.chat_conversations (
    organization_id, conversation_type, title, trip_id,
    client_id, supplier_id, driver_id, channel_key,
    metadata, created_by
  )
  VALUES (
    v_trip.organization_id,
    'trip',
    coalesce(
      'Trip ' || nullif(trim(v_trip.trip_number), ''),
      'Trip Chat'
    ),
    p_trip_id,
    v_trip.client_id,
    v_trip.supplier_id,
    v_trip.driver_id,
    v_key,
    jsonb_build_object(
      'trip_number', v_trip.trip_number,
      'trip_status', v_trip.status
    ),
    p_created_by
  )
  ON CONFLICT (trip_id) WHERE conversation_type = 'trip' AND trip_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.chat_conversations
    WHERE trip_id = p_trip_id AND conversation_type = 'trip';
  END IF;

  PERFORM public.fn_sync_trip_room_participants(v_row.id, p_trip_id);
  RETURN v_row;
END;
$$;

-- RPC entry: authenticated callers only.
CREATE OR REPLACE FUNCTION public.fn_ensure_trip_chat_room(p_trip_id uuid)
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

REVOKE ALL ON FUNCTION public.fn_ensure_trip_chat_room_core(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ensure_trip_chat_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ensure_trip_chat_room(uuid) TO authenticated;

-- Thin RPC aliases for the client.
CREATE OR REPLACE FUNCTION public.ensure_trip_chat_room(p_trip_id uuid)
RETURNS public.chat_conversations
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_ensure_trip_chat_room(p_trip_id);
$$;

CREATE OR REPLACE FUNCTION public.get_trip_chat_room(p_trip_id uuid)
RETURNS public.chat_conversations
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cc.*
  FROM public.chat_conversations cc
  WHERE cc.trip_id = p_trip_id
    AND cc.conversation_type = 'trip'
    AND public.fn_can_access_trip_for_chat(p_trip_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.ensure_trip_chat_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trip_chat_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_trip_chat_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_chat_room(uuid) TO authenticated;

-- ── 5. Post action cards into the unified room ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_post_trip_room_action_card(
  p_trip_id       uuid,
  p_event_type    text,
  p_title         text,
  p_body          text    DEFAULT '',
  p_metadata      jsonb   DEFAULT '{}'::jsonb,
  p_legacy_msg_id uuid    DEFAULT NULL
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
  IF NOT FOUND THEN
    -- Room not created yet — skip silently (lanes still carry the event).
    RETURN;
  END IF;

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
    now()
  );
END;
$$;

-- ── 6. Mirror operational legacy messages → unified trip room ────────────────

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
  IF NEW.message_type NOT IN (
    'status_change', 'system', 'system_log', 'update',
    'ledger_event', 'ledger', 'payment', 'ledger_update',
    'document_upload', 'document_share',
    'location_log', 'tracking', 'feedback_request', 'assignment_update'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT tc.trip_id INTO v_trip_id
  FROM public.trip_conversations tc
  WHERE tc.id = NEW.conversation_id;
  IF v_trip_id IS NULL THEN RETURN NEW; END IF;

  -- Ensure room exists for trips that already had lanes (trigger context — no JWT).
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

  -- Smart action hints for the client renderer.
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

DROP TRIGGER IF EXISTS trg_mirror_operational_to_trip_room ON public.trip_messages;
CREATE TRIGGER trg_mirror_operational_to_trip_room
  AFTER INSERT ON public.trip_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_mirror_operational_to_trip_room();

-- ── 7. Ensure room when legacy lanes are created ─────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ensure_trip_party_conversations(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_client_name  text;
  v_supplier_name text;
  v_driver_name  text;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_trip.client_id IS NOT NULL THEN
    v_client_name := coalesce(
      (SELECT nullif(trim(coalesce(c.name, '')), '')
       FROM public.clients c WHERE c.id = v_trip.client_id LIMIT 1),
      nullif(trim(v_trip.client_name), ''),
      'Client'
    );
    INSERT INTO public.trip_conversations (
      organization_id, trip_id, party_type, party_name,
      client_id, supplier_id, driver_id
    )
    VALUES (
      v_trip.organization_id, p_trip_id, 'client', v_client_name,
      v_trip.client_id, NULL, NULL
    )
    ON CONFLICT (trip_id, party_type) DO UPDATE SET
      organization_id = excluded.organization_id,
      party_name      = coalesce(excluded.party_name, trip_conversations.party_name),
      client_id       = excluded.client_id,
      updated_at      = now();
  END IF;

  IF v_trip.supplier_id IS NOT NULL THEN
    v_supplier_name := coalesce(
      (SELECT nullif(trim(coalesce(nullif(s.company_name, ''), nullif(s.name, ''), '')), '')
       FROM public.suppliers s WHERE s.id = v_trip.supplier_id LIMIT 1),
      'Supplier'
    );
    INSERT INTO public.trip_conversations (
      organization_id, trip_id, party_type, party_name,
      client_id, supplier_id, driver_id
    )
    VALUES (
      v_trip.organization_id, p_trip_id, 'supplier', v_supplier_name,
      NULL, v_trip.supplier_id, NULL
    )
    ON CONFLICT (trip_id, party_type) DO UPDATE SET
      organization_id = excluded.organization_id,
      party_name      = coalesce(excluded.party_name, trip_conversations.party_name),
      supplier_id     = excluded.supplier_id,
      updated_at      = now();
  END IF;

  IF v_trip.driver_id IS NOT NULL THEN
    v_driver_name := coalesce(
      (SELECT nullif(trim(d.name), '') FROM public.drivers d WHERE d.id = v_trip.driver_id LIMIT 1),
      'Driver'
    );
    INSERT INTO public.trip_conversations (
      organization_id, trip_id, party_type, party_name,
      client_id, supplier_id, driver_id
    )
    VALUES (
      v_trip.organization_id, p_trip_id, 'driver', v_driver_name,
      NULL, NULL, v_trip.driver_id
    )
    ON CONFLICT (trip_id, party_type) DO UPDATE SET
      organization_id = excluded.organization_id,
      party_name      = coalesce(excluded.party_name, trip_conversations.party_name),
      driver_id       = excluded.driver_id,
      updated_at      = now();
  END IF;

  -- Phase 2: unified room alongside legacy lanes (no-op when already exists).
  BEGIN
    PERFORM public.fn_ensure_trip_chat_room_core(p_trip_id);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'fn_ensure_trip_chat_room_core trip %:%', p_trip_id, SQLERRM;
  END;
END;
$$;

-- Re-sync participants when driver / client / supplier assignment changes.
CREATE OR REPLACE FUNCTION public.fn_sync_trip_room_on_trip_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  IF NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
     AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_room_id
  FROM public.chat_conversations
  WHERE trip_id = NEW.id AND conversation_type = 'trip';

  IF v_room_id IS NOT NULL THEN
    UPDATE public.chat_conversations
    SET
      client_id   = NEW.client_id,
      supplier_id = NEW.supplier_id,
      driver_id   = NEW.driver_id,
      organization_id = NEW.organization_id,
      metadata = metadata || jsonb_build_object('trip_status', NEW.status),
      updated_at = now()
    WHERE id = v_room_id;

    PERFORM public.fn_sync_trip_room_participants(v_room_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trip_room_on_trip_update ON public.trips;
CREATE TRIGGER trg_sync_trip_room_on_trip_update
  AFTER UPDATE OF driver_id, client_id, supplier_id, organization_id ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_trip_room_on_trip_update();

-- ── 8. Backfill unified rooms for trips that already have lanes ──────────────

INSERT INTO public.chat_conversations (
  organization_id, conversation_type, title, trip_id,
  client_id, supplier_id, driver_id, channel_key, metadata, created_at
)
SELECT
  t.organization_id,
  'trip',
  coalesce('Trip ' || nullif(trim(t.trip_number), ''), 'Trip Chat'),
  t.id,
  t.client_id,
  t.supplier_id,
  t.driver_id,
  'trip:' || t.id::text,
  jsonb_build_object('trip_number', t.trip_number, 'trip_status', t.status),
  t.created_at
FROM public.trips t
WHERE EXISTS (
  SELECT 1 FROM public.trip_conversations tc WHERE tc.trip_id = t.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.chat_conversations cc
  WHERE cc.trip_id = t.id AND cc.conversation_type = 'trip'
)
ON CONFLICT (trip_id) WHERE conversation_type = 'trip' AND trip_id IS NOT NULL
DO NOTHING;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT cc.id AS conv_id, cc.trip_id
    FROM public.chat_conversations cc
    WHERE cc.conversation_type = 'trip' AND cc.trip_id IS NOT NULL
  LOOP
    PERFORM public.fn_sync_trip_room_participants(r.conv_id, r.trip_id);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.ensure_trip_chat_room(uuid) IS
  'Creates or returns the unified trip chat room (one per trip) and syncs participants.';
COMMENT ON FUNCTION public.get_trip_chat_room(uuid) IS
  'Read-only lookup of the unified trip room; null when not created yet.';
COMMENT ON FUNCTION public.fn_post_trip_room_action_card(uuid, text, text, text, jsonb, uuid) IS
  'Posts a system action_card into the unified trip room (deduped by legacy_trip_message_id).';
