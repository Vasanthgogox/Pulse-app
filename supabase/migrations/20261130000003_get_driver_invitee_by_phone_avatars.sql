-- Extend get_driver_invitee_by_phone with avatar_url / avatar_seed so Create Trip
-- (and other phone lookups) can show platform driver photos without a profiles
-- SELECT (RLS is self-only). Keeps is_in_fleet semantics: active in any fleet
-- that is not the driver's own default org (Add Driver / invite flows).

DROP FUNCTION IF EXISTS public.get_driver_invitee_by_phone(text);

CREATE FUNCTION public.get_driver_invitee_by_phone(p_phone text)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  phone text,
  email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  license_number text,
  avatar_url text,
  avatar_seed text,
  is_in_fleet boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_name text;
  v_phone text;
  v_input_digits text;
  v_input_canon text;
  v_stored_digits text;
  v_stored_canon text;
BEGIN
  v_input_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_input_canon := CASE
    WHEN length(v_input_digits) >= 12 AND left(v_input_digits, 2) = '91' THEN right(v_input_digits, 10)
    WHEN length(v_input_digits) >= 10 THEN right(v_input_digits, 10)
    ELSE v_input_digits
  END;
  IF v_input_canon = '' THEN RETURN; END IF;

  FOR v_user_id, v_name, v_phone IN
    SELECT u.id,
           trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')),
           trim(coalesce(u.raw_user_meta_data->>'phone', ''))
      FROM auth.users u
      WHERE coalesce(u.raw_user_meta_data->>'role', '') = 'driver'
        AND coalesce(u.raw_user_meta_data->>'phone', '') <> ''
  LOOP
    v_stored_digits := regexp_replace(v_phone, '\D', '', 'g');
    v_stored_canon := CASE
      WHEN length(v_stored_digits) >= 12 AND left(v_stored_digits, 2) = '91' THEN right(v_stored_digits, 10)
      WHEN length(v_stored_digits) >= 10 THEN right(v_stored_digits, 10)
      ELSE v_stored_digits
    END;
    IF v_stored_canon = v_input_canon THEN
      RETURN QUERY
      SELECT
        v_user_id,
        (CASE WHEN v_name <> '' THEN v_name ELSE v_phone END),
        v_phone,
        (SELECT p.email FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.emergency_contact_name FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.emergency_contact_phone FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.license_number FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.avatar_url FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        (SELECT p.avatar_seed FROM public.profiles p WHERE p.id = v_user_id LIMIT 1),
        EXISTS (
          SELECT 1
          FROM public.drivers d
          JOIN public.organizations o ON d.organization_id = o.id
          WHERE d.user_id = v_user_id
            AND d.left_at IS NULL
            AND d.tracking_only = false
            AND o.owner_id <> v_user_id
        );
      RETURN;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_driver_invitee_by_phone(text) IS
  'Returns driver profile by normalized phone: profile fields (incl. avatar_url/avatar_seed) plus is_in_fleet (active drivers row with left_at IS NULL, tracking_only false, excluding their own default org).';

GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO service_role;
