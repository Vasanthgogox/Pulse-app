-- Fast lookup: get email by phone for sign-up "already registered" check.
-- Same normalization as get_invitee_by_phone. Single SELECT (no loop) for speed. Callable by anon.

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
  -- Normalize input: digits only, last 10 for Indian mobile (matches get_invitee_by_phone)
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

  SELECT trim(pr.email) INTO v_email
  FROM public.profiles pr,
       LATERAL (
         SELECT
           CASE
             WHEN length(d) >= 12 AND left(d, 2) = '91' THEN right(d, 10)
             WHEN length(d) >= 10 THEN right(d, 10)
             ELSE d
           END AS norm
         FROM (SELECT regexp_replace(regexp_replace(coalesce(trim(pr.phone), ''), '\s+', '', 'g'), '\D', '', 'g') AS d) x
       ) y
  WHERE pr.phone IS NOT NULL
    AND trim(pr.phone) <> ''
    AND trim(coalesce(pr.email, '')) <> ''
    AND y.norm = v_normalized
  LIMIT 1;

  RETURN v_email;
END;
$$;

COMMENT ON FUNCTION public.get_email_by_phone(text) IS 'Returns email for a profile with the given phone (normalized to 10 digits). Used for sign-up inline "already registered" check. Anon can call.';

GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO service_role;
