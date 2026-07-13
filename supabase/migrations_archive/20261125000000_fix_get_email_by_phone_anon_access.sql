-- get_email_by_phone is called pre-signup/pre-session (phone existence check
-- before OTP/signup completes). The 20260430173000_security_hardening_phase1
-- migration added an auth.uid() IS NULL guard and revoked anon EXECUTE,
-- which broke this pre-session call path (client always hits "Not authenticated").
-- Revert to the original anon-callable behavior while keeping SECURITY DEFINER
-- and the pinned search_path from the hardening migration.

CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT trim(pr.email) INTO v_email
  FROM public.profiles pr,
       LATERAL (
         SELECT
           CASE
             WHEN length(d) >= 12 AND left(d, 2) = '91' THEN right(d, 10)
             WHEN length(d) >= 10 THEN right(d, 10)
             ELSE d
           END AS norm
         FROM (
           SELECT regexp_replace(regexp_replace(coalesce(trim(pr.phone), ''), '\s+', '', 'g'), '\D', '', 'g') AS d
         ) x
       ) y
  WHERE pr.phone IS NOT NULL
    AND trim(pr.phone) <> ''
    AND trim(coalesce(pr.email, '')) <> ''
    AND y.norm = v_normalized
  LIMIT 1;

  RETURN v_email;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon;
