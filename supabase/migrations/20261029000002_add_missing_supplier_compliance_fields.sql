-- Migration: Add missing compliance fields to suppliers
-- Brings suppliers to parity with clients (pan_number, cin, msme_number, tan_number, iec_number)

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS pan_number  text,
  ADD COLUMN IF NOT EXISTS cin         text,
  ADD COLUMN IF NOT EXISTS msme_number text,
  ADD COLUMN IF NOT EXISTS tan_number  text,
  ADD COLUMN IF NOT EXISTS iec_number  text;

COMMENT ON COLUMN suppliers.pan_number  IS 'Permanent Account Number — 10-char alphanumeric issued by Income Tax Dept of India';
COMMENT ON COLUMN suppliers.cin         IS 'Company Identification Number — 21-char identifier issued by Ministry of Corporate Affairs';
COMMENT ON COLUMN suppliers.msme_number IS 'MSME/Udyam Registration Number — issued to Micro/Small/Medium Enterprises by Ministry of MSME';
COMMENT ON COLUMN suppliers.tan_number  IS 'Tax Deduction and Collection Account Number — 10-char alphanumeric issued by Income Tax Dept';
COMMENT ON COLUMN suppliers.iec_number  IS 'Importer Exporter Code — 10-digit code issued by DGFT, required for cross-border trade';

-- ──────────────────────────────────────────────
-- Down (undo)
-- ──────────────────────────────────────────────
-- ALTER TABLE suppliers
--   DROP COLUMN IF EXISTS pan_number,
--   DROP COLUMN IF EXISTS cin,
--   DROP COLUMN IF EXISTS msme_number,
--   DROP COLUMN IF EXISTS tan_number,
--   DROP COLUMN IF EXISTS iec_number;
