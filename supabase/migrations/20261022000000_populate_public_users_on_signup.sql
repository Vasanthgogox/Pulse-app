-- =============================================================
-- Fix: populate public.users at signup, not lazily inside RPCs
--
-- Problem: public.users was an empty FK anchor table, populated
-- lazily by INSERT ... ON CONFLICT DO NOTHING inside
-- create_trip_from_assigned_indent, create_trip_from_direct_quote,
-- and app-side upserts in trips.service.ts / indents.service.ts.
-- Any user who signed up but never created a trip had no row here.
--
-- Fix:
--   1. Backfill all existing users from public.profiles.
--   2. Update handle_new_user (runs on auth.users INSERT) to always
--      insert into public.users so new signups are covered immediately
--      regardless of auth path (email, Google OAuth, etc).
--
-- Follow-up (separate PR):
--   Remove the lazy upsert blocks from create_trip_from_assigned_indent,
--   create_trip_from_direct_quote, trips.service.ts, indents.service.ts.
--   Keep them for now as idempotent safety nets.
-- =============================================================

-- 1. Backfill: all users who exist in profiles but not in public.users
INSERT INTO public.users (id, name)
SELECT
  p.id,
  COALESCE(
    NULLIF(TRIM(p.full_name), ''),
    NULLIF(SPLIT_PART(p.email, '@', 1), ''),
    'User'
  )
FROM public.profiles p
ON CONFLICT (id) DO NOTHING;

-- 2. Update handle_new_user to also write to public.users
--    (keeps the existing profiles + org + membership logic intact)
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r                  text    := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''), 'user');
  skip_org           boolean := COALESCE((NEW.raw_user_meta_data->>'skip_org_creation')::boolean, false);
  org_id             uuid;
  org_name           text;
  profile_exists     boolean;
  org_exists         boolean;
  membership_exists  boolean;
  display_name       text;
BEGIN
  -- Resolve the best display name from metadata
  display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    'User'
  );

  -- ── public.users (FK anchor for trips / indents / loads) ──
  -- Populate immediately so no downstream RPC needs a lazy upsert guard.
  INSERT INTO public.users (id, name)
  VALUES (NEW.id, display_name)
  ON CONFLICT (id) DO NOTHING;

  -- ── public.profiles ──
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
      NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '')
    )
    ON CONFLICT (id) DO NOTHING;
    RAISE LOG 'handle_new_user: profile created for user % (role %)', NEW.id, r;
  END IF;

  -- ── public.organizations + organization_members (dispatcher only) ──
  IF r = 'user' AND NOT skip_org THEN
    SELECT id INTO org_id FROM public.organizations WHERE owner_id = NEW.id LIMIT 1;
    org_exists := (org_id IS NOT NULL);

    IF NOT org_exists THEN
      org_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
        display_name || '''s Organization'
      );
      INSERT INTO public.organizations (
        owner_id, name, operating_model,
        address_line, city, state, zone,
        business_type, employee_count
      ) VALUES (
        NEW.id,
        org_name,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'operating_model'), ''), 'HYBRID'),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'address_line'), ''),
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
