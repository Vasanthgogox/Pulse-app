-- Phase 1.1 hardening:
-- - tighten policy roles from public -> authenticated on high-risk tables
-- - add lightweight DB-side RPC rate limiting primitives
-- - harden get_invitee_by_phone with auth + membership + rate limit checks

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Policy role hardening (prevent future "TO public" footguns)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  p RECORD;
  cmd_clause text;
  using_clause text;
  check_clause text;
BEGIN
  FOR p IN
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('bids', 'transactions', 'trips', 'drivers', 'clients', 'suppliers')
      AND roles::text = '{public}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);

    cmd_clause := CASE
      WHEN p.cmd = 'ALL' THEN 'FOR ALL'
      ELSE format('FOR %s', p.cmd)
    END;

    using_clause := CASE
      WHEN p.qual IS NULL OR btrim(p.qual) = '' THEN ''
      ELSE format(' USING (%s)', p.qual)
    END;

    check_clause := CASE
      WHEN p.with_check IS NULL OR btrim(p.with_check) = '' THEN ''
      ELSE format(' WITH CHECK (%s)', p.with_check)
    END;

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s %s TO authenticated%s%s',
      p.policyname,
      p.schemaname,
      p.tablename,
      p.permissive,
      cmd_clause,
      using_clause,
      check_clause
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) Lightweight DB-side rate limiting for sensitive RPCs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rpc_rate_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpc_rate_limits_scope_user_created
  ON public.rpc_rate_limits (scope, user_id, created_at DESC);

ALTER TABLE public.rpc_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rpc_rate_limits_service_only" ON public.rpc_rate_limits;
CREATE POLICY "rpc_rate_limits_service_only"
  ON public.rpc_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enforce_rpc_rate_limit(
  p_scope text,
  p_max_requests integer,
  p_window interval
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_count integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF coalesce(p_scope, '') = '' THEN
    RAISE EXCEPTION 'Rate limit scope required';
  END IF;

  IF coalesce(p_max_requests, 0) <= 0 THEN
    RAISE EXCEPTION 'Invalid rate limit max requests';
  END IF;

  IF p_window IS NULL OR p_window <= interval '0 seconds' THEN
    RAISE EXCEPTION 'Invalid rate limit window';
  END IF;

  SELECT count(*)::integer
    INTO v_count
  FROM public.rpc_rate_limits
  WHERE scope = p_scope
    AND user_id = v_uid
    AND created_at > now() - p_window;

  IF v_count >= p_max_requests THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  INSERT INTO public.rpc_rate_limits (user_id, scope)
  VALUES (v_uid, p_scope);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enforce_rpc_rate_limit(text, integer, interval)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) get_invitee_by_phone hardening (same signature, stricter internals)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_invitee_by_phone(p_phone text)
