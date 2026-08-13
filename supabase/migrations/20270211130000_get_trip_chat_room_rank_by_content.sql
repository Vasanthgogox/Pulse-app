-- Follow-up to 20270211120000_get_trip_chat_room_prefer_driver_lane.sql.
--
-- PROBLEM WITH THE PREVIOUS VERSION
-- That migration ranked by room INTENT (is this the assigned driver's lane?)
-- before room CONTENT. Across 171 trips it lifted human-visible messages from
-- 12 to 151, but it regressed 3 trips (6 messages) where the driver lane won
-- the ordering while the actual conversation sat elsewhere.
--
-- A first attempt at a fix — adding EXISTS(... non-empty ...) to the driver-lane
-- tiers — was measured before shipping and REJECTED: it repaired 3 trips but
-- broke 1 new one and still left 4 regressed versus the original behaviour.
-- Reason: on several trips the driver lane is non-empty AND the system room also
-- holds text (e.g. 'trip_lane:2 | trip:5', 'trip_lane:1 | trip:1'), so a boolean
-- "is it empty" test cannot decide which room holds the conversation.
--
-- FIX
-- Rank by human-message COUNT first, then fall back to driver-lane preference
-- purely as a tiebreak. Content decides; intent only breaks ties.
--
-- Only 'text' and 'document_share' count as human content. action_card, system,
-- system_log, feedback_request, assignment_update and ledger_event are machine
-- chatter — the system room holds 841 action cards, and counting those would
-- make it win every trip and reintroduce the original bug.
--
-- MEASURED over all 171 trips with chat (read-only, pre-apply):
--   original ('trip' only)      12 human messages visible
--   previous migration         151, but 3 trips regressed
--   this version               160, 0 trips regressed, 0 worse than deployed
--   rooms chosen               167 driver lanes, 4 system rooms
-- The 4 system rooms are trips whose conversation genuinely lives there.
--
-- SAFETY
--   * Access control UNCHANGED: fn_can_access_trip_for_chat(p_trip_id) still
--     gates every candidate row.
--   * Return type (chat_conversations) unchanged; generated TS types and the
--     GRANTs from 20260918000000_trip_chat_room_phase2 still hold.
--   * is_archived = false guard retained.
--   * Strictly non-regressive: no trip loses visible messages relative to either
--     the original definition or the currently deployed one.
--
-- COST NOTE
-- The correlated count runs per candidate room (typically 2-4 per trip) on each
-- call. chat_messages has an index on conversation_id, and the RPC is called
-- once per chat-sheet open, so this is not a hot path. If it ever shows up in
-- slow queries, chat_conversations.message_count could be used instead — but
-- that column counts ALL message types, so it cannot replace this filter today.
--
-- KNOWN LIMITATION (unchanged, separate ticket)
-- Still returns a single room, so supplier and client lanes remain invisible on
-- the trip page. Showing every counterparty needs a lane switcher or merged read.

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
    -- 1. Where the humans actually are. Machine message types are excluded so
    --    the action-card-heavy system room cannot win on volume alone.
    (SELECT count(*)
       FROM public.chat_messages m
      WHERE m.conversation_id = cc.id
        AND m.message_type IN ('text', 'document_share')) DESC,
    -- 2. Tiebreak: the assigned driver's lane, the operational room a
    --    dispatcher expects when opening chat from the trip page.
    (cc.conversation_type = 'trip_lane'
       AND cc.driver_id IS NOT NULL
       AND cc.driver_id = (SELECT t.driver_id FROM public.trips t WHERE t.id = p_trip_id)
    ) DESC,
    -- 3. Tiebreak: any driver lane (driver reassigned since the lane was made).
    (cc.conversation_type = 'trip_lane' AND cc.driver_id IS NOT NULL) DESC,
    -- 4. Tiebreak: most recent traffic.
    cc.last_message_at DESC NULLS LAST,
    -- 5. Deterministic final tiebreak.
    cc.created_at ASC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.get_trip_chat_room(uuid) IS
  'Returns the trip chat room holding the most human conversation (text + document_share), tiebroken toward the assigned driver''s trip_lane. Machine message types (action_card, system, ledger_event, ...) are excluded from the ranking so the system room cannot win on volume. Access gated by fn_can_access_trip_for_chat.';
