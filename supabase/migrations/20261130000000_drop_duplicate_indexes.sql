-- Consolidate 3 VERIFIED duplicate indexes (see docs/DB_PERF_AUDIT.md §DB-1).
--
-- Each dropped index is a plain btree that exactly duplicates a constraint-backed
-- UNIQUE index on the same columns (same order, no partial predicate). The unique
-- index fully serves every query the plain one did, so dropping is lossless.
--
-- NOT touched (flagged by the dup-detector but genuinely distinct — do NOT drop):
--   trip_messages: ASC vs DESC vs partial(is_read=false) — three access patterns
--   trips:  idx_trips_indent_id (full) vs trips_one_per_indent (partial unique)
--   indents: idx_indents_organization_id (full) vs idx_indents_deleted_at (partial)
--
-- Benefit is write-amplification / WAL only; negligible at current row counts,
-- real at production scale. Safe to apply anytime (brief ACCESS EXCLUSIVE lock).

DROP INDEX IF EXISTS public.idx_org_members_org_user;
DROP INDEX IF EXISTS public.idx_trip_conversations_trip_party;
DROP INDEX IF EXISTS public.idx_trip_otps_trip_id;
