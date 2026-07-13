-- Fix windowed_trip_message_history for linked-supplier viewers
--
-- The function is NOT SECURITY DEFINER, so RLS applies to every table it touches.
-- For a linked supplier (e.g. nihas viewing Deepak's TRP011 CLIENT tab):
--
--   trip_messages RLS → subquery on trip_conversations
--     trip_conversations RLS → subquery on trips
--       trips RLS → subquery on suppliers (Deepak's org) or direct_quotes
--
-- The intermediate tables (suppliers, direct_quotes) are scoped to the HOST org.
-- The linked supplier org has no direct RLS access to those rows, so the nested
-- EXISTS chain collapses to false → windowed_trip_message_history returns 0 rows
-- → "Messages not loaded" even after tapping Load History.
--
-- Fix: make the function SECURITY DEFINER and embed an explicit auth check that
-- mirrors the same "who can read this conversation" logic without relying on nested
-- RLS cascades.

CREATE OR REPLACE FUNCTION public.windowed_trip_message_history(
  p_conversation_id uuid,
  p_before          timestamptz DEFAULT NULL,
  p_limit           integer     DEFAULT 20,
  p_party_type      text        DEFAULT NULL
)
RETURNS SETOF public.trip_messages
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conv public.trip_conversations%ROWTYPE;
BEGIN
  -- Load the conversation (bypasses RLS as SECURITY DEFINER).
  SELECT * INTO v_conv
  FROM public.trip_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Auth gate: caller must be one of:
  --   (a) active member of the conversation's owning org
  --   (b) the assigned driver for this driver-lane conversation
  --   (c) an active member of the linked supplier org for this trip
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = v_conv.organization_id
      AND om.status = 'active'
  ) AND NOT (
    v_conv.party_type = 'driver'
    AND v_conv.driver_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = v_conv.driver_id AND d.user_id = auth.uid()
    )
  ) AND NOT EXISTS (
    -- Linked supplier org member can read supplier-lane and driver-lane messages.
    SELECT 1
    FROM public.trips t
    JOIN public.suppliers s ON s.id = t.supplier_id
    JOIN public.organization_members om
      ON om.user_id = auth.uid()
     AND om.organization_id = s.linked_organization_id
     AND om.status = 'active'
    WHERE t.id = v_conv.trip_id
      AND v_conv.party_type IN ('supplier', 'driver')
  ) AND NOT EXISTS (
    -- Linked supplier via accepted direct_quote (indent-based trip without supplier_id yet).
    SELECT 1
    FROM public.trips t
    JOIN public.direct_quotes dq ON dq.indent_id = t.indent_id
      AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
    JOIN public.organization_members om
      ON om.user_id = auth.uid()
     AND om.organization_id = dq.bidder_organization_id
     AND om.status = 'active'
    WHERE t.id = v_conv.trip_id
      AND t.indent_id IS NOT NULL
      AND v_conv.party_type IN ('supplier', 'driver')
  ) AND NOT EXISTS (
    -- Linked client org member can read client-lane messages.
    SELECT 1
    FROM public.trips t
    JOIN public.clients c ON c.id = t.client_id
    JOIN public.organization_members om
      ON om.user_id = auth.uid()
     AND om.organization_id = c.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE t.id = v_conv.trip_id
      AND v_conv.party_type = 'client'
  ) THEN
    -- Not authorized — return empty result set silently.
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.*
  FROM   public.trip_messages m
  WHERE  m.conversation_id = p_conversation_id
    AND  (p_party_type IS NULL OR v_conv.party_type = p_party_type)
    AND  (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 20), 1), 100);
END;
$$;
