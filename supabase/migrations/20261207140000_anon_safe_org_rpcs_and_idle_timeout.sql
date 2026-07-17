-- Fix Sentry "permission denied for function get_trips_for_org / get_clients_with_profiles"
-- from anon / expired sessions, WITHOUT exposing cross-org data.
--
-- Both functions are SECURITY DEFINER and filter only by p_org_id without verifying that the
-- caller belongs to that org. Granting anon EXECUTE alone would let any anonymous caller read
-- any org's trips + client PII (phone / email / GSTIN / PAN) by guessing org UUIDs. So we FIRST
-- add an org-membership guard (public.is_org_member returns false when auth.uid() is NULL), THEN
-- grant anon EXECUTE. Result: anon / expired / non-member callers get an empty result set (no
-- error, no data); authenticated members are unaffected. This removes the retry-storm that was
-- contributing to the connection-usage spikes.

-- get_clients_with_profiles: plpgsql -> guard with an early RETURN at the top of the body.
CREATE OR REPLACE FUNCTION public.get_clients_with_profiles(p_org_id uuid)
RETURNS TABLE(
  id uuid, organization_id uuid, name text, contact_person text, phone text,
  email text, address text, gstin text, pan_number text, status text,
  created_at timestamptz, updated_at timestamptz, is_integrated boolean,
  linked_organization_id uuid, avatar_url text, avatar_seed text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Anon / expired session or non-member of p_org_id: return nothing rather than raising
  -- or leaking another org's client PII.
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.organization_id,
    c.name,
    c.contact_person,
    c.phone,
    c.email,
    c.address,
    c.gstin,
    c.pan_number,
    c.status,
    c.created_at,
    c.updated_at,
    c.is_integrated,
    c.linked_organization_id,
    -- Prefer the linked org's branding logo; fall back to the owner's
    -- personal profile avatar so unbranded orgs still show a face.
    COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url) AS avatar_url,
    p.avatar_seed
  FROM public.clients c
  LEFT JOIN public.organizations o ON o.id = c.linked_organization_id
  LEFT JOIN public.profiles      p ON p.id = o.owner_id
  WHERE c.organization_id = p_org_id
    AND c.status = 'active'
  ORDER BY c.name ASC;
END;
$function$;

-- get_trips_for_org: plain SQL (STABLE, inlinable) -> AND the membership check into the WHERE
-- clause so a non-member / anon caller matches zero rows. Equivalent effect to an early return
-- while keeping the function a stable SQL function.
CREATE OR REPLACE FUNCTION public.get_trips_for_org(p_org_id uuid)
RETURNS SETOF json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT row_to_json(q)
  FROM (
    SELECT DISTINCT ON (tr.id)
      tr.*,
      i.indent_number
    FROM public.trips tr
    LEFT JOIN public.indents i ON i.id = tr.indent_id
    WHERE public.is_org_member(p_org_id)   -- false for anon / non-member -> 0 rows
      AND (
        tr.organization_id = p_org_id
        OR EXISTS (
          SELECT 1 FROM public.suppliers s
          WHERE s.id = tr.supplier_id
            AND s.linked_organization_id = p_org_id
        )
      )
    ORDER BY tr.id, tr.created_at DESC
  ) q
  ORDER BY q.created_at DESC
  LIMIT 400;
$function$;

-- Now safe to expose to anon: the guard makes anon/non-member calls return empty instead of
-- raising "permission denied for function" (which was triggering client retry storms).
REVOKE ALL ON FUNCTION public.get_clients_with_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trips_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clients_with_profiles(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_trips_for_org(uuid) TO authenticated, anon;

-- Connection-pressure mitigation (Recommendation #5): reap idle PostgREST API connections
-- faster during traffic spikes. 'authenticator' is the PostgREST login role, so this targets
-- the REST API pool surgically without affecting management / storage / realtime workers.
-- Takes effect on new connections.
ALTER ROLE authenticator SET idle_session_timeout = '180000';
