-- PERF FIX: PERF-2 (duplicate indexes) + PERF-3 + PERF-5 (missing indexes)
-- Note: CONCURRENTLY removed — supabase db push runs inside a transaction.

-- ── Drop duplicate indexes (keep more descriptive name in each pair) ───────
DROP INDEX IF EXISTS idx_driver_locations_trip;
DROP INDEX IF EXISTS idx_tc_org_activity;
DROP INDEX IF EXISTS idx_tm_conv_time;
DROP INDEX IF EXISTS idx_indents_deleted_at;
DROP INDEX IF EXISTS idx_org_members_user_id_plain;
DROP INDEX IF EXISTS idx_netmsg_unread;

-- ── Missing FK indexes (PERF-3) ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trips_assigned_by_user_id
  ON trips(assigned_by_user_id);

CREATE INDEX IF NOT EXISTS idx_indents_created_by_user_id
  ON indents(created_by_user_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'chat_mirror_of_transaction_id') THEN
    CREATE INDEX IF NOT EXISTS idx_transactions_chat_mirror
      ON transactions(chat_mirror_of_transaction_id)
      WHERE chat_mirror_of_transaction_id IS NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='trip_messages' AND column_name='context_trip_id') THEN
    CREATE INDEX IF NOT EXISTS idx_trip_messages_context_trip_id ON trip_messages(context_trip_id) WHERE context_trip_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trip_documents_uploaded_by
  ON trip_documents(uploaded_by)
  WHERE uploaded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_network_messages_sender_user_id
  ON network_messages(sender_user_id);

CREATE INDEX IF NOT EXISTS idx_driver_ledger_created_by
  ON driver_ledger(created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_story_views_viewer_user_id
  ON story_views(viewer_user_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='accounting_books') THEN
    CREATE INDEX IF NOT EXISTS idx_accounting_books_organization_id ON accounting_books(organization_id);
  END IF;
END $$;

-- ── Critical composite indexes for core query patterns (PERF-5) ────────────
CREATE INDEX IF NOT EXISTS idx_trips_org_status_date
  ON trips(organization_id, status, pickup_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_org_date
  ON transactions(organization_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_org_members_user_org_status
  ON organization_members(user_id, organization_id)
  WHERE status = 'active';
