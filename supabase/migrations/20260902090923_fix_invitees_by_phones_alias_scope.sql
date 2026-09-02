-- Fix: `ph` alias is not in scope inside the auth_hits subquery (it belongs to
-- profile_hits). Reference the CTE's own column instead.
CREATE OR REPLACE FUNCTION public.get_invitees_by_phones(
  p_phones text[],
  p_org_id uuid
)
 RETURNS TABLE(phone text, organization_id uuid, full_name text, organization_name text, profile_company_name text, profile_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Access denied for organization %', p_org_id;
  END IF;

  PERFORM public.enforce_rpc_rate_limit('get_invitees_by_phones', 6, interval '1 minute');

  RETURN QUERY
  WITH
  inputs AS (
    SELECT
      raw_p AS raw,
      right(regexp_replace(regexp_replace(raw_p, '\s+', '', 'g'), '\D', '', 'g'), 10) AS norm
    FROM unnest(p_phones) AS raw_p
    WHERE length(regexp_replace(regexp_replace(raw_p, '\s+', '', 'g'), '\D', '', 'g')) >= 8
  ),
  same_org_users AS (
    SELECT om.user_id
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id AND om.status = 'active'
  ),
  prof AS (
    SELECT
      pr.id AS uid,
      trim(coalesce(pr.full_name, '')) AS p_name,
      trim(coalesce(pr.phone, '')) AS p_phone,
      lower(trim(coalesce(pr.role, ''))) AS p_role,
      trim(coalesce(pr.company_name, '')) AS p_company,
      right(regexp_replace(regexp_replace(trim(coalesce(pr.phone, '')), '\s+', '', 'g'), '\D', '', 'g'), 10) AS p_norm
    FROM public.profiles pr
    WHERE pr.phone IS NOT NULL
      AND trim(pr.phone) <> ''
      AND length(regexp_replace(regexp_replace(trim(pr.phone), '\s+', '', 'g'), '\D', '', 'g')) >= 8
      AND pr.id NOT IN (SELECT su.user_id FROM same_org_users su)
  ),
  profile_hits AS (
    SELECT DISTINCT ON (i.norm)
      i.raw, i.norm,
      p.uid, p.p_name, p.p_phone, p.p_role, p.p_company
    FROM inputs i
    JOIN prof p ON p.p_norm = i.norm
    ORDER BY i.norm, p.uid
  ),
  profile_orgs AS (
    SELECT
      ph.raw, ph.norm, ph.p_name, ph.p_phone, ph.p_role, ph.p_company,
      COALESCE(
        (SELECT om.organization_id
           FROM public.organization_members om
          WHERE om.user_id = ph.uid AND om.status = 'active'
          LIMIT 1),
        (SELECT o2.id
           FROM public.organizations o2
          WHERE o2.owner_id = ph.uid
          LIMIT 1)
      ) AS org_id
    FROM profile_hits ph
  ),
  auth_hits AS (
    SELECT DISTINCT ON (i.norm)
      i.raw, i.norm,
      au.id AS uid,
      trim(coalesce(au.raw_user_meta_data->>'full_name',
                    au.raw_user_meta_data->>'name', '')) AS a_name,
      trim(coalesce(au.raw_user_meta_data->>'phone', '')) AS a_phone
    FROM inputs i
    JOIN auth.users au
      ON right(regexp_replace(regexp_replace(
           coalesce(au.raw_user_meta_data->>'phone', ''), '\s+', '', 'g'), '\D', '', 'g'), 10) = i.norm
     AND length(regexp_replace(regexp_replace(
           coalesce(au.raw_user_meta_data->>'phone', ''), '\s+', '', 'g'), '\D', '', 'g')) >= 8
    WHERE i.norm NOT IN (SELECT pf.norm FROM profile_hits pf)
      AND au.id NOT IN (SELECT su.user_id FROM same_org_users su)
    ORDER BY i.norm, au.id
  ),
  auth_orgs AS (
    SELECT
      ah.raw, ah.norm, ah.a_name, ah.a_phone,
      lower(trim(coalesce(pr.role, ''))) AS p_role,
      trim(coalesce(pr.company_name, '')) AS p_company,
      COALESCE(
        (SELECT om.organization_id
           FROM public.organization_members om
          WHERE om.user_id = ah.uid AND om.status = 'active'
          LIMIT 1),
        (SELECT o2.id
           FROM public.organizations o2
          WHERE o2.owner_id = ah.uid
          LIMIT 1)
      ) AS org_id
    FROM auth_hits ah
    LEFT JOIN public.profiles pr ON pr.id = ah.uid
  )

  SELECT
    po.raw AS phone,
    o.id AS organization_id,
    CASE WHEN po.p_name <> '' THEN po.p_name ELSE po.p_phone END AS full_name,
    trim(coalesce(o.name, '')) AS organization_name,
    nullif(po.p_company, '') AS profile_company_name,
    po.p_role AS profile_role
  FROM profile_orgs po
  JOIN public.organizations o ON o.id = po.org_id
  WHERE po.org_id IS NOT NULL
    AND po.org_id <> p_org_id

  UNION ALL

  SELECT
    ao.raw AS phone,
    o.id AS organization_id,
    CASE WHEN ao.a_name <> '' THEN ao.a_name ELSE ao.a_phone END AS full_name,
    trim(coalesce(o.name, '')) AS organization_name,
    nullif(ao.p_company, '') AS profile_company_name,
    ao.p_role AS profile_role
  FROM auth_orgs ao
  JOIN public.organizations o ON o.id = ao.org_id
  WHERE ao.org_id IS NOT NULL
    AND ao.org_id <> p_org_id;
END;
$function$;