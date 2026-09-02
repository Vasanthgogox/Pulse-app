-- Lets Add Client / Add Supplier distinguish "no platform account" from
-- "deliberately hidden because they are one of your own people".
--
-- get_invitee_by_phone hides same-org active members, so its NULL result is
-- ambiguous: the UI read it as NOT_FOUND and offered the offline path, which the
-- service guard then rejected at submit time — a dead-end funnel.
--
-- Discloses ONLY a boolean about the CALLER'S OWN org, which they can already
-- read from their member list. No name, no user id, no organization id, and
-- nothing at all about anyone outside p_org_id. Same-org invisibility in the
-- invitee RPCs is untouched.
--
-- Active-only, matching is_org_member(): a former/inactive member returns false
-- and stays legitimately addable as an offline party.
CREATE OR REPLACE FUNCTION public.is_active_org_member_phone(
  p_org_id uuid,
  p_phone text
)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_normalized text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Access denied for organization %', p_org_id;
  END IF;

  -- Canonical last-10-digit form, identical to get_invitee_by_phone.
  v_normalized := regexp_replace(coalesce(trim(p_phone), ''), '\s+', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\D', '', 'g');
  IF length(v_normalized) >= 12 AND left(v_normalized, 2) = '91' THEN
    v_normalized := right(v_normalized, 10);
  ELSIF length(v_normalized) >= 10 THEN
    v_normalized := right(v_normalized, 10);
  END IF;
  IF length(v_normalized) < 10 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.profiles pr ON pr.id = om.user_id
    WHERE om.organization_id = p_org_id
      AND om.status = 'active'
      AND pr.phone IS NOT NULL
      AND trim(pr.phone) <> ''
      AND right(
            regexp_replace(regexp_replace(trim(pr.phone), '\s+', '', 'g'), '\D', '', 'g'),
            10
          ) = v_normalized
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.is_active_org_member_phone(uuid, text) TO authenticated;