RETURNS TABLE(
  organization_id uuid,
  full_name text,
  phone text,
  organization_name text,
  profile_company_name text,
  profile_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid;
  v_caller_has_active_org boolean;
  v_user_id uuid;
  v_org_id uuid;
  v_name text;
  v_phone text;
  v_normalized text;
  v_stored_normalized text;
  v_meta jsonb;
  v_phone_elem text;
  v_org_name text;
  v_profile_company text;
  v_profile_role text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = v_uid
      AND om.status = 'active'
  )
  INTO v_caller_has_active_org;

  IF NOT v_caller_has_active_org THEN
    RAISE EXCEPTION 'No active organization membership';
  END IF;

  PERFORM public.enforce_rpc_rate_limit('get_invitee_by_phone', 10, interval '1 minute');

  v_normalized := regexp_replace(coalesce(trim(p_phone), ''), '\s+', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\D', '', 'g');
  IF length(v_normalized) >= 12 AND left(v_normalized, 2) = '91' THEN
    v_normalized := right(v_normalized, 10);
  ELSIF length(v_normalized) >= 10 THEN
    v_normalized := right(v_normalized, 10);
  END IF;
  IF v_normalized = '' THEN
    RETURN;
  END IF;

  FOR v_user_id, v_name, v_phone, v_profile_role IN
    SELECT
      pr.id,
      trim(coalesce(pr.full_name, '')),
      trim(coalesce(pr.phone, '')),
      lower(trim(coalesce(pr.role, '')))
    FROM public.profiles pr
    WHERE pr.phone IS NOT NULL AND trim(pr.phone) <> ''
  LOOP
    v_stored_normalized := regexp_replace(regexp_replace(v_phone, '\s+', '', 'g'), '\D', '', 'g');
    IF length(v_stored_normalized) >= 12 AND left(v_stored_normalized, 2) = '91' THEN
      v_stored_normalized := right(v_stored_normalized, 10);
    ELSIF length(v_stored_normalized) >= 10 THEN
      v_stored_normalized := right(v_stored_normalized, 10);
    END IF;
    IF v_stored_normalized = v_normalized THEN
      v_org_id := NULL;
      SELECT om.organization_id INTO v_org_id
      FROM public.organization_members om
      WHERE om.user_id = v_user_id AND om.status = 'active'
      LIMIT 1;
      IF v_org_id IS NULL THEN
        SELECT o.id INTO v_org_id
        FROM public.organizations o
        WHERE o.owner_id = v_user_id
        LIMIT 1;
      END IF;
      IF v_org_id IS NOT NULL THEN
        SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
        SELECT trim(coalesce(pr.company_name, '')) INTO v_profile_company FROM public.profiles pr WHERE pr.id = v_user_id LIMIT 1;
        organization_id := v_org_id;
        full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone END;
        phone := v_phone;
        organization_name := coalesce(v_org_name, '');
        profile_company_name := nullif(v_profile_company, '');
        profile_role := coalesce(nullif(v_profile_role, ''), '');
        RETURN NEXT;
      END IF;
      RETURN;
    END IF;
  END LOOP;

  FOR v_user_id, v_meta IN
    SELECT u.id, u.raw_user_meta_data
    FROM auth.users u
    WHERE u.raw_user_meta_data IS NOT NULL
  LOOP
    v_name := trim(coalesce(v_meta->>'full_name', v_meta->>'name', ''));
    v_phone := trim(coalesce(v_meta->>'phone', ''));

    v_stored_normalized := regexp_replace(regexp_replace(v_phone, '\s+', '', 'g'), '\D', '', 'g');
    IF length(v_stored_normalized) >= 10 THEN v_stored_normalized := right(v_stored_normalized, 10); END IF;
    IF v_stored_normalized = v_normalized THEN
      v_org_id := NULL;
      SELECT om.organization_id INTO v_org_id
      FROM public.organization_members om
      WHERE om.user_id = v_user_id AND om.status = 'active'
      LIMIT 1;
      IF v_org_id IS NULL THEN
        SELECT o.id INTO v_org_id
        FROM public.organizations o
        WHERE o.owner_id = v_user_id
        LIMIT 1;
      END IF;
      IF v_org_id IS NOT NULL THEN
        SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
        SELECT
          trim(coalesce(pr.company_name, '')),
          lower(trim(coalesce(pr.role, '')))
        INTO v_profile_company, v_profile_role
        FROM public.profiles pr
        WHERE pr.id = v_user_id
        LIMIT 1;
        organization_id := v_org_id;
        full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone END;
        phone := v_phone;
        organization_name := coalesce(v_org_name, '');
        profile_company_name := nullif(v_profile_company, '');
        profile_role := coalesce(nullif(v_profile_role, ''), '');
        RETURN NEXT;
      END IF;
      RETURN;
    END IF;

    IF jsonb_typeof(v_meta->'phone_numbers') = 'array' THEN
      FOR v_phone_elem IN SELECT jsonb_array_elements_text(v_meta->'phone_numbers')
      LOOP
        v_stored_normalized := regexp_replace(regexp_replace(trim(v_phone_elem), '\s+', '', 'g'), '\D', '', 'g');
        IF length(v_stored_normalized) >= 10 THEN v_stored_normalized := right(v_stored_normalized, 10); END IF;
        IF v_stored_normalized = v_normalized THEN
          v_org_id := NULL;
          SELECT om.organization_id INTO v_org_id
          FROM public.organization_members om
          WHERE om.user_id = v_user_id AND om.status = 'active'
          LIMIT 1;
          IF v_org_id IS NULL THEN
            SELECT o.id INTO v_org_id
            FROM public.organizations o
            WHERE o.owner_id = v_user_id
            LIMIT 1;
          END IF;
          IF v_org_id IS NOT NULL THEN
            SELECT trim(coalesce(o.name, '')) INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
            SELECT
              trim(coalesce(pr.company_name, '')),
              lower(trim(coalesce(pr.role, '')))
            INTO v_profile_company, v_profile_role
            FROM public.profiles pr
            WHERE pr.id = v_user_id
            LIMIT 1;
            organization_id := v_org_id;
            full_name := CASE WHEN v_name <> '' THEN v_name ELSE v_phone_elem END;
            phone := v_phone_elem;
            organization_name := coalesce(v_org_name, '');
            profile_company_name := nullif(v_profile_company, '');
            profile_role := coalesce(nullif(v_profile_role, ''), '');
            RETURN NEXT;
          END IF;
          RETURN;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_invitee_by_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invitee_by_phone(text) TO authenticated, service_role;

COMMIT;
