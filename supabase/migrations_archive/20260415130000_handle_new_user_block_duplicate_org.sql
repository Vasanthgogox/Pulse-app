-- Enforce unique company name for explicit company names at the database level.
-- This prevents the account from being created if the company name already exists,
-- even if the frontend check is bypassed.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  display_name text;
  op_model text;
  usr_role text;
  org_display_name text;
  provided_company_name text;
BEGIN
  display_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(NEW.email, ''), '@', 1),
    'User'
  );
  
  op_model := coalesce(nullif(trim(NEW.raw_user_meta_data->>'operating_model'), ''), 'HYBRID');
  IF op_model NOT IN ('ASSET_BASED', 'NON_ASSET', 'HYBRID') THEN
    op_model := 'HYBRID';
  END IF;
  
  usr_role := coalesce(nullif(trim(NEW.raw_user_meta_data->>'role'), ''), 'user');
  provided_company_name := nullif(trim(NEW.raw_user_meta_data->>'company_name'), '');

  -- ENFORCE UNIQUENESS: If they explicitly typed a company name, make sure no existing org uses it.
  IF provided_company_name IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE lower(btrim(coalesce(o.name, ''))) = lower(provided_company_name)
    ) THEN
      -- This exception rolls back the entire sign-up process so the user is not created.
      RAISE EXCEPTION 'Company name already exists.';
    END IF;
  END IF;

  org_display_name := coalesce(
    provided_company_name,
    display_name || '''s organization'
  );

  INSERT INTO public.organizations (name, owner_id, operating_model)
  VALUES (org_display_name, NEW.id, op_model)
  RETURNING id INTO org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (org_id, NEW.id, 'owner', 'active');

  IF usr_role = 'driver' THEN
    INSERT INTO public.drivers (organization_id, user_id, name, phone, email, status)
    VALUES (org_id, NEW.id, display_name, nullif(trim(NEW.raw_user_meta_data->>'phone'), ''), NEW.email, 'offline');
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, role, phone, company_name, avatar_url, avatar_seed, bio, aggregated, asset
  ) VALUES (
    NEW.id,
    NEW.email,
    display_name,
    usr_role,
    nullif(trim(NEW.raw_user_meta_data->>'phone'), ''),
    provided_company_name,
    nullif(trim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'avatar_seed'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'status_text'), ''),
    COALESCE((NEW.raw_user_meta_data->>'aggregated')::boolean, true),
    COALESCE((NEW.raw_user_meta_data->>'asset')::boolean, true)
  );

  RETURN NEW;
END;
$$;
