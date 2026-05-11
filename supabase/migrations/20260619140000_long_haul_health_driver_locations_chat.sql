-- Long-haul health (350 km/day pace), odometer on pings, chat mirror + LATE alerts.

ALTER TABLE public.driver_locations
  ADD COLUMN IF NOT EXISTS odometer_km double precision NULL;

COMMENT ON COLUMN public.driver_locations.odometer_km IS
  'Optional hubometer reading when the driver app reports a checkpoint (long-haul pacing).';

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS actual_distance_traveled_km numeric(12, 2) NULL;

COMMENT ON COLUMN public.trips.actual_distance_traveled_km IS
  'Best-known distance progress (km); maintained from odometer span on driver_locations when available.';

-- Pace vs elapsed time for in-flight trips (350 km per calendar day since anchor).
CREATE OR REPLACE VIEW public.v_long_haul_health AS
SELECT
  t.id AS trip_id,
  t.trip_number,
  COALESCE(t.distance::double precision, 0::double precision) AS total_distance_km,
  (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at)) AS time_elapsed,
  GREATEST(
    EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at))) / 86400.0
      * 350.0,
    0::double precision
  ) AS expected_km,
  COALESCE(
    t.actual_distance_traveled_km::double precision,
    (
      SELECT CASE
        WHEN count(*) FILTER (WHERE dl.odometer_km IS NOT NULL) >= 2 THEN
          max(dl.odometer_km) - min(dl.odometer_km)
        ELSE NULL::double precision
      END
      FROM public.driver_locations dl
      WHERE dl.trip_id = t.id
    ),
    0::double precision
  ) AS current_km,
  CASE
    WHEN COALESCE(t.started_at, t.pickup_date::timestamptz) IS NULL THEN 'ON_TRACK'
    WHEN lower(trim(t.status)) NOT IN (
      'in_transit', 'picked_up', 'in_progress', 'transit', 'at_drop',
      'loading', 'unloading', 'at_pickup', 'assigned', 'active'
    ) THEN 'ON_TRACK'
    WHEN EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at))) <= 0
      THEN 'ON_TRACK'
    WHEN
      COALESCE(
        t.actual_distance_traveled_km::double precision,
        (
          SELECT CASE
            WHEN count(*) FILTER (WHERE dl2.odometer_km IS NOT NULL) >= 2 THEN
              max(dl2.odometer_km) - min(dl2.odometer_km)
            ELSE NULL::double precision
          END
          FROM public.driver_locations dl2
          WHERE dl2.trip_id = t.id
        ),
        0::double precision
      )
      < (
        EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at))) / 86400.0
        * 350.0
      ) * 0.7
      THEN 'CRITICAL_DELAY'
    WHEN
      COALESCE(
        t.actual_distance_traveled_km::double precision,
        (
          SELECT CASE
            WHEN count(*) FILTER (WHERE dl3.odometer_km IS NOT NULL) >= 2 THEN
              max(dl3.odometer_km) - min(dl3.odometer_km)
            ELSE NULL::double precision
          END
          FROM public.driver_locations dl3
          WHERE dl3.trip_id = t.id
        ),
        0::double precision
      )
      < (
        EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, t.pickup_date::timestamptz, t.created_at))) / 86400.0
        * 350.0
      ) * 0.9
      THEN 'LATE_RISK'
    ELSE 'ON_TRACK'
  END AS health_status
FROM public.trips t;

ALTER VIEW public.v_long_haul_health SET (security_invoker = true);

COMMENT ON VIEW public.v_long_haul_health IS
  'Long-haul pacing: expected km = days_since_anchor * 350; health from actual_distance_traveled_km or odometer span.';

GRANT SELECT ON public.v_long_haul_health TO authenticated;

-- Broadcast a system_log row to every party thread on the trip + linked partner org (B2B), like status lines.
CREATE OR REPLACE FUNCTION public.fn_post_system_log_to_trip_chats(
  p_trip_id          uuid,
  p_content          text,
  p_metadata         jsonb,
  p_priority_weight  integer DEFAULT 40
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv         record;
  v_source_trip  record;
  v_partner_org  uuid;
  v_partner_trip record;
  v_partner_conv uuid;
BEGIN
  SELECT id, organization_id, trip_number, client_id, supplier_id
  INTO   v_source_trip
  FROM   public.trips
  WHERE  id = p_trip_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_conv IN
    SELECT id, party_type, organization_id, client_id, supplier_id
    FROM   public.trip_conversations
    WHERE  trip_id = p_trip_id
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
      'system',
      'Trip System',
      p_content,
      'system_log',
      FALSE,
      p_metadata,
      COALESCE(p_priority_weight, 40)
    );

    v_partner_org := NULL;

    IF v_conv.party_type = 'client' AND v_conv.client_id IS NOT NULL THEN
      SELECT linked_organization_id
      INTO   v_partner_org
      FROM   public.clients
      WHERE  id = v_conv.client_id;

    ELSIF v_conv.party_type = 'supplier' AND v_conv.supplier_id IS NOT NULL THEN
      SELECT linked_organization_id
      INTO   v_partner_org
      FROM   public.suppliers
      WHERE  id = v_conv.supplier_id;
    END IF;

    IF v_partner_org IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id, organization_id
    INTO   v_partner_trip
    FROM   public.trips
    WHERE  organization_id = v_partner_org
      AND  trip_number = v_source_trip.trip_number
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT id
    INTO   v_partner_conv
    FROM   public.trip_conversations
    WHERE  trip_id = v_partner_trip.id
      AND  party_type = v_conv.party_type
    LIMIT 1;

    IF v_partner_conv IS NULL THEN
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
      metadata,
      priority_weight
    ) VALUES (
      v_partner_conv,
      v_partner_trip.organization_id,
      NULL,
      'system',
      'Trip System',
      p_content,
      'system_log',
      FALSE,
      p_metadata,
      COALESCE(p_priority_weight, 40)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_post_system_log_to_trip_chats(uuid, text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_post_system_log_to_trip_chats(uuid, text, jsonb, integer) TO service_role;

COMMENT ON FUNCTION public.fn_post_system_log_to_trip_chats(uuid, text, jsonb, integer) IS
  'SECURITY DEFINER: inserts system_log into all trip_conversations for a trip + linked partner trip threads.';

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
  v_loc_body       text;
  v_loc_meta       jsonb;
  v_late_meta      jsonb;
BEGIN
  IF NEW.trip_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.trips
  SET last_location_at = COALESCE(NEW.recorded_at, now())
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

  IF NEW.source IN ('live', 'background') THEN
    PERFORM public.fn_ensure_trip_party_conversations(NEW.trip_id);

    v_loc_body :=
      format(
        'Location ping · %s',
        to_char(timezone('UTC', coalesce(NEW.recorded_at, now())), 'YYYY-MM-DD HH24:MI "UTC"')
      );

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

    PERFORM public.fn_post_system_log_to_trip_chats(NEW.trip_id, v_loc_body, v_loc_meta, 40);
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

DROP TRIGGER IF EXISTS trg_driver_locations_long_haul ON public.driver_locations;
CREATE TRIGGER trg_driver_locations_long_haul
  AFTER INSERT ON public.driver_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_driver_locations_after_insert();

COMMENT ON FUNCTION public.fn_driver_locations_after_insert() IS
  'Updates trip health fields, mirrors location pings to trip chat (system_log), and posts deduped LATE alerts.';
