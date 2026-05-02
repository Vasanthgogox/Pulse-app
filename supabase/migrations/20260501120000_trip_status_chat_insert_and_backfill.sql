-- Trip status → chat: shared body builder + AFTER INSERT OR UPDATE OF status so the initial
-- status is mirrored to chat once (previously the trigger ran only AFTER UPDATE OF status).

CREATE OR REPLACE FUNCTION public.fn_trip_status_chat_message_body(p public.trips)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE p.status
    WHEN 'assigned' THEN
      'Vehicle ' || coalesce(nullif(p.vehicle_display_number, ''), 'TBD') ||
      ' assigned. Driver ' || coalesce(nullif(p.driver_display_name, ''), 'assigned') ||
      ' will report shortly.'
    WHEN 'in_progress' THEN
      'Driver ' || coalesce(nullif(p.driver_display_name, ''), 'assigned') ||
      ' has accepted the trip and is heading to pickup.'
    WHEN 'picked_up' THEN
      'Driver has reached the pickup point — ' ||
      coalesce(nullif(p.pickup_area, ''), 'pickup location') || '.'
    WHEN 'in_transit' THEN
      'Trip is now in transit. Vehicle departed ' ||
      coalesce(nullif(p.pickup_area, ''), 'pickup') || '.'
    WHEN 'at_drop' THEN
      'Vehicle has reached the destination — ' ||
      coalesce(nullif(p.drop_location, ''), 'drop location') || '.'
    WHEN 'completed' THEN
      'Trip ' || coalesce(nullif(p.trip_number, ''), '') ||
      ' completed successfully.'
    WHEN 'cancelled' THEN
      'Trip has been cancelled.'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.fn_broadcast_trip_status_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg text;
BEGIN
  IF tg_op = 'UPDATE' THEN
    IF old.status IS NOT DISTINCT FROM new.status THEN
      RETURN new;
    END IF;
  END IF;

  v_msg := public.fn_trip_status_chat_message_body(new);
  IF v_msg IS NULL THEN
    RETURN new;
  END IF;

  BEGIN
    PERFORM public.fn_ensure_trip_party_conversations(new.id);

    IF EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = new.id LIMIT 1) THEN
      PERFORM public.fn_post_system_message_to_trip_chats(new.id, v_msg);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'fn_broadcast_trip_status_to_chat trip %:%', new.id, SQLERRM;
  END;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.fn_trip_status_chat_message_body(public.trips) IS
  'Human-readable trip status line for chat (same mapping as status trigger).';

DROP TRIGGER IF EXISTS trg_trip_status_to_chat ON public.trips;

CREATE TRIGGER trg_trip_status_to_chat
  AFTER INSERT OR UPDATE OF status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_broadcast_trip_status_to_chat();
