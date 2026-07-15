-- Add idempotency_key to trip_fuel_entries / trip_toll_entries.
-- Mirrors the pattern already proven for trip_workflow_events
-- (20260801180000_trip_workflow_idempotency.sql): the offline outbox
-- (features/trips/operations/offline/outbox.ts) generates a client-side
-- queue item id before any network call; that id is now passed through
-- as the idempotency key so a sync retry/replay cannot create a duplicate
-- fuel/toll entry. UNIQUE index on non-null keys: DB-level deduplication.
-- Client receives error code 23505 on duplicate -> safe to treat as no-op.

ALTER TABLE trip_fuel_entries
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE trip_toll_entries
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS trip_fuel_entries_idempotency_key_unique
  ON trip_fuel_entries (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trip_toll_entries_idempotency_key_unique
  ON trip_toll_entries (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
