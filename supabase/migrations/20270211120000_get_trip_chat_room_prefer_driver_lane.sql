-- Trip page chat showed no human conversation.
--
-- PROBLEM
-- get_trip_chat_room filtered to conversation_type = 'trip'. That room is the
-- system/team room created by fn_ensure_trip_chat_room_core (one per trip,
-- channel_key 'trip:<uuid>'): across production it holds 841 action_card rows
-- and only 11 text messages, and ZERO document_share rows.
--
-- Real human conversation lives in 'trip_lane' rooms. Of 88 text messages on
-- trip conversations, 73 are in driver lanes; all 77 shared documents are in
-- driver lanes. Net effect on the trip page: 24 trips showed no text at all and
-- 37 showed no documents, while the sheet still rendered a wall of action cards
-- so it never looked empty. Reported as "chat is not working inside the trip
-- page, but the image posted by the driver is visible" — the images were
-- visible because the trip page renders documents through its own POD/document
-- viewer, not through chat.
--
-- FIX
-- Widen the filter to include 'trip_lane' and pick deterministically. Lanes are
-- explicitly tagged (driver_id / supplier_id / client_id; 0 untagged rows out of
-- 510 trip conversations), so the driver lane can be targeted directly instead
-- of relying on a blind LIMIT 1 that could return either room.
--
-- ORDER BY tiers:
--   1. The trip_lane whose driver_id matches the trip's CURRENT assigned driver
--      — the operational chat a dispatcher expects to open.
--   2. Any driver lane, covering driver reassignment where the lane's driver_id
--      is now stale.
--   3. Whichever remaining room has actual traffic (last_message_at).
--   4. created_at, so the result is deterministic. The previous definition had
--      no tiebreak at all, so LIMIT 1 could vary between calls.
--
-- SAFETY
--   * Access control is UNCHANGED: fn_can_access_trip_for_chat(p_trip_id) still
--     gates every candidate row, exactly as before.
--   * Return type (chat_conversations) is unchanged, so generated TS types and
--     the existing GRANTs from 20260918000000_trip_chat_room_phase2 still hold.
--   * Adds `is_archived = false`, which the original omitted — an archived room
--     could previously win.
--   * Blast radius verified: one runtime caller (getTripChatRoom ->
--     useTripChatRoom -> TripChatRoomSheet) which reads only id,
--     organization_id and title and never inspects conversation_type. No
--     database function, view or matview references this RPC.
--     ChatTripRoomInboxSection filters conversation_type = 'trip' but sources it
--     from get_chat_inbox, a different RPC, so its "Team rooms" list is
--     unaffected.
--
-- KNOWN LIMITATION (separate ticket)
-- This returns a single room, so supplier and client lanes remain invisible on
-- the trip page (4 messages total today). Showing every counterparty needs a
-- lane switcher or a merged read, which is a UI/product change.
--
-- Side effect: useTripChatRoom falls back to ensureTripChatRoom only when this
-- returns NULL, so that fallback — and its implicit chat_participants sync —
-- now runs less often. The "Sync team" button calls refreshTripChatRoomTeam
-- explicitly, so team sync remains reachable.

CREATE OR REPLACE FUNCTION public.get_trip_chat_room(p_trip_id uuid)
RETURNS chat_conversations
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cc.*
  FROM public.chat_conversations cc
  WHERE cc.trip_id = p_trip_id
    AND cc.conversation_type IN ('trip', 'trip_lane')
    AND cc.is_archived = false
    AND public.fn_can_access_trip_for_chat(p_trip_id)
  ORDER BY
    -- 1. Driver lane for THIS trip's currently assigned driver.
    (cc.conversation_type = 'trip_lane'
       AND cc.driver_id IS NOT NULL
       AND cc.driver_id = (SELECT t.driver_id FROM public.trips t WHERE t.id = p_trip_id)
    ) DESC,
    -- 2. Any driver lane (driver reassigned since the lane was created).
    (cc.conversation_type = 'trip_lane' AND cc.driver_id IS NOT NULL) DESC,
    -- 3. Whichever room actually has traffic.
    cc.last_message_at DESC NULLS LAST,
    -- 4. Deterministic tiebreak.
    cc.created_at ASC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.get_trip_chat_room(uuid) IS
  'Returns the best trip chat room for the caller: prefers the assigned driver''s trip_lane (where human conversation and shared documents live), falling back to any driver lane, then the most active room, then oldest. Access still gated by fn_can_access_trip_for_chat.';
