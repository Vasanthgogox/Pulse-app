-- LATE chat alerts: embed scheduled (original) ETA alongside revised ETA for delay display.
-- Scheduled = anchor (started_at / pickup_date / created_at) + distance ÷ 350 km/day.

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
  v_total_km              double precision;
  v_scheduled_days        double precision;
  v_eta_days              double precision;
  v_eta_date              date;
  v_eta_label             text;
  v_scheduled_date        date;
  v_scheduled_label       text;
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
      ),
      coalesce(t.distance::double precision, 0::double precision)
    INTO   v_rem_km, v_total_km
    FROM   public.trips t
    JOIN   public.v_long_haul_health h ON h.trip_id = t.id
    WHERE  t.id = NEW.trip_id;

    v_scheduled_days := case when v_total_km > 0 then v_total_km / 350.0 else 0::double precision end;

    SELECT
      (coalesce(t.started_at, t.pickup_date::timestamptz, t.created_at)
        + make_interval(days => greatest(round(v_scheduled_days)::int, 0)))::date
    INTO   v_scheduled_date
    FROM   public.trips t
    WHERE  t.id = NEW.trip_id;

    v_scheduled_label := to_char(coalesce(v_scheduled_date, current_date), 'YYYY-MM-DD');

    v_eta_days := case when v_rem_km > 0 then v_rem_km / 350.0 else 0::double precision end;
    v_eta_date := (now() + make_interval(days => greatest(round(v_eta_days)::int, 0)))::date;
    v_eta_label := to_char(v_eta_date, 'YYYY-MM-DD');

    v_late_body := format(
      '⚠️ Vehicle behind schedule. Scheduled ETA: %s · Updated ETA: %s',
      v_scheduled_label,
      v_eta_label
    );

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
        'original_eta', v_scheduled_label,
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
  'After INSERT on driver_locations: rate-limited location pings + LATE alerts with '
  'scheduled (original) and updated ETA at 350 km/day pace.';
