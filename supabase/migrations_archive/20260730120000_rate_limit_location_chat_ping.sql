-- Rate-limit location pings written to trip_messages chat.
-- Before this migration, every GPS ping inserted into driver_locations would create
-- a system_log chat message, spamming the chat with 10+ pings per hour per trip.
-- The WhatsApp model: write to chat at most once every 30 minutes per trip.
-- We track when the last location ping was written per trip in trips.last_location_chat_at.

-- 1. Add tracking column to trips
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS last_location_chat_at timestamptz;

COMMENT ON COLUMN public.trips.last_location_chat_at IS
  'Timestamp of the last location_ping system_log message written to trip_messages. '
  'Used to rate-limit the trigger so pings are consolidated (max 1 per 30 min).';

-- 2. Replace the trigger function with a rate-limited version
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
BEGIN
  IF NEW.trip_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Always update last_location_at on the trip
  UPDATE public.trips
  SET last_location_at = COALESCE(NEW.recorded_at, now())
  WHERE id = NEW.trip_id;

  -- Update actual_distance_traveled_km from odometer span
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
    -- Rate-limit: only write to chat if the last location ping was > 30 min ago (or never).
    -- This collapses N pings per hour into 2 chat messages max — the WhatsApp bootstrap model.
    SELECT last_location_chat_at
    INTO   v_last_location_chat_at
    FROM   public.trips
    WHERE  id = NEW.trip_id;

    IF v_last_location_chat_at IS NULL OR
       (now() - v_last_location_chat_at) >= interval '30 minutes' THEN

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

      -- Record that we wrote a location ping to chat
      UPDATE public.trips
      SET last_location_chat_at = COALESCE(NEW.recorded_at, now())
      WHERE id = NEW.trip_id;
    END IF;
  END IF;

  -- Long-haul health alert (unchanged — these always fire on health degradation)
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

COMMENT ON FUNCTION public.fn_driver_locations_after_insert() IS
  'After INSERT on driver_locations: updates trip tracking fields and writes a rate-limited '
  'location ping to chat (max 1 per 30 min per trip — WhatsApp bootstrap model). '
  'Late-haul health alerts fire independently without rate limiting.';
