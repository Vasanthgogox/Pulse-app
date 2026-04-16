-- Add avatar_seed to profiles and update handle_new_user to sync status_text (as bio) and avatar_seed.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_seed text;

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

  INSERT INTO public.organizations (name, owner_id, operating_model)
  VALUES (display_name || '''s organization', NEW.id, op_model)
  RETURNING id INTO org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (org_id, NEW.id, 'owner', 'active');

  IF usr_role = 'driver' THEN
    INSERT INTO public.drivers (organization_id, user_id, name, phone, email, status)
    VALUES (org_id, NEW.id, display_name, nullif(trim(NEW.raw_user_meta_data->>'phone'), ''), NEW.email, 'offline');
  END IF;

  -- Sync to public.profiles so profile table is populated on sign-up
  INSERT INTO public.profiles (
    id, email, full_name, role, phone, company_name, avatar_url, avatar_seed, bio, aggregated, asset
  ) VALUES (
    NEW.id,
    NEW.email,
    display_name,
    usr_role,
    nullif(trim(NEW.raw_user_meta_data->>'phone'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'company_name'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'avatar_seed'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'status_text'), ''),
    COALESCE((NEW.raw_user_meta_data->>'aggregated')::boolean, true),
    COALESCE((NEW.raw_user_meta_data->>'asset')::boolean, true)
  );

  RETURN NEW;
END;
$$;
