-- 1. Batch driver profile display (fixes N+1: one call per driver list → one call total)
CREATE OR REPLACE FUNCTION public.get_driver_profile_display_batch(p_driver_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_object_agg(
      d.id::text,
      jsonb_build_object(
        'fullName',   coalesce(p.full_name, ''),
        'avatarUrl',  coalesce(p.avatar_url, ''),
        'avatarSeed', coalesce(p.avatar_seed, '')
      )
    ),
    '{}'::jsonb
  )
  FROM public.drivers d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE d.id = ANY(p_driver_ids)
    AND d.user_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_profile_display_batch(uuid[]) TO authenticated;

-- 2. Restore fn_post_trip_feedback_prompt_to_chats (may be missing after DB restore)
CREATE OR REPLACE FUNCTION public.fn_post_trip_feedback_prompt_to_chats(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.trip_conversations%ROWTYPE;
  v_body text := 'Trip completed — rate this partner to close the mission debrief.';
  v_meta jsonb;
BEGIN
  FOR v_conv IN
    SELECT *
    FROM public.trip_conversations
    WHERE trip_id = p_trip_id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.trip_messages tm
      WHERE tm.conversation_id = v_conv.id
        AND tm.message_type = 'feedback_request'
    ) THEN
      CONTINUE;
    END IF;

    IF v_conv.party_type = 'client' AND v_conv.client_id IS NOT NULL THEN
      v_meta := jsonb_build_object(
        'feedback_version', 1,
        'rated_party_type', 'client',
        'rated_id', v_conv.client_id::text,
        'rated_display_name', v_conv.party_name
      );
    ELSIF v_conv.party_type = 'supplier' AND v_conv.supplier_id IS NOT NULL THEN
      v_meta := jsonb_build_object(
        'feedback_version', 1,
        'rated_party_type', 'supplier',
        'rated_id', v_conv.supplier_id::text,
        'rated_display_name', v_conv.party_name
      );
    ELSIF v_conv.party_type = 'driver' AND v_conv.driver_id IS NOT NULL THEN
      v_meta := jsonb_build_object(
        'feedback_version', 1,
        'rated_party_type', 'driver',
        'rated_id', v_conv.driver_id::text,
        'rated_display_name', v_conv.party_name
      );
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id, organization_id, sender_user_id, sender_role,
      sender_name, content, message_type, is_read, metadata
    )
    VALUES (
      v_conv.id, v_conv.organization_id, NULL, 'system',
      'Trip System', v_body, 'feedback_request', FALSE, v_meta
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_post_trip_feedback_prompt_to_chats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_post_trip_feedback_prompt_to_chats(uuid) TO service_role;
