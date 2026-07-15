-- Multi-lane chat bootstrap, context routing columns, location_log pings, lighter trips writes.

-- ── 1. message_type: location_log (driver checkpoints → trip_messages only) ──
ALTER TABLE public.trip_messages DROP CONSTRAINT IF EXISTS trip_messages_message_type_check;

ALTER TABLE public.trip_messages ADD CONSTRAINT trip_messages_message_type_check
  CHECK (
    message_type = ANY (
      ARRAY[
        'text', 'chat', 'update', 'question', 'challenge',
        'system', 'system_log',
        'ledger_event', 'ledger', 'payment', 'ledger_update',
        'assignment_update', 'document_upload',
        'document_share', 'feedback_request', 'feedback',
        'image', 'status_change', 'tracking',
        'location_log'
      ]
    )
  );

-- ── 2. Denormalized routing (for idx_messages_context_routing + lane SQL) ───
ALTER TABLE public.trip_messages
  ADD COLUMN IF NOT EXISTS context_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS context_indent_id uuid REFERENCES public.indents(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.trip_messages_set_context_routing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id   uuid;
  v_indent_id uuid;
BEGIN
  SELECT tc.trip_id, t.indent_id
  INTO   v_trip_id, v_indent_id
  FROM   public.trip_conversations tc
  JOIN   public.trips t ON t.id = tc.trip_id
  WHERE  tc.id = NEW.conversation_id;

  NEW.context_trip_id   := v_trip_id;
  NEW.context_indent_id := v_indent_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_messages_context_routing ON public.trip_messages;
CREATE TRIGGER trg_trip_messages_context_routing
  BEFORE INSERT OR UPDATE ON public.trip_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trip_messages_set_context_routing();

UPDATE public.trip_messages tm
SET context_trip_id = sub.trip_id,
    context_indent_id = sub.indent_id
FROM (
  SELECT tm2.id AS msg_id, tc.trip_id, t.indent_id
  FROM public.trip_messages tm2
  JOIN public.trip_conversations tc ON tc.id = tm2.conversation_id
  JOIN public.trips t ON t.id = tc.trip_id
) sub
WHERE tm.id = sub.msg_id
  AND (tm.context_trip_id IS DISTINCT FROM sub.trip_id
    OR tm.context_indent_id IS DISTINCT FROM sub.indent_id);

CREATE INDEX IF NOT EXISTS idx_messages_context_routing
  ON public.trip_messages (context_indent_id, context_trip_id)
  INCLUDE (message_type, created_at);

COMMENT ON INDEX public.idx_messages_context_routing IS
  'Multi-lane bootstrap: filter commercial (indent) vs operational (trip) contexts.';

-- ── 3. Bootstrap rows: expose trips.indent_id on each conversation object ────
CREATE OR REPLACE FUNCTION public.get_initial_chat_state(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      jsonb_agg(c ORDER BY (c->>'last_message_at') DESC NULLS LAST),
      '[]'::jsonb
    )
    FROM (
      SELECT jsonb_build_object(
        'id',                      tc.id,
        'organization_id',         tc.organization_id,
        'trip_organization_id',      t.organization_id,
        'trip_id',                 tc.trip_id,
        'indent_id',               t.indent_id,
        'party_type',              tc.party_type,
        'party_name',              tc.party_name,
        'client_id',               tc.client_id,
        'supplier_id',             tc.supplier_id,
        'driver_id',               tc.driver_id,
        'last_message_at',         tc.last_message_at,
        'last_message_preview',    tc.last_message_preview,
        'unread_dispatcher_count', COALESCE(tc.unread_dispatcher_count, 0),
        'created_at',              tc.created_at,
        'updated_at',              tc.updated_at,
        'trip_number',             t.trip_number,
        'display_trip_id',         t.display_trip_id,
        'trip_status',             t.status,
        'trip_driver_id',          t.driver_id,
        'trip_supplier_id',        t.supplier_id,
        'trip_created_at',         t.created_at,
        'pickup_area',             t.pickup_area,
        'drop_location',           t.drop_location,
        'trip_feedback_status', (
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  m.message_type IN ('feedback_request', 'feedback')
                AND  (m.metadata->>'submitted_at') IS NOT NULL
            )
            THEN 'rated'
            WHEN EXISTS (
              SELECT 1
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  m.message_type IN ('feedback_request', 'feedback')
                AND  (m.metadata->>'submitted_at') IS NULL
                AND  COALESCE(m.metadata->>'rating_status', '') <> 'rated'
            )
            THEN 'pending'
            ELSE 'none'
          END
        ),
        'messages', COALESCE((
          SELECT jsonb_agg(msg_row ORDER BY msg_row->>'created_at' ASC)
          FROM (
            SELECT jsonb_build_object(
              'id',                 tm.id,
              'conversation_id',    tm.conversation_id,
              'organization_id',    tm.organization_id,
              'sender_user_id',     tm.sender_user_id,
              'sender_role',        tm.sender_role,
              'sender_name',        tm.sender_name,
              'content',            tm.content,
              'message_type',       tm.message_type,
              'metadata',           tm.metadata,
              'is_read',            tm.is_read,
              'read_at',            tm.read_at,
              'created_at',         tm.created_at,
              'sender_avatar_seed', tm.sender_avatar_seed,
              'is_delivered',       COALESCE(tm.is_delivered, FALSE),
              'delivered_at',       tm.delivered_at
            ) AS msg_row
            FROM (
              SELECT *
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  (
                  m.message_type NOT IN ('ledger_event', 'ledger', 'payment', 'ledger_update')
                  OR COALESCE(
                    nullif(trim(m.metadata->>'sender_org_id'), ''),
                    nullif(trim(m.metadata->'event_payload'->>'sender_org_id'), '')
                  ) = p_organization_id::text
                  OR COALESCE(
                    nullif(trim(m.metadata->>'receiver_org_id'), ''),
                    nullif(trim(m.metadata->'event_payload'->>'receiver_org_id'), '')
                  ) = p_organization_id::text
                )
              ORDER  BY m.created_at DESC
              LIMIT  p_message_limit
            ) tm
          ) sub
        ), '[]'::jsonb)
      ) AS c
      FROM  public.trip_conversations tc
      JOIN  public.trips              t ON t.id = tc.trip_id
      WHERE (
        tc.organization_id = p_organization_id
        OR tc.trip_id IN (
          SELECT tr.id
          FROM   public.trips tr
          WHERE  tr.status NOT IN ('cancelled')
            AND  EXISTS (
              SELECT 1 FROM public.suppliers s
              WHERE  s.id = tr.supplier_id
                AND  s.linked_organization_id = p_organization_id
            )
          LIMIT 500
        )
      )
        AND t.status <> 'cancelled'
    ) rows
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.get_initial_chat_state(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_initial_chat_state(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_initial_chat_state(UUID, INT) IS
  'Bootstrap: adds indent_id for multi-lane commercial routing; ledger privacy filter unchanged.';

-- ── 4. Lane aggregation (commercial = ledger∧indent; operational = non-ledger + location_log) ──
CREATE OR REPLACE FUNCTION public.fn_build_chat_lanes(p_unified jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
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

COMMENT ON FUNCTION public.fn_build_chat_lanes(jsonb) IS
  'Privacy: ledger-like rows only under commercial_by_indent; trip lanes exclude ledger; location_log stays operational.';

CREATE OR REPLACE FUNCTION public.get_multi_lane_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unified jsonb;
BEGIN
  v_unified := public.get_unified_b2b_bootstrap(p_organization_id, p_message_limit);
  RETURN jsonb_build_object(
    'conversations', coalesce(v_unified, '[]'::jsonb),
    'lanes', public.fn_build_chat_lanes(v_unified)
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT) TO authenticated;

REVOKE ALL    ON FUNCTION public.fn_build_chat_lanes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_build_chat_lanes(jsonb) TO authenticated;

COMMENT ON FUNCTION public.get_multi_lane_bootstrap(UUID, INT) IS
  'Multi-lane Bootstrap & Patch: unified conversations + commercial/operational lane maps (message ids).';

-- ── 5. Driver location → location_log in driver thread; fewer trips row locks ──
CREATE OR REPLACE FUNCTION public.fn_insert_driver_location_log_chat(
  p_trip_id       uuid,
  p_body          text,
  p_metadata      jsonb,
  p_priority_weight integer DEFAULT 40
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
BEGIN
  FOR v_conv IN
    SELECT id, organization_id
    FROM   public.trip_conversations
    WHERE  trip_id = p_trip_id
      AND  party_type = 'driver'
  LOOP
    INSERT INTO public.trip_messages (
      conversation_id,
      organization_id,
      sender_user_id,
      sender_role,
      sender_name,
      content,
      message_type,
      is_read,
      metadata,
      priority_weight
    ) VALUES (
      v_conv.id,
      v_conv.organization_id,
      NULL,
      'driver',
      'Driver',
      p_body,
      'location_log',
      FALSE,
      p_metadata,
      COALESCE(p_priority_weight, 40)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_insert_driver_location_log_chat(uuid, text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_insert_driver_location_log_chat(uuid, text, jsonb, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_driver_locations_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_span           double precision;
  v_health         text;
  v_rem_km         double precision;
  v_eta_days       double precision;
  v_eta_date       date;
  v_eta_label      text;
  v_late_body      text;
  v_loc_meta       jsonb;
  v_late_meta      jsonb;
BEGIN
  IF NEW.trip_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Odometer span only (rarer than GPS pings) — avoids locking trips on every coordinate write.
  SELECT max(dl.odometer_km) - min(dl.odometer_km)
  INTO   v_span
  FROM   public.driver_locations dl
  WHERE  dl.trip_id = NEW.trip_id
    AND  dl.odometer_km IS NOT NULL;

  IF v_span IS NOT NULL AND v_span >= 0 THEN
    UPDATE public.trips t
    SET actual_distance_traveled_km = greatest(coalesce(t.actual_distance_traveled_km, 0), v_span::numeric)
    WHERE t.id = NEW.trip_id;
  END IF;

  IF NEW.source IN ('live', 'background') THEN
    PERFORM public.fn_ensure_trip_party_conversations(NEW.trip_id);

    v_loc_meta := jsonb_build_object(
      'event_payload', jsonb_build_object(
        'location_data', jsonb_build_object(
          'lat', NEW.latitude,
          'lng', NEW.longitude,
          'odometer_km', NEW.odometer_km,
          'recorded_at', to_char(timezone('UTC', coalesce(NEW.recorded_at, now())), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      )
    );

    PERFORM public.fn_insert_driver_location_log_chat(
      NEW.trip_id,
      format(
        'Location ping · %s',
        to_char(timezone('UTC', coalesce(NEW.recorded_at, now())), 'YYYY-MM-DD HH24:MI "UTC"')
      ),
      v_loc_meta,
      40
    );
  END IF;

  SELECT h.health_status
  INTO   v_health
  FROM   public.v_long_haul_health h
  WHERE  h.trip_id = NEW.trip_id;

  IF v_health IN ('LATE_RISK', 'CRITICAL_DELAY') THEN
    IF EXISTS (
      SELECT 1
      FROM   public.trip_messages tm
      JOIN   public.trip_conversations tc ON tc.id = tm.conversation_id
      WHERE  tc.trip_id = NEW.trip_id
        AND  tm.message_type IN ('system_log', 'location_log')
        AND  coalesce(tm.metadata #>> '{event_payload,event_tag}', '') = 'LATE'
        AND  tm.created_at > (now() - interval '4 hours')
      LIMIT  1
    ) THEN
      RETURN NEW;
    END IF;

    SELECT
      greatest(coalesce(t.distance::double precision, 0::double precision) - coalesce(h.current_km, 0::double precision), 0::double precision)
    INTO   v_rem_km
    FROM   public.trips t
    JOIN   public.v_long_haul_health h ON h.trip_id = t.id
    WHERE  t.id = NEW.trip_id;

    v_eta_days := case when v_rem_km > 0 then v_rem_km / 350.0 else 0::double precision end;
    v_eta_date := (now() + make_interval(days => greatest(round(v_eta_days)::int, 0)))::date;
    v_eta_label := to_char(v_eta_date, 'YYYY-MM-DD');

    v_late_body := format('⚠️ Vehicle behind schedule. New ETA: %s', v_eta_label);

    v_late_meta := jsonb_build_object(
      'priority_weight', 135,
      'long_haul_late', true,
      'event_payload', jsonb_build_object(
        'event_tag', 'LATE',
        'health_status', v_health,
        'new_eta', v_eta_label,
        'location_data', jsonb_build_object(
          'lat', NEW.latitude,
          'lng', NEW.longitude,
          'odometer_km', NEW.odometer_km,
          'recorded_at', to_char(timezone('UTC', coalesce(NEW.recorded_at, now())), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      )
    );

    PERFORM public.fn_post_system_log_to_trip_chats(NEW.trip_id, v_late_body, v_late_meta, 135);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_driver_locations_after_insert() IS
  'Odometer span may update trips.actual_distance_traveled_km; GPS pings → location_log on driver lane only; LATE uses system_log.';
