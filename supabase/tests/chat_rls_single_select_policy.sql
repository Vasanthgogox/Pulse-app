-- One Authorization Truth — trip_messages / trip_conversations should carry
-- exactly one SELECT, INSERT, UPDATE, and DELETE policy each.
--
-- Context: the 20260714101340/20260614190013/20260614192036 reconsolidation
-- migrations replaced four overlapping multi-JOIN SELECT policies per table
-- with a single fast function-based policy (private.user_can_read_trip_message
-- / user_can_read_trip_conversation), but never dropped the policies they
-- superseded. Postgres compiles every policy on a table into one OR'd plan,
-- so the leftover policies were never executed at runtime but still cost
-- ~20x extra query-planning time on every single read of these tables — see
-- 20270131090000_drop_duplicate_chat_rls_policies.sql and
-- docs/REALTIME_PLATFORM_RULES.md for the measured before/after.
--
-- SELECT is enforced (RAISE EXCEPTION): both tables are confirmed clean at
-- exactly 1, and the fix + cost model are measured. This guards against the
-- same drift recurring: any future migration that adds a new SELECT policy
-- without dropping the old one fails this check immediately.
--
-- INSERT/UPDATE/DELETE are reported only (RAISE NOTICE, does not fail the
-- run): trip_messages currently carries 5 separate INSERT policies (driver /
-- linked-supplier / dispatcher / org paths). Unlike the SELECT case, this has
-- NOT been measured — those may be legitimately distinct authorization paths
-- rather than the same leftover-duplicate bug, and consolidating them without
-- a P0.5-style measurement first would repeat the exact mistake this suite
-- exists to prevent (changing something before proving it's the bottleneck).
-- Promote this block to RAISE EXCEPTION once/if that measurement happens.
--
-- Self-contained, read-only (pg_policies is metadata — no fixtures, no
-- rollback needed). Safe to run against any environment, including production.
--
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/chat_rls_single_select_policy.sql
-- Pass: prints "PASS: ..." for SELECT on both tables (INSERT/UPDATE/DELETE always print NOTICE, never fail).
-- Fail: raises an exception naming the table with duplicate SELECT policies.

DO $$
DECLARE
  v_count  integer;
  v_table  text;
  v_cmd    text;
  v_policies text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['trip_messages', 'trip_conversations']
  LOOP
    -- Enforced: SELECT
    SELECT count(*) INTO v_count
    FROM pg_policies
    WHERE tablename = v_table AND cmd = 'SELECT';

    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'One Authorization Truth violated: % has % SELECT policies, expected exactly 1 (see docs/REALTIME_PLATFORM_RULES.md)',
        v_table, v_count;
    END IF;

    RAISE NOTICE 'PASS: % has exactly 1 SELECT policy', v_table;

    -- Reported only: INSERT / UPDATE / DELETE
    FOREACH v_cmd IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE']
    LOOP
      SELECT count(*), coalesce(string_agg(policyname, ' | '), '(none)')
        INTO v_count, v_policies
      FROM pg_policies
      WHERE tablename = v_table AND cmd = v_cmd;

      IF v_count = 1 THEN
        RAISE NOTICE 'OK: % has exactly 1 % policy', v_table, v_cmd;
      ELSE
        RAISE NOTICE 'REVIEW (not enforced): % has % % policies — %', v_table, v_count, v_cmd, v_policies;
      END IF;
    END LOOP;
  END LOOP;
END $$;
