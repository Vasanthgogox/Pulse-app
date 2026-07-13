-- Onboarding intent: onboarding_type metadata replaces skip_org_creation as the long-term flag.
-- Backward compatible: legacy skip_org_creation=true maps to onboarding_type='member'.

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r                  text;
  onboarding_type      text;
  org_id             uuid;
  org_name           text;
  profile_exists     boolean;
  org_exists         boolean;
  membership_exists  boolean;
  display_name       text;
  signup_phone       text;
BEGIN
  r := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''), 'user');

  onboarding_type := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'onboarding_type'), ''),
    CASE
      WHEN COALESCE((NEW.raw_user_meta_data->>'skip_org_creation')::boolean, false) THEN 'member'
      ELSE 'owner'
    END
  );

  display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    'User'
  );

  signup_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');

  INSERT INTO public.users (id, name)
  VALUES (NEW.id, display_name)
  ON CONFLICT (id) DO NOTHING;

  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.id) INTO profile_exists;
  IF NOT profile_exists THEN
    INSERT INTO public.profiles (id, email, full_name, role, aggregated, asset, company_name, phone)
    VALUES (
      NEW.id,
      NEW.email,
      display_name,
      CASE WHEN r IN ('user','driver') THEN r ELSE 'user' END,
      CASE WHEN r = 'driver' THEN false ELSE COALESCE((NEW.raw_user_meta_data->>'aggregated')::boolean, true) END,
      CASE WHEN r = 'driver' THEN false ELSE COALESCE((NEW.raw_user_meta_data->>'asset')::boolean, true) END,
      NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
      signup_phone
    )
    ON CONFLICT (id) DO NOTHING;
    RAISE LOG 'handle_new_user: profile created for user % (role %, onboarding_type %)', NEW.id, r, onboarding_type;
  END IF;

  -- Only owner onboarding provisions a new organization + owner membership.
  IF r = 'user' AND onboarding_type = 'owner' THEN
    SELECT id INTO org_id FROM public.organizations WHERE owner_id = NEW.id LIMIT 1;
    org_exists := (org_id IS NOT NULL);

    IF NOT org_exists THEN
      org_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
        display_name || '''s Organization'
      );
      INSERT INTO public.organizations (
        owner_id, name, operating_model,
        address_line, locality, pincode, city, state, zone,
        business_type, employee_count
      ) VALUES (
        NEW.id,
        org_name,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'operating_model'), ''), 'HYBRID'),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'address_line'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'locality'), ''),
        NULLIF(REGEXP_REPLACE(COALESCE(NEW.raw_user_meta_data->>'pincode', ''), '\D', '', 'g'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'city'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'state'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'zone'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'business_type'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'employee_count'), '')
      )
      RETURNING id INTO org_id;

      IF org_id IS NULL THEN
        RAISE EXCEPTION 'handle_new_user: organizations insert did not return id for user %', NEW.id;
      END IF;
      RAISE LOG 'handle_new_user: organization created % for user %', org_id, NEW.id;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.organization_members
      WHERE organization_id = org_id AND user_id = NEW.id
    ) INTO membership_exists;

    IF NOT membership_exists THEN
      INSERT INTO public.organization_members (organization_id, user_id, role, status)
      VALUES (org_id, NEW.id, 'owner', 'active')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'active', role = 'owner';
      RAISE LOG 'handle_new_user: membership created for user % in org %', NEW.id, org_id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user FAILED for user % (email %): %', NEW.id, NEW.email, SQLERRM;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auth signup trigger: provisions profile; owner onboarding_type creates org + owner membership; member/guest/etc. join via invitation accept.';
