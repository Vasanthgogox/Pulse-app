-- Migration: Rename suppliers.gst_number → suppliers.gstin for consistency with organizations + clients
-- A backward-compatible generated column alias gst_number is added so existing app code
-- continues to work until references are updated to gstin.
-- Remove the alias after all app code is updated.

ALTER TABLE suppliers RENAME COLUMN gst_number TO gstin;

-- Backward-compat alias: generated column reads from gstin
-- Note: stored generated columns cannot be updated directly; this is read-only.
-- App writes should target gstin; this alias only serves reads.
ALTER TABLE suppliers
  ADD COLUMN gst_number text GENERATED ALWAYS AS (gstin) STORED;

COMMENT ON COLUMN suppliers.gst_number IS 'ALIAS — backward-compat read-only alias for gstin. Remove this column after all app code is updated to use gstin.';
COMMENT ON COLUMN suppliers.gstin IS 'GST Identification Number (15-char alphanumeric). Canonical column name, consistent with organizations.gstin and clients.gstin.';

-- ──────────────────────────────────────────────
-- Down (undo)
-- ──────────────────────────────────────────────
-- ALTER TABLE suppliers DROP COLUMN gst_number;
-- ALTER TABLE suppliers RENAME COLUMN gstin TO gst_number;
