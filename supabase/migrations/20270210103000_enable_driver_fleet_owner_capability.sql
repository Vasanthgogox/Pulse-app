-- Phase 1: Driver Fleet Owner capability (explicit; not inferred from employment).
-- See docs/DRIVER_FLEET_OWNER_PHASE1.md.
-- No personal organization. No vehicles yet (Phase 1b).

CREATE TABLE IF NOT EXISTS public.driver_fleet_owner_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  preferred_view text NOT NULL DEFAULT 'driver'
    CHECK (preferred_view = ANY (ARRAY['driver'::text, 'fleet_owner'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.driver_fleet_owner_profiles IS
  'Explicit Fleet Owner capability for a Driver App user. Separate from employment / organization_members. No org created.';

ALTER TABLE public.driver_fleet_owner_profiles OWNER TO postgres;

DROP TRIGGER IF EXISTS set_driver_fleet_owner_profiles_updated_at
  ON public.driver_fleet_owner_profiles;
CREATE TRIGGER set_driver_fleet_owner_profiles_updated_at
  BEFORE UPDATE ON public.driver_fleet_owner_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.driver_fleet_owner_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can read own fleet owner profile"
  ON public.driver_fleet_owner_profiles;
CREATE POLICY "Drivers can read own fleet owner profile"
  ON public.driver_fleet_owner_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- No INSERT/UPDATE/DELETE for clients — enablement is RPC-only.

GRANT SELECT ON public.driver_fleet_owner_profiles TO authenticated;
GRANT ALL ON public.driver_fleet_owner_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.is_driver_fleet_owner(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.driver_fleet_owner_profiles p
    WHERE p.user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.is_driver_fleet_owner(uuid) IS
  'True when the user has an explicit Driver App Fleet Owner profile.';

GRANT EXECUTE ON FUNCTION public.is_driver_fleet_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enable_driver_fleet_owner()
RETURNS public.driver_fleet_owner_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.driver_fleet_owner_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'driver' THEN
    RAISE EXCEPTION 'Only drivers can become fleet owners';
  END IF;

  INSERT INTO public.driver_fleet_owner_profiles (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO UPDATE
    SET updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.enable_driver_fleet_owner() IS
  'Idempotent: enables Fleet Owner capability for the current driver. Does not create an organization.';

GRANT EXECUTE ON FUNCTION public.enable_driver_fleet_owner() TO authenticated;
