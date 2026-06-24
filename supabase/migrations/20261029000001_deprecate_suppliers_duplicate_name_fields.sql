-- Migration: Deprecate suppliers.company_name and suppliers.contact
-- Canonical fields: name (display name), contact_person + phone (contact details)

-- ──────────────────────────────────────────────
-- Step 1: Backfill name from company_name where name IS NULL
-- ──────────────────────────────────────────────

UPDATE suppliers
SET name = company_name
WHERE name IS NULL AND company_name IS NOT NULL;

-- ──────────────────────────────────────────────
-- Step 2: Mark deprecated
-- ──────────────────────────────────────────────

COMMENT ON COLUMN suppliers.company_name IS 'DEPRECATED: use suppliers.name';
COMMENT ON COLUMN suppliers.contact      IS 'DEPRECATED: use suppliers.contact_person + suppliers.phone';

-- ──────────────────────────────────────────────
-- Step 3: Trigger to block new writes
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION suppliers_block_deprecated_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- On INSERT, block if company_name or contact are being set
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_name IS NOT NULL OR NEW.contact IS NOT NULL THEN
      RAISE EXCEPTION
        'suppliers: writing to deprecated columns company_name or contact is blocked. Use suppliers.name and suppliers.contact_person + suppliers.phone instead.';
    END IF;
  END IF;

  -- On UPDATE, block only if the value is actually changing
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_name IS DISTINCT FROM OLD.company_name OR
       NEW.contact IS DISTINCT FROM OLD.contact THEN
      RAISE EXCEPTION
        'suppliers: writing to deprecated columns company_name or contact is blocked. Use suppliers.name and suppliers.contact_person + suppliers.phone instead.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppliers_block_deprecated_fields ON suppliers;
CREATE TRIGGER trg_suppliers_block_deprecated_fields
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION suppliers_block_deprecated_fields();

-- ──────────────────────────────────────────────
-- Down (undo)
-- ──────────────────────────────────────────────
-- DROP TRIGGER trg_suppliers_block_deprecated_fields ON suppliers;
-- DROP FUNCTION suppliers_block_deprecated_fields();
-- COMMENT ON COLUMN suppliers.company_name IS NULL;
-- COMMENT ON COLUMN suppliers.contact IS NULL;
