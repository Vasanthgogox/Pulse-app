-- =============================================================================
-- P0.6 Authorization Cleanup: drop duplicate SELECT policies left behind by the
-- trip_messages/trip_conversations RLS reconsolidation (20260714101340,
-- 20260614192036/20260614190013). Those migrations added a single fast,
-- function-based SELECT policy (trip_messages_select / trip_conversations_select
-- -> private.user_can_read_trip_message / user_can_read_trip_conversation) but
-- never dropped the multi-JOIN policies they superseded.
--
-- Postgres combines every policy on a table with OR into one plan, so every read
-- of these two tables was paying to *plan* (not execute — the old policies show
-- "never executed" in EXPLAIN ANALYZE) four separate JOIN-heavy predicates.
-- Local repro (45k trip_messages, 3k conversations, 50 linked orgs): planning
-- time drops from ~100-210ms to ~7ms per query once these are removed — a
-- single-row RLS check goes from ~292ms to ~14ms cold, ~705ms to ~36ms warm
-- across 30 sequential checks. See docs/REALTIME_PLATFORM_RULES.md.
--
-- Purely subtractive: the function-based policies already cover every case the
-- dropped policies covered (own org, linked client org, linked supplier org,
-- linked supplier via accepted indent). No access is removed.
-- =============================================================================

DROP POLICY IF EXISTS "Linked client org reads trip messages" ON public.trip_messages;
DROP POLICY IF EXISTS "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages;
DROP POLICY IF EXISTS "Linked supplier via indent reads trip messages" ON public.trip_messages;

DROP POLICY IF EXISTS "Linked client org reads trip conversations" ON public.trip_conversations;
DROP POLICY IF EXISTS "Linked supplier org reads trip conversations for supplied trips" ON public.trip_conversations;
DROP POLICY IF EXISTS "Linked supplier via indent reads trip conversations" ON public.trip_conversations;
