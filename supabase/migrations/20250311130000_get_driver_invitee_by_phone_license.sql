-- Extend get_driver_invitee_by_phone to return profile fields (email, emergency contact, license_number)
-- so Add Driver modal can auto-fill name and DL number when user enters a matching phone.
-- Same security and phone-normalization logic; adds one row from public.profiles when present.
-- Must DROP first because return type changes (PostgreSQL does not allow CREATE OR REPLACE to change OUT/return type).

DROP FUNCTION IF EXISTS public.get_driver_invitee_by_phone(text);

CREATE FUNCTION public.get_driver_invitee_by_phone(p_phone text)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  phone text,
  email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  license_number text
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
        (SELECT p.license_number FROM public.profiles p WHERE p.id = v_user_id LIMIT 1);
      RETURN;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_driver_invitee_by_phone(text) IS 'Returns user_id, full_name, phone, email, emergency_contact_name, emergency_contact_phone, license_number for a driver with the given phone (normalized). Profile fields from public.profiles when present.';
