-- Migration: Document address field intent on clients and add a notice trigger for legacy `address`
-- No columns dropped or renamed. All changes are additive/documentation-only.

-- ──────────────────────────────────────────────
-- Step 1: Document each field's intent
-- ──────────────────────────────────────────────

COMMENT ON COLUMN clients.address            IS 'DEPRECATED: legacy general-purpose address field. Prefer registered_address (legal) or hq_address (operational). Do not write to this column if either of those is also set.';
COMMENT ON COLUMN clients.hq_address         IS 'Head-office / primary operational address. Use for dispatch, billing fallback, and general correspondence.';
COMMENT ON COLUMN clients.billing_address    IS 'Address printed on invoices. Defaults to hq_address if not set separately.';
COMMENT ON COLUMN clients.registered_address IS 'Legally registered address as per MCA/GST records. Required for KYC and compliance documents.';
COMMENT ON COLUMN clients.corporate_address  IS 'Corporate/administrative office address when different from HQ. Optional.';

-- ──────────────────────────────────────────────
-- Step 2: Notice trigger — warn when legacy `address` is written alongside structured fields
-- Uses RAISE NOTICE (not EXCEPTION) so it does not break existing inserts.
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION clients_warn_legacy_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Fire on INSERT or when address is being changed on UPDATE
  IF (TG_OP = 'INSERT' AND NEW.address IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND NEW.address IS DISTINCT FROM OLD.address AND NEW.address IS NOT NULL) THEN

    IF NEW.hq_address IS NOT NULL OR NEW.registered_address IS NOT NULL THEN
      RAISE NOTICE
        'clients: writing to deprecated "address" column while hq_address or registered_address is also set. Prefer the structured address fields; "address" will be removed in a future migration.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_warn_legacy_address ON clients;
CREATE TRIGGER trg_clients_warn_legacy_address
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION clients_warn_legacy_address();

-- ──────────────────────────────────────────────
-- Down (undo)
-- ──────────────────────────────────────────────
-- DROP TRIGGER trg_clients_warn_legacy_address ON clients;
-- DROP FUNCTION clients_warn_legacy_address();
-- (COMMENTs cannot be reverted without manually setting them back to NULL)
