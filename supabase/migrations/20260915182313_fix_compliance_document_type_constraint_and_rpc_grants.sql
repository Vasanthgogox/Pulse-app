-- Follow-up to 20260915162440_trip_compliance_verification_columns.sql —
-- fixes two defects found during immediate post-apply verification. Does not
-- modify that migration or any SECURITY DEFINER function body.

-- ── 1. Document-type constraint ─────────────────────────────────────────────
--
-- The prior migration assumed the live constraint was named
-- `trip_documents_document_type_check` and tried to `drop constraint if
-- exists` it before adding a new one under that same name. The actual live
-- constraint is named `trip_documents_type_check` — the `drop ... if exists`
-- silently no-op'd (wrong name), so it never went away. Postgres enforces
-- every CHECK constraint on a table simultaneously, so that old, narrower
-- constraint (no `insurance`/`rc`) is still blocking those two values even
-- though the newly-added `trip_documents_document_type_check` already
-- permits them. Confirmed live via pg_constraint immediately before writing
-- this: `trip_documents_document_type_check` already has the complete,
-- correct value list (all 11 original types + insurance + rc) — it needs no
-- changes. Dropping the old, redundant, narrower constraint is the entire
-- fix. This does not touch any row — CHECK constraints only affect
-- INSERT/UPDATE going forward, and dropping a constraint can never fail
-- existing rows in place.
alter table public.trip_documents drop constraint if exists trip_documents_type_check;

-- ── 2. RPC EXECUTE grants ────────────────────────────────────────────────────
--
-- `revoke all ... from public` in the prior migration only strips the grant
-- made to the PUBLIC pseudo-role. It does not touch `anon`'s own separate,
-- already-materialized EXECUTE grant — every new function in this project's
-- `public` schema gets default-privilege grants to anon/authenticated/
-- service_role at CREATE FUNCTION time, independent of anything the
-- migration itself does afterward. Confirmed live: anon currently holds
-- EXECUTE on all four functions.
--
-- Checked the actual live convention against 4 existing RPCs before deciding
-- service_role's fate (not guessed): get_trips_for_org,
-- get_driver_ledger_aggregation, and create_execution_plan_with_graph all
-- still grant anon EXECUTE too (this project doesn't uniformly lock anon
-- down) — but every single one of them, including award_indent_to_trip (the
-- one sampled RPC that *has* had anon revoked), retains service_role
-- EXECUTE without exception. service_role also already bypasses RLS
-- entirely, so restricting it at the RPC layer would add no real protection
-- and would make these four functions the only ones in the schema behaving
-- differently. So: revoke anon only, leave authenticated and service_role
-- untouched. Function bodies and has_member_surface's authorization logic
-- are not modified by this migration.
revoke execute on function public.has_member_surface(uuid, text) from anon;
revoke execute on function public.verify_trip_document(uuid, text, text) from anon;
revoke execute on function public.mark_trip_compliance_verified(uuid) from anon;
revoke execute on function public.record_trip_hard_copy_pod(uuid, text, text, text) from anon;
