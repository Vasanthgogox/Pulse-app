-- Location ping chat: human-readable city labels (no map tiles), WhatsApp rate-limit unchanged.
-- Status broadcasts from business simulation carry simulated flag in metadata.

-- 1. Optional reverse-geocode label on driver_locations (client-supplied city/area).
ALTER TABLE public.driver_locations
  ADD COLUMN IF NOT EXISTS address_label text;

COMMENT ON COLUMN public.driver_locations.address_label IS
  'Human-readable city/area from client reverse-geocode; used in rate-limited chat pings.';

-- 2. One-shot origin marker for business simulation status advances.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS status_change_origin text;

COMMENT ON COLUMN public.trips.status_change_origin IS
  'Ephemeral marker (e.g. business_simulated) read by status→chat trigger; not shown in UI.';

-- 3. Allow simulated source on driver_locations (business / test pings).
ALTER TABLE public.driver_locations
  DROP CONSTRAINT IF EXISTS driver_locations_source_check;

ALTER TABLE public.driver_locations
  ADD CONSTRAINT driver_locations_source_check
  CHECK (source IN ('live', 'tap', 'background', 'simulated'));

-- 4. Best-effort city hint from trip context when address_label is missing.
CREATE OR REPLACE FUNCTION public.fn_trip_location_city_hint(p_trip_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_pickup text;
  v_drop   text;
BEGIN
  SELECT lower(trim(coalesce(t.status, ''))),
         nullif(trim(t.pickup_area), ''),
         nullif(trim(t.drop_location), '')
  INTO   v_status, v_pickup, v_drop
  FROM   public.trips t
  WHERE  t.id = p_trip_id;

  IF NOT FOUND THEN
    RETURN 'En route';
  END IF;

  IF v_status IN ('at_drop', 'completed', 'delivered', 'done') THEN
    RETURN coalesce(v_drop, v_pickup, 'En route');
  END IF;

  IF v_status IN ('picked_up', 'in_transit', 'in_progress') THEN
    RETURN coalesce(v_pickup, v_drop, 'En route');
  END IF;

  RETURN coalesce(v_pickup, v_drop, 'En route');
END;
$$;

COMMENT ON FUNCTION public.fn_trip_location_city_hint(uuid) IS
  'Coarse city/area label from trip pickup/drop for location ping chat copy.';

-- 5. Trip status broadcast: optional simulated flag in event_payload.
CREATE OR REPLACE FUNCTION public.fn_post_system_message_to_trip_chats(
  p_trip_id       uuid,
  p_content       text,
  p_dedupe_status text DEFAULT NULL,
  p_simulated     boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv          record;
  v_meta          jsonb;
  v_source_trip   record;
  v_partner_org   uuid;
  v_partner_trip  record;
  v_partner_conv  uuid;
BEGIN
  v_meta := jsonb_build_object(
    'trip_status_broadcast', '1',
    'status', coalesce(p_dedupe_status, ''),
    'event_payload', jsonb_build_object(
      'new_status', nullif(trim(coalesce(p_dedupe_status, '')), ''),
      'trip_id', p_trip_id,
      'simulated', case when p_simulated then true else null end
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
        AND  tm.message_type IN ('system', 'system_log', 'update')
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (
          (tm.metadata->>'status') = trim(p_dedupe_status)
          OR (tm.metadata->'event_payload'->>'new_status') = trim(p_dedupe_status)
        )
      LIMIT  1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,     sender_user_id,
      sender_role,      sender_name,         content,
      message_type,     is_read,             metadata
    ) VALUES (
      v_conv.id,        v_conv.organization_id, null,
      'system',         'Trip System',          p_content,
      'system',         false,                  v_meta
    );

    v_partner_org := null;

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
    LIMIT  1;

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT id INTO v_partner_conv
    FROM   public.trip_conversations
    WHERE  trip_id    = v_partner_trip.id
      AND  party_type = v_conv.party_type
    LIMIT  1;

    IF v_partner_conv IS NULL THEN CONTINUE; END IF;

    IF p_dedupe_status IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trip_messages tm
      WHERE  tm.conversation_id = v_partner_conv
        AND  tm.message_type IN ('system', 'system_log', 'update')
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (
          (tm.metadata->>'status') = trim(p_dedupe_status)
          OR (tm.metadata->'event_payload'->>'new_status') = trim(p_dedupe_status)
        )
      LIMIT  1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,           sender_user_id,
      sender_role,      sender_name,               content,
      message_type,     is_read,                   metadata
    ) VALUES (
      v_partner_conv,   v_partner_trip.organization_id, null,
      'system',         'Trip System',                  p_content,
      'system',         false,                          v_meta
    );

  END LOOP;
END;
$$;

-- 6. Status broadcast trigger: tag business simulation + append copy hint.
CREATE OR REPLACE FUNCTION public.fn_broadcast_trip_status_to_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg       text;
  v_terminal  boolean;
  v_simulated boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_msg := public.fn_trip_status_chat_message_body(NEW);
  IF v_msg IS NULL THEN
    RETURN NEW;
  END IF;

  v_simulated := coalesce(NEW.status_change_origin, '') = 'business_simulated';
  IF v_simulated THEN
    v_msg := v_msg || ' (simulated)';
  END IF;

  v_terminal := NEW.status IN ('completed', 'delivered', 'done', 'cancelled');

  IF NOT EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = NEW.id LIMIT 1) THEN
    PERFORM public.fn_ensure_trip_party_conversations(NEW.id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = NEW.id LIMIT 1) THEN
    PERFORM public.fn_post_system_message_to_trip_chats(
      NEW.id,
      v_msg,
      NEW.status::text,
      v_simulated
    );
  END IF;

  IF v_simulated THEN
    UPDATE public.trips
    SET status_change_origin = NULL
    WHERE id = NEW.id;
  END IF;

  IF v_terminal THEN
    PERFORM public.fn_post_trip_feedback_prompt_to_chats(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- 7. Rate-limited location ping → system-update copy with city (WhatsApp model unchanged).
CREATE OR REPLACE FUNCTION public.fn_driver_locations_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_span                  double precision;
  v_health                text;
  v_rem_km                double precision;
  v_eta_days              double precision;
  v_eta_date              date;
  v_eta_label             text;
  v_late_body             text;
  v_loc_body              text;
  v_loc_meta              jsonb;
  v_late_meta             jsonb;
  v_last_location_chat_at timestamptz;
  v_city                  text;
  v_simulated             boolean;
BEGIN
  IF NEW.trip_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.trips
  SET last_location_at = coalesce(NEW.recorded_at, now())
  WHERE id = NEW.trip_id;

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

  v_simulated := NEW.source = 'simulated';

  IF NEW.source IN ('live', 'background', 'simulated') THEN
    SELECT last_location_chat_at
    INTO   v_last_location_chat_at
    FROM   public.trips
    WHERE  id = NEW.trip_id;

    IF v_last_location_chat_at IS NULL OR
       (now() - v_last_location_chat_at) >= interval '30 minutes' THEN

      PERFORM public.fn_ensure_trip_party_conversations(NEW.trip_id);

      v_city := coalesce(
        nullif(trim(NEW.address_label), ''),
        public.fn_trip_location_city_hint(NEW.trip_id)
      );

      v_loc_body := format(
        'Driver location update — %s%s',
        v_city,
        case when v_simulated then ' (simulated)' else '.' end
      );

      v_loc_meta := jsonb_build_object(
        'event_payload', jsonb_build_object(
          'location_ping', true,
          'simulated', case when v_simulated then true else null end,
          'location_data', jsonb_build_object(
            'lat', NEW.latitude,
            'lng', NEW.longitude,
            'address_name', v_city,
            'odometer_km', NEW.odometer_km,
            'recorded_at', to_char(
              timezone('UTC', coalesce(NEW.recorded_at, now())),
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          )
        )
      );

      PERFORM public.fn_post_system_log_to_trip_chats(NEW.trip_id, v_loc_body, v_loc_meta, 40);

      UPDATE public.trips
      SET last_location_chat_at = coalesce(NEW.recorded_at, now())
      WHERE id = NEW.trip_id;
    END IF;
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
        AND  tm.message_type = 'system_log'
        AND  coalesce(tm.metadata #>> '{event_payload,event_tag}', '') = 'LATE'
        AND  tm.created_at > (now() - interval '4 hours')
      LIMIT  1
    ) THEN
      RETURN NEW;
    END IF;

    SELECT
      greatest(
        coalesce(t.distance::double precision, 0::double precision) - coalesce(h.current_km, 0::double precision),
        0::double precision
      )
    INTO   v_rem_km
    FROM   public.trips t
    JOIN   public.v_long_haul_health h ON h.trip_id = t.id
    WHERE  t.id = NEW.trip_id;

    v_eta_days := case when v_rem_km > 0 then v_rem_km / 350.0 else 0::double precision end;
    v_eta_date := (now() + make_interval(days => greatest(round(v_eta_days)::int, 0)))::date;
    v_eta_label := to_char(v_eta_date, 'YYYY-MM-DD');

    v_late_body := format('⚠️ Vehicle behind schedule. New ETA: %s', v_eta_label);

    v_city := coalesce(
      nullif(trim(NEW.address_label), ''),
      public.fn_trip_location_city_hint(NEW.trip_id)
    );

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
          'address_name', v_city,
          'odometer_km', NEW.odometer_km,
          'recorded_at', to_char(
            timezone('UTC', coalesce(NEW.recorded_at, now())),
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        )
      )
    );

    PERFORM public.fn_post_system_log_to_trip_chats(NEW.trip_id, v_late_body, v_late_meta, 135);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_driver_locations_after_insert() IS
  'After INSERT on driver_locations: updates trip tracking fields and writes a rate-limited '
  'location ping to chat (max 1 per 30 min per trip — WhatsApp bootstrap model). '
  'Chat copy uses city/area labels, not coordinates. Late-haul health alerts fire independently.';
