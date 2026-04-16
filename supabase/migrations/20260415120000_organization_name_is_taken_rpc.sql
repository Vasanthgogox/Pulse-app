-- Sign-up: block creating a new org when the chosen company name matches an existing organizations.name (case-insensitive, trimmed).
-- Callable by anon (same pattern as get_email_by_phone).

CREATE OR REPLACE FUNCTION public.organization_name_is_taken(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  v_key := lower(btrim(coalesce(p_name, '')));
  IF v_key = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE lower(btrim(coalesce(o.name, ''))) = v_key
    LIMIT 1
  );
END;
$$;

COMMENT ON FUNCTION public.organization_name_is_taken(text) IS 'True if organizations.name already equals the trimmed name (case-insensitive). Used before auth sign-up. Anon can call.';

GRANT EXECUTE ON FUNCTION public.organization_name_is_taken(text) TO anon;
GRANT EXECUTE ON FUNCTION public.organization_name_is_taken(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organization_name_is_taken(text) TO service_role;
