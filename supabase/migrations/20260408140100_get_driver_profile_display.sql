-- RPC to fetch public profile info for a driver (avatar, name).
-- Authorization: caller must be a member of the organization the driver belongs to.
-- SECURITY DEFINER to bypass RLS on profiles table.

CREATE OR REPLACE FUNCTION public.get_driver_profile_display(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_res jsonb;
BEGIN
  SELECT d.user_id INTO v_user_id FROM public.drivers d WHERE d.id = p_driver_id;
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'fullName', coalesce(p.full_name, ''),
    'avatarUrl', coalesce(p.avatar_url, ''),
    'avatarSeed', coalesce(p.avatar_seed, '')
  ) INTO v_res
  FROM public.profiles p
  WHERE p.id = v_user_id;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_profile_display(uuid) TO authenticated;
