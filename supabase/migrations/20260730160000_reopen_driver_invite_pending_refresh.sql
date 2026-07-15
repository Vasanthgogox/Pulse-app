-- Re-open / refresh fleet driver invites for reconnect flows.
-- Handles accepted, rejected, AND pending (refresh pay terms on re-send).

CREATE OR REPLACE FUNCTION public.reopen_driver_invite(
  p_org_id uuid,
  p_to_user_id uuid,
  p_from_org_name text DEFAULT NULL,
  p_invitee_name text DEFAULT NULL,
  p_payable_amount numeric DEFAULT NULL,
  p_commission_percent numeric DEFAULT NULL,
  p_commission_per_km numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_prev_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  SELECT di.status
  INTO v_prev_status
  FROM public.driver_invites di
  WHERE di.from_organization_id = p_org_id
    AND di.to_user_id = p_to_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  UPDATE public.driver_invites di
  SET
    status = 'pending',
    responded_at = NULL,
    responded_by = NULL,
    from_org_name = coalesce(nullif(trim(p_from_org_name), ''), di.from_org_name),
    invitee_name = coalesce(nullif(trim(p_invitee_name), ''), di.invitee_name),
    payable_amount = p_payable_amount,
    commission_percent = p_commission_percent,
    commission_per_km = p_commission_per_km,
    created_at = CASE
      WHEN v_prev_status IN ('accepted', 'rejected') THEN now()
      ELSE di.created_at
    END
  WHERE di.from_organization_id = p_org_id
    AND di.to_user_id = p_to_user_id
    AND di.status IN ('rejected', 'accepted', 'pending')
  RETURNING di.id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'status_not_reopenable');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending');
END;
$$;

COMMENT ON FUNCTION public.reopen_driver_invite(uuid, uuid, text, text, numeric, numeric, numeric) IS
  'Fleet owner re-opens or refreshes driver_invites to pending with fresh pay terms (reconnect / re-send).';

GRANT EXECUTE ON FUNCTION public.reopen_driver_invite(uuid, uuid, text, text, numeric, numeric, numeric) TO authenticated;
