-- Fix: "permission denied for table organization_counters" when creating trips/indents.
-- The triggers set_trip_number and set_indent_number touch organization_counters;
-- they run as the invoking user (authenticated), who has no GRANT on that table.
-- Make both functions SECURITY DEFINER so they run with definer (migration runner) privileges.

CREATE OR REPLACE FUNCTION public.set_indent_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.indent_number IS NULL OR NEW.indent_number = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    UPDATE public.organization_counters
    SET indent_seq = indent_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING indent_seq INTO seq;
    NEW.indent_number := 'IND-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_trip_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.trip_number IS NULL OR NEW.trip_number = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    UPDATE public.organization_counters
    SET trip_seq = trip_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING trip_seq INTO seq;
    NEW.trip_number := 'TRP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
