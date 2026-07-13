-- Supabase Cloud: CREATE INDEX / COMMENT on storage.objects fails with
-- SQLSTATE 42501 ("must be owner of table objects") — the storage schema is
-- owned by the platform storage admin, not the role used by `supabase db push`.
-- Do not add DDL against storage.objects here; rely on platform defaults or
-- Supabase support for storage-level tuning.
SELECT 1;
