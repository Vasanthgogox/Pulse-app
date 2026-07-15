-- After 20260501000000_chat_enhancements.sql: tighten trip status → chat.
-- (1) Ensure client/supplier/driver threads exist so the first status change still posts.
-- (2) Client/supplier rows use send_trip_chat_message so linked orgs get mirrored system lines.
-- (3) Driver thread: plain INSERT (RPC does not mirror driver party_type).
-- (4) Trip status UPDATE never rolls back if chat write fails.

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
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_trip.client_id IS NOT NULL THEN
    v_client_name := coalesce(
      (SELECT nullif(trim(coalesce(c.name, '')), '')
       FROM public.clients c
       WHERE c.id = v_trip.client_id
       LIMIT 1),
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
      (SELECT nullif(trim(coalesce(
        nullif(s.company_name, ''), nullif(s.name, ''), ''
      )), '')
       FROM public.suppliers s
       WHERE s.id = v_trip.supplier_id
       LIMIT 1),
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
      (SELECT nullif(trim(d.name), '')
       FROM public.drivers d
       WHERE d.id = v_trip.driver_id
       LIMIT 1),
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
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_post_system_message_to_trip_chats(
  p_trip_id uuid,
  p_content  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
BEGIN
  FOR v_conv IN
    SELECT id, party_type, organization_id
    FROM public.trip_conversations
    WHERE trip_id = p_trip_id
  LOOP
    BEGIN
      IF v_conv.party_type = 'driver' THEN
        INSERT INTO public.trip_messages (
          conversation_id, organization_id, sender_user_id, sender_role,
          sender_name, content, message_type, is_read, metadata
        )
        VALUES (
          v_conv.id, v_conv.organization_id, NULL, 'system',
          'Trip System', p_content, 'system', FALSE, NULL
        );
      ELSE
        PERFORM public.send_trip_chat_message(
          v_conv.id,
          p_content,
          'system',
          'Trip System',
          NULL,
          'system',
          NULL::jsonb
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'fn_post_system_message_to_trip_chats trip % conv %:%',
          p_trip_id, v_conv.id, SQLERRM;
    END;
  END LOOP;
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
  IF old.status IS NOT DISTINCT FROM new.status THEN
    RETURN new;
  END IF;

  v_msg := CASE new.status
    WHEN 'assigned' THEN
      'Vehicle ' || coalesce(nullif(new.vehicle_display_number, ''), 'TBD') ||
      ' assigned. Driver ' || coalesce(nullif(new.driver_display_name, ''), 'assigned') ||
      ' will report shortly.'
    WHEN 'in_progress' THEN
      'Driver ' || coalesce(nullif(new.driver_display_name, ''), 'assigned') ||
      ' has accepted the trip and is heading to pickup.'
    WHEN 'picked_up' THEN
      'Driver has reached the pickup point — ' ||
      coalesce(nullif(new.pickup_area, ''), 'pickup location') || '.'
    WHEN 'in_transit' THEN
      'Trip is now in transit. Vehicle departed ' ||
      coalesce(nullif(new.pickup_area, ''), 'pickup') || '.'
    WHEN 'at_drop' THEN
      'Vehicle has reached the destination — ' ||
      coalesce(nullif(new.drop_location, ''), 'drop location') || '.'
    WHEN 'completed' THEN
      'Trip ' || coalesce(nullif(new.trip_number, ''), '') ||
      ' completed successfully.'
    WHEN 'cancelled' THEN
      'Trip has been cancelled.'
    ELSE NULL
  END;

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

COMMENT ON FUNCTION public.fn_ensure_trip_party_conversations(uuid) IS
  'Creates trip_conversations for client/supplier/driver on this trip when missing (idempotent upsert).';

COMMENT ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text) IS
  'Posts a system line to every trip conversation; client/supplier use send_trip_chat_message for mirror.';

GRANT EXECUTE ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text) TO service_role;
