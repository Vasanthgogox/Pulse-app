-- Fix: indent_number must be per-org (unique constraint is organization_id + indent_number).
-- The 20260420120000 migration switched to per-user user_counters, causing duplicate key
-- violations when multiple users in the same org create indents.
-- Revert set_indent_number() to use organization_counters (per-org sequence).

CREATE OR REPLACE FUNCTION public.set_indent_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.indent_number IS NULL OR trim(NEW.indent_number) = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;

    UPDATE public.organization_counters
    SET indent_seq = indent_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING indent_seq INTO seq;

    NEW.indent_number := 'IND' || lpad(seq::text, 3, '0');

    IF public.column_exists('public', 'indents', 'display_indent_id') THEN
      NEW.display_indent_id := NEW.indent_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Sync organization_counters.indent_seq to the current max so next insert
-- doesn't collide with existing rows.
INSERT INTO public.organization_counters (organization_id, indent_seq)
SELECT
  organization_id,
  coalesce(
    max(
      CASE
        WHEN indent_number ~ '^IND[0-9]+$'
        THEN substring(indent_number FROM 4)::bigint
        ELSE 0
      END
    ), 0
  ) AS indent_seq
FROM public.indents
GROUP BY organization_id
ON CONFLICT (organization_id) DO UPDATE
  SET indent_seq = greatest(organization_counters.indent_seq, EXCLUDED.indent_seq);
