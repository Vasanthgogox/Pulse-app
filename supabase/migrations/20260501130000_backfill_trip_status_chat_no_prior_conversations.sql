-- Complement to 20260501120000: the first backfill only chose trips WHERE trip_conversations
-- already existed. Trips never opened in chat / no ledger-triggered conversation were skipped —
-- including many assigned aggregate trips (e.g. TRP023) despite client_id/supplier_id/driver_id.
--
-- Idempotent with the same Trip System sentinel as before; safe to push after prior backfill.

DO $$
DECLARE
  r           RECORD;
  v_msg       text;
  v_backfill  int := 0;
BEGIN
  FOR r IN
    SELECT t.id
    FROM public.trips t
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.trip_messages tm
        INNER JOIN public.trip_conversations tc ON tc.id = tm.conversation_id
        WHERE tc.trip_id = t.id
          AND tm.message_type = 'system'
          AND tm.sender_role = 'system'
          AND tm.sender_name = 'Trip System'
      )
  LOOP
    SELECT public.fn_trip_status_chat_message_body(tr) INTO v_msg
    FROM public.trips tr
    WHERE tr.id = r.id;

    CONTINUE WHEN v_msg IS NULL;

    BEGIN
      PERFORM public.fn_ensure_trip_party_conversations(r.id);
      IF EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = r.id LIMIT 1) THEN
        PERFORM public.fn_post_system_message_to_trip_chats(r.id, v_msg);
        v_backfill := v_backfill + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'backfill_trip_status_chat_no_prior_conv trip %:%', r.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'backfill_trip_status_chat_no_prior_conv: posted for % trip(s)', v_backfill;
END $$;
