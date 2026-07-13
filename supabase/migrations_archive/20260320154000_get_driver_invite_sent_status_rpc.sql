-- Returns existing pending/accepted/rejected status for a driver_invites row.
-- Used by the sender app to prevent duplicate invite creation.

CREATE OR REPLACE FUNCTION public.get_driver_invite_sent_status(
  p_org_id uuid,
  p_to_user_id uuid
)
RETURNS TABLE (status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT di.status
  FROM public.driver_invites di
  WHERE di.from_organization_id = p_org_id
    AND di.to_user_id = p_to_user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_invite_sent_status(uuid, uuid) TO authenticated;

