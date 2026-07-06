-- Team invites for employees without a Pulse account yet.
-- Admin stores name + phone; membership is claimed automatically on signup.

-- ── Phone normalization (10-digit India canon) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.normalize_phone_canon(p_phone text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(d) >= 12 AND left(d, 2) = '91' THEN right(d, 10)
    WHEN length(d) >= 10 THEN right(d, 10)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS d) s
  WHERE coalesce(p_phone, '') <> '';
$$;

COMMENT ON FUNCTION public.normalize_phone_canon(text) IS
  'Normalize phone to 10-digit canon for Indian mobile matching.';

-- ── Pending phone invites ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_team_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_name        text NOT NULL,
  invitee_phone       text NOT NULL,
  invitee_phone_canon text NOT NULL,
  invitee_email       text,
  role                text NOT NULL,
  permissions         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  accepted_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_team_invites_pending_phone
  ON public.organization_team_invites (organization_id, invitee_phone_canon)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_org_team_invites_org_status
  ON public.organization_team_invites (organization_id, status);

COMMENT ON TABLE public.organization_team_invites IS
  'Pre-account team invites by phone. Claimed on signup when phone matches.';

ALTER TABLE public.organization_team_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_team_invites_select ON public.organization_team_invites;
CREATE POLICY org_team_invites_select ON public.organization_team_invites
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR invited_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS org_team_invites_insert ON public.organization_team_invites;
CREATE POLICY org_team_invites_insert ON public.organization_team_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_team_invites.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS org_team_invites_update ON public.organization_team_invites;
CREATE POLICY org_team_invites_update ON public.organization_team_invites
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_team_invites.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.organization_team_invites TO authenticated;

