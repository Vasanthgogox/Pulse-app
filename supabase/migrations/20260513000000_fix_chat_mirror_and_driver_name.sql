-- Fix 1: Remove cross-org mirror from fn_post_system_message_to_trip_chats.
--
-- Root cause: the mirror block resolved the partner org's trip by matching
-- trip_number. trip_number is org-scoped — every org independently increments
-- TRP001, TRP002, etc. So when GoGoVan's TRP002 fires a status change, the
-- mirror lookup found aiman logs' own TRP002 (a completely different trip) and
-- wrote GoGoVan's system messages into aiman logs' conversation. This produced
-- phantom messages in trips that had nothing to do with the status change.
--
-- Fix: remove the mirror INSERT entirely. System messages stay within the
-- owning org. Cross-org visibility for B2B supplier coordination already works
-- via existing RLS policies (linked supplier org reads trip messages/conversations).
-- For indent-based trips both orgs create their own trip record with their own
-- chat, so no mirroring is needed there either.
--
-- Fix 2: Better driver name resolution in fn_trip_status_chat_message_body.
--
-- Root cause: the message body used coalesce(driver_display_name, 'assigned')
-- as a fallback, producing "Driver assigned" when driver_display_name is NULL
-- and "Driver Driver" when the driver entity was created with the placeholder
-- name 'Driver' (as claim_trip_by_otp does for newly-linked tracking drivers).
--
-- Fix: treat 'Driver' and 'assigned' as empty placeholders, look up the real
-- name from the drivers table, and fall back to 'the driver' rather than a
-- status word that reads as a name.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_trip_status_chat_message_body — better driver name resolution
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trip_status_chat_message_body(p public.trips)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_driver_name text;
BEGIN
  -- Skip placeholder names ('Driver', 'assigned') and look up the real name.
  -- Falls back to 'the driver' so the message is always readable.
  IF lower(trim(coalesce(p.driver_display_name, ''))) IN ('', 'driver', 'assigned') THEN
    SELECT nullif(trim(d.name), '') INTO v_driver_name
    FROM   public.drivers d
    WHERE  d.id = p.driver_id
      AND  lower(trim(d.name)) NOT IN ('', 'driver', 'assigned')
    LIMIT 1;
    v_driver_name := coalesce(v_driver_name, 'the driver');
  ELSE
    v_driver_name := p.driver_display_name;
  END IF;

  RETURN CASE p.status
    WHEN 'assigned' THEN
      'Vehicle ' || coalesce(nullif(p.vehicle_display_number, ''), 'TBD') ||
      ' assigned. ' || initcap(v_driver_name) || ' will report shortly.'
    WHEN 'in_progress' THEN
      initcap(v_driver_name) || ' has accepted the trip and is heading to pickup.'
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
      'Trip ' || coalesce(nullif(p.trip_number, ''), '') || ' completed successfully.'
    WHEN 'cancelled' THEN
      'Trip has been cancelled.'
    ELSE NULL
  END;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_post_system_message_to_trip_chats — remove cross-org mirror block
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_post_system_message_to_trip_chats(
  p_trip_id       UUID,
  p_content       TEXT,
  p_dedupe_status TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv  RECORD;
  v_meta  JSONB;
BEGIN
  v_meta := jsonb_build_object(
    'trip_status_broadcast', '1',
    'status', COALESCE(p_dedupe_status, '')
  );

  FOR v_conv IN
    SELECT id, party_type, organization_id
    FROM   public.trip_conversations
    WHERE  trip_id = p_trip_id
  LOOP
    -- Dedup: skip if an identical status broadcast already exists in this conversation.
    IF p_dedupe_status IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.trip_messages tm
      WHERE  tm.conversation_id = v_conv.id
        AND  tm.message_type    = 'system'
        AND  (tm.metadata->>'trip_status_broadcast') = '1'
        AND  (tm.metadata->>'status') = trim(p_dedupe_status)
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.trip_messages (
      conversation_id,  organization_id,     sender_user_id,
      sender_role,      sender_name,         content,
      message_type,     is_read,             metadata
    ) VALUES (
      v_conv.id,        v_conv.organization_id, NULL,
      'system',         'Trip System',          p_content,
      'system',         FALSE,                  v_meta
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_post_system_message_to_trip_chats(uuid, text, text) IS
  'Writes a system message to every trip_conversations row for this trip. '
  'Org-local only — cross-org mirror removed (trip_number is org-scoped, not globally unique; '
  'mirroring by trip_number wrote events into unrelated trips in other orgs).';
