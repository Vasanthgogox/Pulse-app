-- Integrated indent trips: mirror operational rows (status_change, location_log)
-- from one party lane to all other lanes on the same trip when trips.indent_id is set.
-- Skips rows already fan-out by process_b2b_event (metadata b2b_operational_broadcast)
-- and skips sync clones (metadata operational_sync_source_message_id).
-- Also: stamp indent_status on unified bootstrap conversation rows for in-app gating.

-- ── 1. process_b2b_event: mark broadcast inserts so the sync trigger does not duplicate ──
CREATE OR REPLACE FUNCTION public.process_b2b_event(
  p_organization_id  UUID,
  p_trip_id          UUID,
  p_event_type       TEXT,
  p_payload          JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip        RECORD;
  v_prev_status TEXT;
  v_new_status  TEXT;
  v_content     TEXT;
  v_user_id     UUID;
  v_user_name   TEXT;
  v_conv_id     UUID;
  v_new_id      UUID;
  v_message_ids UUID[]    := '{}';
  v_trip_state  JSONB;
  v_msg_meta    JSONB;
  v_sender_role TEXT;
  v_now         TIMESTAMPTZ;
  v_canonical   TEXT;
BEGIN
  SET LOCAL statement_timeout = '8s';
  v_now       := clock_timestamp();
  v_canonical := CASE p_event_type
    WHEN 'system_log'  THEN 'system'
    WHEN 'payment'     THEN 'ledger'
    WHEN 'feedback'    THEN 'feedback_request'
    ELSE p_event_type
  END;

  SELECT t.* INTO v_trip
  FROM   public.trips t
  WHERE  t.id = p_trip_id
    AND (
      t.organization_id = p_organization_id
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE  s.id                    = t.supplier_id
          AND  s.linked_organization_id = p_organization_id
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_b2b_event: trip % not accessible for org %',
      p_trip_id, p_organization_id
    USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_prev_status := v_trip.status;
  v_new_status  := COALESCE(p_payload->>'new_status', v_prev_status);
  v_content     := COALESCE(NULLIF(trim(p_payload->>'content'), ''), 'System update');
  v_user_id     := NULLIF(p_payload->>'user_id', '')::UUID;
  v_user_name   := COALESCE(NULLIF(p_payload->>'user_name', ''), 'System');
  v_conv_id     := NULLIF(p_payload->>'conversation_id', '')::UUID;

  UPDATE public.trips
  SET
    status     = v_new_status,
    driver_id  = CASE WHEN p_payload ? 'driver_id'
                      THEN NULLIF(p_payload->>'driver_id', '')::UUID
                      ELSE driver_id  END,
    vehicle_id = CASE WHEN p_payload ? 'vehicle_id'
                      THEN NULLIF(p_payload->>'vehicle_id', '')::UUID
                      ELSE vehicle_id END,
    updated_at = v_now
  WHERE id = p_trip_id;

  SELECT t.* INTO v_trip FROM public.trips t WHERE t.id = p_trip_id;

  v_trip_state := jsonb_build_object(
    'id',                     v_trip.id,
    'trip_number',            v_trip.trip_number,
    'display_trip_id',        v_trip.display_trip_id,
    'status',                 v_trip.status,
    'driver_id',              v_trip.driver_id,
    'vehicle_id',             v_trip.vehicle_id,
    'supplier_id',            v_trip.supplier_id,
    'client_id',              v_trip.client_id,
    'driver_display_name',    v_trip.driver_display_name,
    'vehicle_display_number', v_trip.vehicle_display_number,
    'pickup_area',            v_trip.pickup_area,
    'drop_location',          v_trip.drop_location,
    'pickup_date',            v_trip.pickup_date,
    'payment_status',         v_trip.payment_status,
    'updated_at',             to_char(v_now AT TIME ZONE 'UTC',
                                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  v_sender_role := CASE v_canonical
    WHEN 'tracking'     THEN 'driver'
    WHEN 'ledger'        THEN 'dispatcher'
    WHEN 'ledger_event'  THEN 'dispatcher'
    ELSE                   'system'
  END;

  v_msg_meta := jsonb_build_object(
    'event_type',      p_event_type,
    'previous_status', v_prev_status,
    'new_status',      v_new_status,
    'changed_by',      v_user_id,
    'changed_by_name', v_user_name,
    'changed_at',      to_char(v_now AT TIME ZONE 'UTC',
                               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'trip_state',      v_trip_state
  ) || COALESCE(p_payload->'extra_meta', '{}');

  IF v_conv_id IS NOT NULL THEN
    INSERT INTO public.trip_messages (
      conversation_id, organization_id,
      sender_user_id, sender_role, sender_name,
      content, message_type, metadata, is_read, is_delivered
    ) VALUES (
      v_conv_id, p_organization_id,
      v_user_id, v_sender_role, v_user_name,
      v_content, v_canonical, v_msg_meta, TRUE, TRUE
    ) RETURNING id INTO v_new_id;
    v_message_ids := array_append(v_message_ids, v_new_id);

  ELSIF v_canonical IN ('ledger', 'ledger_event') THEN
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical, v_msg_meta, TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id    = p_trip_id
        AND  tc.party_type IN ('client', 'supplier')
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;

  ELSIF v_canonical = 'tracking' THEN
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical, v_msg_meta, TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id    = p_trip_id
        AND  tc.party_type = 'driver'
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;

  ELSE
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical,
             v_msg_meta || jsonb_build_object('b2b_operational_broadcast', 'true'),
             TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id = p_trip_id
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',          TRUE,
    'message_ids', v_message_ids,
    'trip_state',  v_trip_state,
    'prev_status', v_prev_status,
    'new_status',  v_new_status,
    'event_type',  v_canonical
  );
END;
$$;


-- ── 2. After insert: copy operational messages across lanes for integrated indents ───
CREATE OR REPLACE FUNCTION public.trip_messages_sync_operational_to_lanes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id   uuid;
  v_indent_id uuid;
  v_meta      jsonb;
  v_pri       integer;
  v_other     record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.metadata IS NOT NULL AND (NEW.metadata ? 'operational_sync_source_message_id') THEN
    RETURN NEW;
  END IF;

  IF NEW.metadata IS NOT NULL
     AND coalesce(NEW.metadata->>'b2b_operational_broadcast', '') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.message_type IS DISTINCT FROM 'status_change'
     AND NEW.message_type IS DISTINCT FROM 'location_log' THEN
    RETURN NEW;
  END IF;

  SELECT tc.trip_id, t.indent_id
  INTO   v_trip_id, v_indent_id
  FROM   public.trip_conversations tc
  JOIN   public.trips t ON t.id = tc.trip_id
  WHERE  tc.id = NEW.conversation_id;

  IF v_indent_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_meta := coalesce(NEW.metadata, '{}'::jsonb)
    || jsonb_build_object('operational_sync_source_message_id', NEW.id);
  v_pri := coalesce(NEW.priority_weight, 40);

  FOR v_other IN
    SELECT tc.id AS conv_id, tc.organization_id
    FROM   public.trip_conversations tc
    WHERE  tc.trip_id = v_trip_id
      AND  tc.id <> NEW.conversation_id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM   public.trip_messages tm
      WHERE  tm.conversation_id = v_other.conv_id
        AND  tm.metadata->>'operational_sync_source_message_id' = NEW.id::text
    ) THEN
      CONTINUE;
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
      read_at,
      metadata,
      priority_weight,
      is_delivered
    ) VALUES (
      v_other.conv_id,
      v_other.organization_id,
      NEW.sender_user_id,
      NEW.sender_role,
      NEW.sender_name,
      NEW.content,
      NEW.message_type,
      coalesce(NEW.is_read, false),
      NEW.read_at,
      v_meta,
      v_pri,
      coalesce(NEW.is_delivered, false)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_operational_status ON public.trip_messages;
CREATE TRIGGER trg_sync_operational_status
  AFTER INSERT ON public.trip_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trip_messages_sync_operational_to_lanes();

COMMENT ON FUNCTION public.trip_messages_sync_operational_to_lanes() IS
  'Integrated indents: copy status_change + location_log into sibling trip_conversations on the same trip_id '
  '(client/supplier/driver lanes share operational truth). Skips process_b2b_event broadcast rows and re-clones.';


-- ── 3. get_unified_b2b_bootstrap: add indent_status for client-side indent completion gating ──
CREATE OR REPLACE FUNCTION public.get_unified_b2b_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base       JSONB;
  v_augmented  JSONB;
  v_result     JSONB;
  v_by_context JSONB;
BEGIN
  v_base := public.get_b2b_chat_bootstrap(p_organization_id, p_message_limit);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        e.elem,
        '{indent_status}',
        coalesce(to_jsonb(NULLIF(trim(ix.status::text), '')), 'null'::jsonb)
      )
      ORDER BY e.ord
    ),
    '[]'::jsonb
  )
  INTO v_augmented
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_base) = 'array' THEN v_base ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(elem, ord)
  CROSS JOIN LATERAL (
    SELECT i.status
    FROM   public.trips t
    LEFT JOIN public.indents i ON i.id = t.indent_id
    WHERE  t.id = NULLIF(TRIM(e.elem->>'trip_id'), '')::uuid
  ) ix;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        jsonb_set(
          conv_row,
          '{conversation_type}',
          CASE
            WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL THEN to_jsonb('integrated_group'::text)
            ELSE to_jsonb('private_trip'::text)
          END
        ),
        '{messages}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN (msg->>'message_type') IN ('status_change', 'system', 'system_log', 'update', 'location_log') THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(msg, '{visibility_tags}', tx.tags_all_parties),
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
                WHEN (msg->>'message_type') IN ('ledger_event', 'ledger', 'payment', 'ledger_update') THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          msg,
                          '{visibility_tags}',
                          tx.tags_client_supplier
                        ),
                        '{metadata}',
                        coalesce(msg->'metadata', '{}'::jsonb)
                          || jsonb_build_object('visible_to', jsonb_build_array('client', 'supplier'))
                      ),
                      '{routing_context_kind}',
                      CASE
                        WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL
                          THEN to_jsonb('indent'::text)
                        ELSE to_jsonb('trip'::text)
                      END
                    ),
                    '{routing_context_id}',
                    CASE
                      WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL
                        THEN to_jsonb(trim(conv_row->>'indent_id'))
                      ELSE to_jsonb(trim(conv_row->>'trip_id'))
                    END
                  )
                WHEN (msg->>'message_type') = 'tracking' THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(msg, '{visibility_tags}', tx.tags_driver_lanes),
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
                ELSE
                  jsonb_set(
                    jsonb_set(
                      msg,
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
              END
              ORDER BY (msg->>'created_at')
            )
            FROM jsonb_array_elements(conv_row->'messages') AS msg
          ),
          '[]'::jsonb
        )
      )
      ORDER BY (conv_row->>'last_message_at') DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM jsonb_array_elements(v_augmented) AS conv_row
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
        ),
        '[]'::jsonb
      ) AS tags_all_parties,
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
            AND tc2.party_type IN ('client', 'supplier')
        ),
        '[]'::jsonb
      ) AS tags_client_supplier,
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
            AND tc2.party_type = 'driver'
        ),
        '[]'::jsonb
      ) AS tags_driver_lanes
  ) AS tx;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'context_kind', g.context_kind,
        'context_id',   g.context_id,
        'message_ids',  g.ids
      )
      ORDER BY g.context_kind, g.context_id
    ),
    '[]'::jsonb
  )
  INTO v_by_context
  FROM (
    SELECT
      trim(both '"' from (m->>'routing_context_kind')) AS context_kind,
      trim(both '"' from (m->>'routing_context_id'))   AS context_id,
      jsonb_agg(DISTINCT to_jsonb(m->>'id') ORDER BY to_jsonb(m->>'id')) AS ids
    FROM jsonb_array_elements(COALESCE(v_result, '[]'::jsonb)) AS c
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c->'messages', '[]'::jsonb)) AS m
    WHERE coalesce(trim(m->>'routing_context_id'), '') <> ''
      AND coalesce(trim(m->>'routing_context_kind'), '') <> ''
      AND coalesce(trim(m->>'id'), '') <> ''
    GROUP BY 1, 2
  ) AS g;

  RETURN jsonb_build_object(
    'conversations',       COALESCE(v_result, '[]'::jsonb),
    'messages_by_context', COALESCE(v_by_context, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) IS
  'Unified bootstrap: conversations + messages_by_context; each conv includes indent_status from indents.status '
  'when trip.indent_id is set (for integrated debrief gating).';

REVOKE ALL ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT) TO authenticated;
