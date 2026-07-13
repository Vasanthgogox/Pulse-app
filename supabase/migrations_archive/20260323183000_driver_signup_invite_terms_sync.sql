-- Re-apply signup invite RPC with compensation carry-forward and backfill existing pending/rejected invites.

CREATE OR REPLACE FUNCTION public.send_driver_signup_match_invite(
  p_driver_id uuid,
  p_payable_amount numeric DEFAULT null,
  p_commission_percent numeric DEFAULT null,
  p_commission_per_km numeric DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_match public.driver_signup_matches;
  v_existing public.driver_invites;
  v_invite_id uuid;
  v_payable numeric;
  v_commission_percent numeric;
  v_commission_per_km numeric;
BEGIN
  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;
  IF NOT public.is_org_member(v_driver.organization_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_driver.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Driver already linked to an app account');
  END IF;

  v_payable := coalesce(p_payable_amount, v_driver.payable_amount);
  v_commission_percent := coalesce(p_commission_percent, v_driver.commission_percent);
  v_commission_per_km := coalesce(p_commission_per_km, v_driver.commission_per_km);

  PERFORM public.ensure_driver_signup_matches_for_driver(p_driver_id);

  SELECT *
  INTO v_match
  FROM public.driver_signup_matches
  WHERE driver_id = p_driver_id
    AND state IN ('pending_owner_action', 'invite_sent', 'declined', 'ignored', 'expired')
  ORDER BY
    CASE state
      WHEN 'pending_owner_action' THEN 0
      WHEN 'declined' THEN 1
      WHEN 'invite_sent' THEN 2
      WHEN 'ignored' THEN 3
      WHEN 'expired' THEN 4
      ELSE 5
    END,
    detected_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No signup match found');
  END IF;

  SELECT *
  INTO v_existing
  FROM public.driver_invites di
  WHERE di.from_organization_id = v_driver.organization_id
    AND di.to_user_id = v_match.matched_user_id
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.driver_invites
    SET payable_amount = coalesce(v_payable, payable_amount),
        commission_percent = coalesce(v_commission_percent, commission_percent),
        commission_per_km = coalesce(v_commission_per_km, commission_per_km),
        status = CASE WHEN status = 'rejected' THEN 'pending' ELSE status END,
        responded_at = CASE WHEN status = 'rejected' THEN null ELSE responded_at END,
        responded_by = CASE WHEN status = 'rejected' THEN null ELSE responded_by END,
        created_at = CASE WHEN status = 'rejected' THEN now() ELSE created_at END
    WHERE id = v_existing.id;

    UPDATE public.driver_signup_matches
    SET state = 'invite_sent',
        acted_at = now(),
        acted_by = auth.uid(),
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('invite_id', v_existing.id, 'terms_synced_at', now())
    WHERE id = v_match.id;

    RETURN jsonb_build_object(
      'ok', true,
      'already_exists', false,
      'invite_id', v_existing.id,
      'status', (SELECT status FROM public.driver_invites WHERE id = v_existing.id)
    );
  END IF;

  INSERT INTO public.driver_invites (
    from_organization_id,
    to_user_id,
    status,
    invitee_name,
    payable_amount,
    commission_percent,
    commission_per_km
  ) VALUES (
    v_driver.organization_id,
    v_match.matched_user_id,
    'pending',
    nullif(trim(coalesce(v_driver.name, '')), ''),
    v_payable,
    v_commission_percent,
    v_commission_per_km
  )
  RETURNING id INTO v_invite_id;

  UPDATE public.driver_signup_matches
  SET state = 'invite_sent',
      acted_at = now(),
      acted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('invite_id', v_invite_id)
  WHERE id = v_match.id;

  RETURN jsonb_build_object('ok', true, 'already_exists', false, 'invite_id', v_invite_id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.send_driver_signup_match_invite(p_driver_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.send_driver_signup_match_invite(
    p_driver_id,
    null::numeric,
    null::numeric,
    null::numeric
  );
$$;

-- Backfill missing compensation on existing invites using matched manual driver rows.
UPDATE public.driver_invites di
SET payable_amount = coalesce(di.payable_amount, d.payable_amount),
    commission_percent = coalesce(di.commission_percent, d.commission_percent),
    commission_per_km = coalesce(di.commission_per_km, d.commission_per_km)
FROM public.driver_signup_matches m
JOIN public.drivers d ON d.id = m.driver_id
WHERE m.organization_id = di.from_organization_id
  AND m.matched_user_id = di.to_user_id
  AND (
    di.payable_amount IS NULL
    OR di.commission_percent IS NULL
    OR di.commission_per_km IS NULL
  )
  AND (
    d.payable_amount IS NOT NULL
    OR d.commission_percent IS NOT NULL
    OR d.commission_per_km IS NOT NULL
  );

GRANT EXECUTE ON FUNCTION public.send_driver_signup_match_invite(uuid, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_driver_signup_match_invite(uuid) TO authenticated;
