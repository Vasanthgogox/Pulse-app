-- Company-email-domain signup collision: block a second org for a known company
-- domain and route the signup into a join request the existing org's owner/admin
-- approves from Team → Action needed.

-- ── Free/public email domains excluded from domain matching ─────────────────
-- Signing up with these must always behave like today (own new org) — matching
-- on them would collide unrelated people who happen to share a mail provider.

CREATE TABLE IF NOT EXISTS public.public_email_domains (
  domain text PRIMARY KEY
);

INSERT INTO public.public_email_domains (domain) VALUES
  ('gmail.com'), ('googlemail.com'), ('yahoo.com'), ('yahoo.co.in'),
  ('outlook.com'), ('hotmail.com'), ('live.com'), ('msn.com'),
  ('icloud.com'), ('me.com'), ('aol.com'), ('protonmail.com'), ('proton.me'),
  ('rediffmail.com'), ('zoho.com'), ('gmx.com'), ('yandex.com')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.public_email_domains IS
  'Free/public email domains excluded from the company-domain org-match check.';

-- ── Join requests: one company-domain signup awaiting owner/admin approval ──

CREATE TABLE IF NOT EXISTS public.organization_domain_join_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email             text NOT NULL,
  email_domain      text NOT NULL,
  requester_name    text,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  decided_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_domain_join_req_pending_user
  ON public.organization_domain_join_requests (organization_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_org_domain_join_req_org_status
  ON public.organization_domain_join_requests (organization_id, status);

COMMENT ON TABLE public.organization_domain_join_requests IS
  'Signup collided with an existing org on company email domain; owner/admin approves or declines from Team → Action needed.';

ALTER TABLE public.organization_domain_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_domain_join_req_select ON public.organization_domain_join_requests;
CREATE POLICY org_domain_join_req_select ON public.organization_domain_join_requests
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR user_id = (SELECT auth.uid())
  );

-- Writes only via SECURITY DEFINER RPCs below.

CREATE OR REPLACE FUNCTION public.set_updated_at_org_domain_join_requests()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_domain_join_req_updated_at ON public.organization_domain_join_requests;
CREATE TRIGGER trg_org_domain_join_req_updated_at
  BEFORE UPDATE ON public.organization_domain_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_org_domain_join_requests();

-- ── Signup precheck (anon + authenticated): does this email's company domain
--    already have an org? ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_org_for_email_domain(p_email text)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_domain text;
  v_org    record;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN jsonb_build_object('org_found', false);
  END IF;

  v_domain := split_part(v_email, '@', 2);
  IF v_domain = '' THEN
    RETURN jsonb_build_object('org_found', false);
  END IF;

  IF EXISTS (SELECT 1 FROM public.public_email_domains WHERE domain = v_domain) THEN
    RETURN jsonb_build_object('org_found', false);
  END IF;

  SELECT o.id, o.name
  INTO v_org
  FROM public.organizations o
  JOIN public.profiles p ON p.id = o.owner_id
  WHERE o.deleted_at IS NULL
    AND lower(trim(p.email)) LIKE '%@' || v_domain
  ORDER BY o.created_at ASC
  LIMIT 1;

  IF v_org.id IS NULL THEN
    RETURN jsonb_build_object('org_found', false);
  END IF;

  RETURN jsonb_build_object(
    'org_found', true,
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'email_domain', v_domain
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_org_for_email_domain(text) TO anon, authenticated;

-- ── Create the join request (authenticated, post-account-creation) ─────────

CREATE OR REPLACE FUNCTION public.create_org_domain_join_request(
  p_organization_id uuid
)
  RETURNS public.organization_domain_join_requests
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_domain text;
  v_name   text;
  v_row    public.organization_domain_join_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(trim(p.email)), p.full_name INTO v_email, v_name
  FROM public.profiles p WHERE p.id = v_uid;

  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'No email on profile';
  END IF;
  v_domain := split_part(v_email, '@', 2);

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Already a member of an organization';
  END IF;

  INSERT INTO public.organization_domain_join_requests (
    organization_id, user_id, email, email_domain, requester_name
  ) VALUES (
    p_organization_id, v_uid, v_email, v_domain, v_name
  )
  ON CONFLICT (organization_id, user_id) WHERE status = 'pending'
  DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_org_domain_join_request(uuid) TO authenticated;

-- ── List pending join requests for an org (Team → Action needed) ───────────

CREATE OR REPLACE FUNCTION public.get_org_domain_join_requests(p_org_id uuid)
  RETURNS TABLE(
    id              uuid,
    organization_id uuid,
    user_id         uuid,
    email           text,
    requester_name  text,
    status          text,
    created_at      timestamptz
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    r.id, r.organization_id, r.user_id, r.email, r.requester_name, r.status, r.created_at
  FROM public.organization_domain_join_requests r
  WHERE r.organization_id = p_org_id
    AND r.status = 'pending'
    AND public.is_org_admin(p_org_id)
  ORDER BY r.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_domain_join_requests(uuid) TO authenticated;

-- ── Approve: creates the membership with the deliberate `restricted` floor ─

CREATE OR REPLACE FUNCTION public.approve_org_domain_join_request(p_request_id uuid)
  RETURNS public.organization_members
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.organization_domain_join_requests;
  v_member public.organization_members;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_req
  FROM public.organization_domain_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Join request not found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Join request already %', v_req.status;
  END IF;
  IF NOT public.is_org_admin(v_req.organization_id) THEN
    RAISE EXCEPTION 'Only active org admins can approve join requests';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, status, permissions)
  VALUES (v_req.organization_id, v_req.user_id, 'member', 'active', jsonb_build_object('platformRole', 'restricted'))
  ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'active'
  RETURNING * INTO v_member;

  UPDATE public.organization_domain_join_requests
  SET status = 'approved', decided_by = v_uid, decided_at = now()
  WHERE id = p_request_id;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_org_domain_join_request(uuid) TO authenticated;

-- ── Decline ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decline_org_domain_join_request(p_request_id uuid)
  RETURNS public.organization_domain_join_requests
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.organization_domain_join_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_req
  FROM public.organization_domain_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Join request not found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Join request already %', v_req.status;
  END IF;
  IF NOT public.is_org_admin(v_req.organization_id) THEN
    RAISE EXCEPTION 'Only active org admins can decline join requests';
  END IF;

  UPDATE public.organization_domain_join_requests
  SET status = 'declined', decided_by = v_uid, decided_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_req;

  RETURN v_req;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_org_domain_join_request(uuid) TO authenticated;

-- ── handle_new_user: skip org auto-provisioning when a domain join request
--    is already pending for this user (set by the client right after signup) ─
-- Not modified here: the client calls create_org_domain_join_request AFTER
-- signup with onboarding_type='member' (skips org creation) once check_org_for_email_domain
-- found a match — no trigger change needed.
