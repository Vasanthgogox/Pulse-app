-- Batch phone-to-invitee lookup for contact-sync recommendations.
--
-- Why: the single-phone get_invitee_by_phone RPC is rate-limited to 10 calls/minute
-- (security_hardening_phase1_1). Contact-sync can submit hundreds of normalized phones
-- in one pass, so calling get_invitee_by_phone per phone immediately exhausts the limit
-- and produces empty recommendations.
--
-- This function accepts an array of phone strings (any format — normalization is applied
-- inside), matches them in one query against profiles.phone (primary) and
-- auth.users.raw_user_meta_data->>'phone' (fallback), and returns one row per matched
-- active-org user. A single rate-limit token covers the entire batch call.

CREATE OR REPLACE FUNCTION public.get_invitees_by_phones(p_phones text[])
RETURNS TABLE(
  phone                text,
  organization_id      uuid,
  full_name            text,
  organization_name    text,
  profile_company_name text,
  profile_role         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid;
  v_has_org boolean;
BEGIN
  -- Auth guard (mirrors get_invitee_by_phone)
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = v_uid AND om.status = 'active'
  ) INTO v_has_org;

  IF NOT v_has_org THEN
    RAISE EXCEPTION 'No active organization membership';
  END IF;

  -- One rate-limit token per batch call (not per phone).
  -- 6 batches / minute is generous for contact-sync (typically runs once per session).
  PERFORM public.enforce_rpc_rate_limit('get_invitees_by_phones', 6, interval '1 minute');

  RETURN QUERY
  WITH
  -- 1. Normalize each input to the canonical last-10-digit form used by the DB.
  --    The same normalization is applied to stored phones below so both sides match.
  inputs AS (
    SELECT
      raw_p                                                                              AS raw,
      right(
        regexp_replace(regexp_replace(raw_p, '\s+', '', 'g'), '\D', '', 'g'),
        10
      )                                                                                  AS norm
    FROM unnest(p_phones) AS raw_p
    WHERE length(
        regexp_replace(regexp_replace(raw_p, '\s+', '', 'g'), '\D', '', 'g')
      ) >= 8  -- skip obviously invalid / too-short strings
  ),

  -- 2. Normalize profiles.phone for set-join comparison (avoids per-row loop).
  prof AS (
    SELECT
      pr.id                                                                              AS uid,
      trim(coalesce(pr.full_name, ''))                                                  AS p_name,
      trim(coalesce(pr.phone, ''))                                                      AS p_phone,
      lower(trim(coalesce(pr.role, '')))                                                AS p_role,
      trim(coalesce(pr.company_name, ''))                                               AS p_company,
      right(
        regexp_replace(regexp_replace(trim(coalesce(pr.phone, '')), '\s+', '', 'g'), '\D', '', 'g'),
        10
      )                                                                                  AS p_norm
    FROM public.profiles pr
    WHERE pr.phone IS NOT NULL
      AND trim(pr.phone) <> ''
      AND length(
            regexp_replace(regexp_replace(trim(pr.phone), '\s+', '', 'g'), '\D', '', 'g')
          ) >= 8
  ),

  -- 3. Match inputs to profiles (one profile per normalized input phone).
  profile_hits AS (
    SELECT DISTINCT ON (i.norm)
      i.raw, i.norm,
      p.uid, p.p_name, p.p_phone, p.p_role, p.p_company
    FROM inputs i
    JOIN prof p ON p.p_norm = i.norm
    ORDER BY i.norm, p.uid
  ),

  -- 4. Resolve organization for each profile-hit user.
  --    Prefer organization_members (active) over organizations.owner_id fallback.
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

  -- 5. FALLBACK: auth metadata for inputs not resolved via profiles.phone.
  auth_hits AS (
    SELECT DISTINCT ON (i.norm)
      i.raw, i.norm,
      au.id                                                                             AS uid,
      trim(coalesce(au.raw_user_meta_data->>'full_name',
                    au.raw_user_meta_data->>'name', ''))                               AS a_name,
      trim(coalesce(au.raw_user_meta_data->>'phone', ''))                              AS a_phone
    FROM inputs i
    JOIN auth.users au
      ON right(
           regexp_replace(regexp_replace(
             coalesce(au.raw_user_meta_data->>'phone', ''), '\s+', '', 'g'), '\D', '', 'g'),
           10
         ) = i.norm
     AND length(
           regexp_replace(regexp_replace(
             coalesce(au.raw_user_meta_data->>'phone', ''), '\s+', '', 'g'), '\D', '', 'g')
         ) >= 8
    WHERE i.norm NOT IN (SELECT ph.norm FROM profile_hits)
    ORDER BY i.norm, au.id
  ),

  -- 6. Resolve org for auth-fallback hits; pull role and company from profiles if present.
  auth_orgs AS (
    SELECT
      ah.raw, ah.norm, ah.a_name, ah.a_phone,
      lower(trim(coalesce(pr.role, '')))                                                AS p_role,
      trim(coalesce(pr.company_name, ''))                                               AS p_company,
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

  -- Profile-based results
  SELECT
    po.raw                                                                               AS phone,
    o.id                                                                                AS organization_id,
    CASE WHEN po.p_name <> '' THEN po.p_name ELSE po.p_phone END                       AS full_name,
    trim(coalesce(o.name, ''))                                                          AS organization_name,
    nullif(po.p_company, '')                                                            AS profile_company_name,
    po.p_role                                                                           AS profile_role
  FROM profile_orgs po
  JOIN public.organizations o ON o.id = po.org_id
  WHERE po.org_id IS NOT NULL

  UNION ALL

  -- Auth-metadata-based results (no profile.phone match)
  SELECT
    ao.raw                                                                               AS phone,
    o.id                                                                                AS organization_id,
    CASE WHEN ao.a_name <> '' THEN ao.a_name ELSE ao.a_phone END                       AS full_name,
    trim(coalesce(o.name, ''))                                                          AS organization_name,
    nullif(ao.p_company, '')                                                            AS profile_company_name,
    ao.p_role                                                                           AS profile_role
  FROM auth_orgs ao
  JOIN public.organizations o ON o.id = ao.org_id
  WHERE ao.org_id IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.get_invitees_by_phones(text[]) IS
  'Batch phone-to-org lookup for contact-sync recommendations. Accepts any phone format; '
  'normalizes to last-10-digit form internally. Matches profiles.phone first, then '
  'auth metadata. Returns one row per matched active-org user. Rate-limited to 6 calls/'
  'minute per user (one token covers the entire batch).';

REVOKE EXECUTE ON FUNCTION public.get_invitees_by_phones(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invitees_by_phones(text[]) TO authenticated, service_role;
