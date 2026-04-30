-- Phase 1 hardening: close public/anon access gaps, enforce RLS on internal tables,
-- and add explicit authorization checks in high-risk SECURITY DEFINER RPCs.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Enforce RLS on tables that were previously exposed without policies
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organization_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

-- loads: allow access only to explicit owners/creators, or org members via linked trip/indent.
DROP POLICY IF EXISTS "loads_access_scoped" ON public.loads;
CREATE POLICY "loads_access_scoped"
  ON public.loads
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.trips t
      JOIN public.organization_members om
        ON om.organization_id = t.organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE t.id = loads.trip_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.indents i
      JOIN public.organization_members om
        ON om.organization_id = i.organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE i.id = loads.indent_id
    )
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.trips t
      JOIN public.organization_members om
        ON om.organization_id = t.organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE t.id = loads.trip_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.indents i
      JOIN public.organization_members om
        ON om.organization_id = i.organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE i.id = loads.indent_id
    )
  );

-- organization_counters: allow scoped read/write only to active org members.
DROP POLICY IF EXISTS "organization_counters_org_member_manage" ON public.organization_counters;
CREATE POLICY "organization_counters_org_member_manage"
  ON public.organization_counters
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = organization_counters.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = organization_counters.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- user_counters: self-only access.
DROP POLICY IF EXISTS "user_counters_self_manage" ON public.user_counters;
CREATE POLICY "user_counters_self_manage"
  ON public.user_counters
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- public.users (mirror table): self-only access.
DROP POLICY IF EXISTS "users_self_manage" ON public.users;
CREATE POLICY "users_self_manage"
  ON public.users
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) Fix over-permissive bids policy
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS bids_select ON public.bids;
CREATE POLICY bids_select
  ON public.bids
  FOR SELECT
  TO authenticated
  USING (
    bidder_organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.posts p
      JOIN public.organization_members om
        ON om.organization_id = p.organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE p.id = bids.post_id
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Harden risky SECURITY DEFINER RPCs (authorization + grants)
-- ---------------------------------------------------------------------------

-- discover_organizations: caller must be authenticated and member of p_org_id.
DROP FUNCTION IF EXISTS public.discover_organizations(UUID, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.discover_organizations(
  p_org_id   UUID,
  p_search   TEXT DEFAULT '',
  p_limit    INT  DEFAULT 20,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  id                   UUID,
  name                 TEXT,
  avatar_seed          TEXT,
  connection_status    TEXT,
  address_line         TEXT,
  city                 TEXT,
  state                TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Access denied for organization %', p_org_id;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    NULL::TEXT         AS avatar_seed,
    COALESCE(cr.status, 'none') AS connection_status,
    NULLIF(trim(o.address_line), ''),
    NULLIF(trim(o.city), ''),
    NULLIF(trim(o.state), '')
  FROM public.organizations o
  LEFT JOIN public.connection_requests cr ON (
    (cr.from_organization_id = p_org_id AND cr.to_organization_id = o.id)
    OR
    (cr.to_organization_id = p_org_id AND cr.from_organization_id = o.id)
  )
  WHERE o.id <> p_org_id
    AND (coalesce(p_search, '') = '' OR o.name ILIKE '%' || p_search || '%')
  ORDER BY
    CASE COALESCE(cr.status, 'none')
      WHEN 'approved' THEN 1
      WHEN 'pending'  THEN 2
      ELSE 3
    END,
    o.name ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

-- generate_trip_otp: caller must be authenticated org member of trip organization.
CREATE OR REPLACE FUNCTION public.generate_trip_otp(
  p_trip_id uuid,
  p_ttl_minutes int DEFAULT 15
)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_expires_at timestamptz;
  v_ttl int;
  v_trip_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.organization_id
  INTO v_trip_org
  FROM public.trips t
  WHERE t.id = p_trip_id;

  IF v_trip_org IS NULL THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = v_trip_org
      AND om.user_id = auth.uid()
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied for trip %', p_trip_id;
  END IF;

  v_ttl := greatest(1, least(coalesce(p_ttl_minutes, 15), 1440));

  LOOP
    v_code := lpad(floor(random() * 1000000)::text, 6, '0');
    v_expires_at := now() + (v_ttl || ' minutes')::interval;
    INSERT INTO public.trip_otps (trip_id, code, expires_at, used_at, failed_attempts)
    VALUES (p_trip_id, v_code, v_expires_at, NULL, 0)
    ON CONFLICT (trip_id) DO UPDATE
    SET code = EXCLUDED.code,
        expires_at = EXCLUDED.expires_at,
        used_at = NULL,
        failed_attempts = 0,
        created_at = now();
    RETURN QUERY SELECT v_code, v_expires_at;
    RETURN;
  END LOOP;
END;
$$;

-- regenerate delegates to hardened generate function.
CREATE OR REPLACE FUNCTION public.regenerate_trip_otp(
  p_trip_id uuid,
  p_ttl_minutes int DEFAULT 15
)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.generate_trip_otp(p_trip_id, p_ttl_minutes);
$$;

-- get_email_by_phone: require authenticated caller.
CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_normalized := regexp_replace(coalesce(trim(p_phone), ''), '\s+', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\D', '', 'g');
  IF length(v_normalized) >= 12 AND left(v_normalized, 2) = '91' THEN
    v_normalized := right(v_normalized, 10);
  ELSIF length(v_normalized) >= 10 THEN
    v_normalized := right(v_normalized, 10);
  END IF;
  IF v_normalized = '' OR length(v_normalized) < 10 THEN
    RETURN NULL;
  END IF;

  SELECT trim(pr.email) INTO v_email
  FROM public.profiles pr,
       LATERAL (
         SELECT
           CASE
             WHEN length(d) >= 12 AND left(d, 2) = '91' THEN right(d, 10)
             WHEN length(d) >= 10 THEN right(d, 10)
             ELSE d
           END AS norm
         FROM (
           SELECT regexp_replace(regexp_replace(coalesce(trim(pr.phone), ''), '\s+', '', 'g'), '\D', '', 'g') AS d
         ) x
       ) y
  WHERE pr.phone IS NOT NULL
    AND trim(pr.phone) <> ''
    AND trim(coalesce(pr.email, '')) <> ''
    AND y.norm = v_normalized
  LIMIT 1;

  RETURN v_email;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Restrict EXECUTE grants on high-risk RPCs
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.generate_trip_otp(uuid, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.regenerate_trip_otp(uuid, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_trip_otp(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_trip_by_otp(text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trip_otp_increment_failed(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.discover_organizations(uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_email_by_phone(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_invitee_by_phone(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.generate_trip_otp(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_trip_otp(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_trip_otp(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_trip_by_otp(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trip_otp_increment_failed(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discover_organizations(uuid, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_invitee_by_phone(text) TO authenticated, service_role;

COMMIT;
