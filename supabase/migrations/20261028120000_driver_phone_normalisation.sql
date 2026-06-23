-- Canonical last-10 phone on drivers for roster ↔ auth matching.

-- 1.1 phone_normalised column + partial unique for unlinked roster rows
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS phone_normalised text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_phone_normalised
  ON public.drivers (phone_normalised)
  WHERE phone_normalised IS NOT NULL AND user_id IS NULL AND left_at IS NULL;

-- 1.2 normalise_phone() — last 10 digits (alias-compatible with normalize_phone_last10)
CREATE OR REPLACE FUNCTION public.normalise_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g');
  RETURN right(digits, 10);
END;
$$;

COMMENT ON FUNCTION public.normalise_phone(text) IS
  'Strip non-digits and return last 10 digits for roster/auth phone matching.';

-- Keep legacy name in sync for existing RPCs
CREATE OR REPLACE FUNCTION public.normalize_phone_last10(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.normalise_phone(p_phone);
$$;

-- 1.3 Backfill existing rows
UPDATE public.drivers
SET phone_normalised = public.normalise_phone(phone)
WHERE phone IS NOT NULL
  AND (phone_normalised IS NULL OR phone_normalised <> public.normalise_phone(phone));

-- 1.4 Trigger to keep phone_normalised in sync
CREATE OR REPLACE FUNCTION public.trg_sync_phone_normalised()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone_normalised := public.normalise_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_driver_phone_normalised ON public.drivers;
CREATE TRIGGER sync_driver_phone_normalised
  BEFORE INSERT OR UPDATE OF phone ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_phone_normalised();
