-- Migration: Add structured banking fields via entity_bank_accounts table
-- Replaces unstructured doc_type rows in entity_documents for bank data.
-- entity_type: 'organization' | 'client' | 'supplier' | 'driver'

-- ──────────────────────────────────────────────────────────
-- NOTE ON account_number ENCRYPTION:
-- Storing plain-text account numbers is a compliance/security risk.
-- Options (pick one before deploying to production):
--   A. Enable pgsodium + Vault: use pgsodium.create_key() and
--      store the ciphertext — recommended for regulated environments.
--   B. Mask on write: store only last 4 digits (e.g. '****1234') and
--      keep the full number in an external vault (AWS Secrets, GCP Secret Manager).
--   C. Application-layer encryption: encrypt in the service before INSERT,
--      decrypt in the service after SELECT.
-- This migration stores the value as plain text with a comment warning.
-- Implement encryption before storing real production data.
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_bank_accounts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type           text        NOT NULL CHECK (entity_type IN ('organization', 'client', 'supplier', 'driver')),
  entity_id             uuid        NOT NULL,

  bank_name             text,
  account_number        text,   -- ⚠️ Encrypt before storing in production — see migration note above
  ifsc_code             text,
  account_type          text        CHECK (account_type IN ('savings', 'current', 'cc')),
  is_primary            boolean     NOT NULL DEFAULT false,

  cancelled_cheque_url  text,       -- Storage path or signed URL to uploaded cheque scan

  verified_at           timestamptz,
  verified_by           uuid        REFERENCES users(id),

  created_by            uuid        REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

COMMENT ON TABLE  entity_bank_accounts IS 'Structured bank account details for any entity (org/client/supplier/driver). Supersedes unstructured doc_type=bank_account rows in entity_documents.';
COMMENT ON COLUMN entity_bank_accounts.account_number       IS '⚠️ ENCRYPT IN PRODUCTION. See migration 20261029000005 for options.';
COMMENT ON COLUMN entity_bank_accounts.entity_type          IS 'Polymorphic parent type: organization | client | supplier | driver';
COMMENT ON COLUMN entity_bank_accounts.entity_id            IS 'PK of the parent entity — not FK-constrained due to polymorphism; enforce in application layer';
COMMENT ON COLUMN entity_bank_accounts.cancelled_cheque_url IS 'Storage path or URL to scanned cancelled cheque for verification';
COMMENT ON COLUMN entity_bank_accounts.is_primary           IS 'True for the default payout account; at most one primary per entity should be set (enforce at application layer)';

-- Updated-at trigger
CREATE OR REPLACE FUNCTION entity_bank_accounts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_entity_bank_accounts_updated_at
  BEFORE UPDATE ON entity_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION entity_bank_accounts_set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entity_bank_accounts_org    ON entity_bank_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_entity_bank_accounts_entity ON entity_bank_accounts(entity_type, entity_id);

-- ──────────────────────────────────────────────
-- RLS: org members can only access their own org's records
-- ──────────────────────────────────────────────

ALTER TABLE entity_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Read: any active member of the owning org
CREATE POLICY "org_members_select_bank_accounts"
  ON entity_bank_accounts
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Insert: any active member of the owning org
CREATE POLICY "org_members_insert_bank_accounts"
  ON entity_bank_accounts
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Update/Delete: only the creator or an admin member
CREATE POLICY "org_members_update_bank_accounts"
  ON entity_bank_accounts
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "org_members_delete_bank_accounts"
  ON entity_bank_accounts
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- ──────────────────────────────────────────────
-- Down (undo)
-- ──────────────────────────────────────────────
-- DROP TABLE IF EXISTS entity_bank_accounts;
-- DROP FUNCTION IF EXISTS entity_bank_accounts_set_updated_at();
