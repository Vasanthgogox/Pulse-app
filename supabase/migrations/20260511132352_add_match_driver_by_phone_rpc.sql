-- match_driver_by_phone: find a driver row in a given org by phone number.
-- Used by ensureDriverRowByPhone (trackingOnly flow) to locate or create a driver for assignment.
-- SECURITY DEFINER so it can read drivers across RLS for phone-based cross-org lookups.

CREATE OR REPLACE FUNCTION public.match_driver_by_phone(
  p_org_id uuid,
  p_phone text,
  p_require_unlinked boolean DEFAULT false
)
RETURNS SETOF public.drivers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT regexp_replace(p_phone, '\s+', '', 'g') AS phone_clean
  ),
  last10 AS (
    SELECT right(regexp_replace(phone_clean, '[^0-9]', '', 'g'), 10) AS suffix
    FROM normalized
  )
  SELECT d.*
  FROM public.drivers d, normalized n, last10 l
  WHERE d.organization_id = p_org_id
    AND (
      -- exact match
      regexp_replace(d.phone, '\s+', '', 'g') = n.phone_clean
      OR
      -- last-10-digit suffix match
      right(regexp_replace(d.phone, '[^0-9]', '', 'g'), 10) = l.suffix
    )
    AND (NOT p_require_unlinked OR d.user_id IS NULL)
  ORDER BY
    -- prefer exact match first
    (regexp_replace(d.phone, '\s+', '', 'g') = n.phone_clean) DESC,
    d.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.match_driver_by_phone(uuid, text, boolean) TO authenticated;
