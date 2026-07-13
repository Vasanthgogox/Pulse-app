-- =============================================================================
-- Fix: add missing transactions.created_by column (PGRST204)
-- =============================================================================
-- The app writes created_by := auth.uid() when inserting a ledger transaction
-- (features/finance/services/finance.service.ts) and lib/database.types.ts
-- declares transactions.created_by as `string | null`, but the column was
-- never created on this project -- no migration adds it. Result: every
-- AddTransactionModal submit fails with:
--   PGRST204 "Could not find the 'created_by' column of 'transactions'
--   in the schema cache"
--
-- Add the column to match the app + generated types. Nullable to match the
-- code (created_by is only set when an auth user is present) and the declared
-- `string | null` type. FK to auth.users with ON DELETE SET NULL so deleting a
-- user does not delete their transaction history.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index the FK (unindexed FKs were flagged repeatedly by the perf advisor).
CREATE INDEX IF NOT EXISTS idx_transactions_created_by
  ON public.transactions(created_by);

-- Refresh PostgREST's schema cache so the new column is usable immediately
-- without waiting for the periodic reload.
NOTIFY pgrst, 'reload schema';