-- Realtime roster updates for admins
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_team_invites;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Claim pending invites on signup ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_pending_team_invites(
  p_user_id uuid,
  p_phone   text
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_canon text;
  v_inv   public.organization_team_invites%ROWTYPE;
  v_count integer := 0;
BEGIN
  v_canon := public.normalize_phone_canon(p_phone);
  IF v_canon IS NULL OR length(v_canon) < 10 THEN
    RETURN 0;
  END IF;

  FOR v_inv IN
    SELECT *
    FROM public.organization_team_invites
    WHERE invitee_phone_canon = v_canon
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at ASC
  LOOP
    INSERT INTO public.organization_members (
      organization_id, user_id, role, status, permissions, joined_at
    ) VALUES (
      v_inv.organization_id,
      p_user_id,
      v_inv.role,
      'active',
      v_inv.permissions,
      now()
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE
      SET
        role        = EXCLUDED.role,
        permissions = EXCLUDED.permissions,
        status      = 'active',
        joined_at   = now();

    UPDATE public.organization_team_invites
    SET
      status           = 'accepted',
      accepted_user_id = p_user_id,
      updated_at       = now()
    WHERE id = v_inv.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_pending_team_invites(uuid, text) TO authenticated, service_role;

-- ── RPC: create pending invite (no Pulse account required) ───────────────────

CREATE OR REPLACE FUNCTION public.create_team_invite_pending(
  p_org_id    uuid,
  p_phone     text,
  p_name      text,
  p_email     text DEFAULT NULL,
  p_role      text DEFAULT 'member',
  p_permissions jsonb DEFAULT '{}'::jsonb
)
  RETURNS public.organization_team_invites
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_canon text;
  v_row   public.organization_team_invites;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = v_uid
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active org admins can invite team members';
  END IF;

  v_canon := public.normalize_phone_canon(p_phone);
  IF v_canon IS NULL OR length(v_canon) < 10 THEN
    RAISE EXCEPTION 'Enter a valid 10-digit mobile number';
  END IF;

  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Employee name is required';
  END IF;

  -- Existing Pulse user → caller should use direct membership invite instead
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE public.normalize_phone_canon(p.phone) = v_canon
  ) THEN
    RAISE EXCEPTION 'This phone already has a Pulse account — use the existing-user invite path';
  END IF;

  INSERT INTO public.organization_team_invites (
    organization_id,
    invited_by,
    invitee_name,
    invitee_phone,
    invitee_phone_canon,
    invitee_email,
    role,
    permissions
  ) VALUES (
    p_org_id,
    v_uid,
    trim(p_name),
    trim(p_phone),
    v_canon,
    nullif(trim(coalesce(p_email, '')), ''),
    coalesce(nullif(trim(p_role), ''), 'member'),
    coalesce(p_permissions, '{}'::jsonb)
  )
  ON CONFLICT (organization_id, invitee_phone_canon)
    WHERE status = 'pending'
  DO UPDATE SET
    invitee_name  = EXCLUDED.invitee_name,
    invitee_email = EXCLUDED.invitee_email,
    role          = EXCLUDED.role,
    permissions   = EXCLUDED.permissions,
    invited_by    = EXCLUDED.invited_by,
    updated_at    = now(),
    expires_at    = now() + interval '90 days'
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_invite_pending(uuid, text, text, text, text, jsonb)
  TO authenticated;

-- ── RPC: list pending phone invites for org roster ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_org_team_pending_invites(p_org_id uuid)
  RETURNS TABLE(
    id                  uuid,
    organization_id     uuid,
    invitee_name        text,
    invitee_phone       text,
    invitee_email       text,
    role                text,
    permissions         jsonb,
    status              text,
    created_at          timestamptz,
    expires_at          timestamptz
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    ti.id,
    ti.organization_id,
    ti.invitee_name,
    ti.invitee_phone,
    ti.invitee_email,
    ti.role,
    ti.permissions,
    ti.status,
    ti.created_at,
    ti.expires_at
  FROM public.organization_team_invites ti
  WHERE ti.organization_id = p_org_id
    AND ti.status = 'pending'
    AND ti.expires_at > now()
    AND public.is_org_member(p_org_id)
  ORDER BY ti.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_team_pending_invites(uuid) TO authenticated;

-- ── RPC: cancel pending phone invite ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_team_invite_pending(p_invite_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_team_invites ti
  SET status = 'cancelled', updated_at = now()
  WHERE ti.id = p_invite_id
    AND ti.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = ti.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_team_invite_pending(uuid) TO authenticated;

-- ── RPC: phone profile lookup for team invite ────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_profile_by_phone(p_phone text)
  RETURNS TABLE(
    user_id    uuid,
    full_name  text,
    phone      text,
    email      text,
    avatar_url text,
    role       text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.phone,
    p.email,
    p.avatar_url,
    p.role
  FROM public.profiles p
  WHERE public.normalize_phone_canon(p.phone) = public.normalize_phone_canon(p_phone)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_profile_by_phone(text) TO authenticated;

-- ── RPC: invitee inbox + accept/reject (existing app contracts) ──────────────

CREATE OR REPLACE FUNCTION public.get_my_team_invites()
  RETURNS TABLE(
    id               uuid,
    organization_id  uuid,
    role             text,
    joined_at        timestamptz,
    org_name         text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    om.id,
    om.organization_id,
    om.role,
    om.joined_at,
    coalesce(o.name, 'Organization')
  FROM public.organization_members om
  LEFT JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = (SELECT auth.uid())
    AND om.status = 'invited'
  ORDER BY om.joined_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_team_invites() TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_org_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_members
  SET status = 'active'
  WHERE organization_id = p_org_id
    AND user_id = (SELECT auth.uid())
    AND status = 'invited';
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_team_invite(p_org_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_members
  SET status = 'inactive'
  WHERE organization_id = p_org_id
    AND user_id = (SELECT auth.uid())
    AND status = 'invited';
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_team_invite(uuid) TO authenticated;

-- ── Signup hook: skip new org when phone invite exists; claim invites ────────

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
  signup_phone       text;
  phone_canon        text;
  claimed            integer;
BEGIN
  display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    'User'
  );

  signup_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  phone_canon  := public.normalize_phone_canon(signup_phone);

  IF phone_canon IS NOT NULL AND length(phone_canon) >= 10 THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_team_invites ti
      WHERE ti.invitee_phone_canon = phone_canon
        AND ti.status = 'pending'
        AND ti.expires_at > now()
    ) THEN
      skip_org := true;
    END IF;
  END IF;

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
    RAISE LOG 'handle_new_user: profile created for user % (role %)', NEW.id, r;
  END IF;

  IF signup_phone IS NOT NULL THEN
    claimed := public.claim_pending_team_invites(NEW.id, signup_phone);
    IF claimed > 0 THEN
      RAISE LOG 'handle_new_user: claimed % team invite(s) for user %', claimed, NEW.id;
      RETURN NEW;
    END IF;
  END IF;

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
