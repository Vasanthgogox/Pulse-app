-- Performance indexes identified in Supabase query audit.

-- Phone lookup on drivers (fixes full-table scan in ensureDriverRowByPhone)
CREATE INDEX IF NOT EXISTS idx_drivers_org_phone
  ON drivers (organization_id, phone)
  WHERE phone IS NOT NULL;

-- Unlinked driver variant (speeds up match_driver_by_phone with p_require_unlinked=TRUE)
CREATE INDEX IF NOT EXISTS idx_drivers_org_unlinked_phone
  ON drivers (organization_id, phone)
  WHERE user_id IS NULL AND phone IS NOT NULL;

-- trip_documents presence check (used by trips tab POD indicator query)
CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_id
  ON trip_documents (trip_id);

-- trip_messages ledger event filter (used by acknowledgeLedgerEventMessage)
CREATE INDEX IF NOT EXISTS idx_trip_messages_conv_type
  ON trip_messages (conversation_id, message_type);

-- JSONB path index for transaction_id (apply if ledger message volume is high)
CREATE INDEX IF NOT EXISTS idx_trip_messages_metadata_tx_id
  ON trip_messages ((metadata->>'transaction_id'))
  WHERE message_type = 'ledger_event';
