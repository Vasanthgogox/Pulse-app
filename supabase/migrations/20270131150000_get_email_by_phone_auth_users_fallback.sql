-- Driver phone signup intentionally clears profiles.email when the auth email is
-- synthetic (d{10digits}@drivers.pulse.app) so it is not shown as a contact email.
-- get_email_by_phone previously required a non-empty profiles.email, so those
-- drivers looked "not registered" on driver sign-in / pre-signup checks.
-- Fall back to auth.users.email (same id as profiles) when profile email is empty.

CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
  v_email text;
BEGIN
  v_normalized := regexp_replace(coalesce(trim(p_phone), ''), '\s+', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\D', '', 'g');
  IF length(v_normalized) >= 12 AND left(v_normalized, 2) = '91' THEN
    v_normalized := right(v_normalized, 10);
  ELSIF length(v_normalized) >= 10 THEN
    v_normalized := right(v_normalized, 10);
  END IF;
  IF v_normalized = '' OR length(v_normalized) < 10 THEN
    RETURN NULL;
  END IF;

  SELECT nullif(trim(coalesce(nullif(trim(pr.email), ''), au.email)), '')
  INTO v_email
  FROM public.profiles pr
  JOIN auth.users au ON au.id = pr.id
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN length(d) >= 12 AND left(d, 2) = '91' THEN right(d, 10)
        WHEN length(d) >= 10 THEN right(d, 10)
        ELSE d
      END AS norm
    FROM (
      SELECT regexp_replace(
        regexp_replace(coalesce(trim(pr.phone), ''), '\s+', '', 'g'),
        '\D',
        '',
        'g'
      ) AS d
    ) x
  ) y
  WHERE pr.phone IS NOT NULL
    AND trim(pr.phone) <> ''
    AND y.norm = v_normalized
    AND nullif(trim(coalesce(nullif(trim(pr.email), ''), au.email)), '') IS NOT NULL
  LIMIT 1;

  RETURN v_email;
END;
$$;

COMMENT ON FUNCTION public.get_email_by_phone(text) IS
  'Returns email for a profile with the given phone (normalized to 10 digits). Prefers profiles.email; falls back to auth.users.email for phone-only drivers. Used for sign-up / driver sign-in existence checks. Anon can call.';

GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO service_role;
