-- trip_messages: re-consolidate SELECT RLS (drift restored heavy policies)
--
-- Remote currently OR's multiple SELECT policies (linked client/supplier +
-- trip_messages_select + organization_members_can_manage FOR ALL). That was
-- fixed once in 20260614190013 and came back — planning/exec under PostgREST
-- can hang for minutes on small trip_messages tables.
--
-- Keep a single SELECT path via private.user_can_read_trip_message().
-- Split org write into INSERT/UPDATE/DELETE so FOR ALL does not add another SELECT.
-- Harden mark_conversation_read with short local timeouts.

-- ─── 1. Drop redundant / duplicate SELECT-capable policies ───────────────────
DROP POLICY IF EXISTS "Linked client org reads trip messages" ON public.trip_messages;
DROP POLICY IF EXISTS "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages;
DROP POLICY IF EXISTS "Linked supplier via indent reads trip messages" ON public.trip_messages;
DROP POLICY IF EXISTS "organization_members_can_manage_trip_messages" ON public.trip_messages;
DROP POLICY IF EXISTS "Drivers can view messages in their conversations" ON public.trip_messages;

-- ─── 2. Single SELECT policy ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "trip_messages_select" ON public.trip_messages;
CREATE POLICY "trip_messages_select"
  ON public.trip_messages
  FOR SELECT
  TO authenticated
  USING (private.user_can_read_trip_message(organization_id, conversation_id));

-- ─── 3. Org write without SELECT (avoid second OR'd SELECT path) ─────────────
DROP POLICY IF EXISTS "trip_messages_org_write" ON public.trip_messages;

CREATE POLICY "trip_messages_org_insert"
  ON public.trip_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.organization_id = trip_messages.organization_id
        AND (om.status = 'active' OR om.status IS NULL)
    )
  );

CREATE POLICY "trip_messages_org_update"
  ON public.trip_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.organization_id = trip_messages.organization_id
        AND (om.status = 'active' OR om.status IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.organization_id = trip_messages.organization_id
        AND (om.status = 'active' OR om.status IS NULL)
    )
  );

CREATE POLICY "trip_messages_org_delete"
  ON public.trip_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
        AND om.organization_id = trip_messages.organization_id
        AND (om.status = 'active' OR om.status IS NULL)
    )
  );

-- ─── 4. mark_conversation_read: short timeouts, index-friendly update ────────
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Prevent stuck mark-read from holding locks for minutes if something contending.
  SET LOCAL statement_timeout = '5s';
  SET LOCAL lock_timeout = '2s';

  UPDATE public.trip_messages
  SET
    is_read = TRUE,
    read_at = COALESCE(read_at, NOW())
  WHERE conversation_id = p_conversation_id
    AND is_read = FALSE
    AND sender_role IS DISTINCT FROM 'dispatcher';

  UPDATE public.trip_conversations
  SET
    unread_dispatcher_count = 0,
    updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$function$;
