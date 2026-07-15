-- Create public.profiles (id = auth.users.id). Used for phone, role, aggregated/asset, and extended profile fields.
-- Sign-up can insert a row here; get_invitee_by_phone and other RPCs can read from profiles when present.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text NULL,
  full_name text NULL,
  role text NOT NULL DEFAULT 'user'::text,
  aggregated boolean NOT NULL DEFAULT true,
  asset boolean NOT NULL DEFAULT true,
  company_name text NULL,
  phone text NULL,
  avatar_url text NULL,
  onboarding_completed boolean NULL DEFAULT false,
  created_at timestamptz NULL DEFAULT now(),
  updated_at timestamptz NULL DEFAULT now(),
  vehicle_registration text NULL,
  license_photo_url text NULL,
  license_expiry date NULL,
  insurance_photo_url text NULL,
  insurance_expiry date NULL,
  vehicle_registration_photo_url text NULL,
  vehicle_registration_expiry date NULL,
  bio text NULL,
  address text NULL,
  license_number text NULL,
  license_type text NULL,
  years_of_experience integer NULL,
  languages text[] NULL DEFAULT '{}'::text[],
  preferred_vehicle_types text[] NULL DEFAULT '{}'::text[],
  preferred_areas text[] NULL DEFAULT '{}'::text[],
  emergency_contact_name text NULL,
  emergency_contact_phone text NULL,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['user'::text, 'driver'::text]))
);

ALTER TABLE public.profiles OWNER TO postgres;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
