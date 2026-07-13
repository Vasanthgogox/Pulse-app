-- Prevent connection pool exhaustion from slow RLS evaluation on trip_messages.
--
-- Root cause: trip_messages has 10 RLS SELECT policies with multi-table EXISTS joins.
-- Authenticated PostgREST queries can get stuck in RLS planning/evaluation for 250s+.
-- Without a timeout, a few concurrent chat loads exhaust the connection pool → DB crash.
--
-- Fix 1: Hard cap all authenticated queries at 25s. Slow RLS evaluations get killed
--         automatically; users get a fast error instead of a 4-minute hung request.
--
-- Fix 2: ANALYZE stale tables so the planner has current statistics. trips table had
--         autovacuum never run (0 live rows, 2 dead) — stale stats cause worst-case
--         join order choices inside the RLS EXISTS subqueries.

ALTER ROLE authenticated SET statement_timeout = '25s';

ANALYZE public.trips;
ANALYZE public.trip_messages;
ANALYZE public.trip_conversations;
ANALYZE public.organization_members;
ANALYZE public.suppliers;
ANALYZE public.clients;
