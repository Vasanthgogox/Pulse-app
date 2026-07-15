-- Fix drivers where user_id is set but tracking_only is still true.
-- tracking_only = true means "no app access, phone-only tracking" — contradicts having a user_id.
-- Backfill: 28 rows affected at time of writing.
UPDATE drivers
SET tracking_only = false,
    updated_at   = NOW()
WHERE user_id IS NOT NULL
  AND tracking_only = true;

-- Trigger: whenever user_id is set (INSERT or UPDATE), auto-clear tracking_only.
-- This is the permanent guard so the inconsistency can never reoccur.
CREATE OR REPLACE FUNCTION clear_tracking_only_on_user_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.tracking_only = true THEN
    NEW.tracking_only := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_tracking_only_on_user_link ON drivers;
CREATE TRIGGER trg_clear_tracking_only_on_user_link
  BEFORE INSERT OR UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION clear_tracking_only_on_user_link();
