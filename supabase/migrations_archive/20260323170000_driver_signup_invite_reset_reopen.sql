-- Reopen rejected driver invites and add explicit reset RPC for signup-match flow.
-- This enables owner resend after driver rejection without creating duplicate invite rows.

-- 1) Send invite from signup-match: if existing invite is rejected, reopen same row to pending.
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

  -- Canonical terms source priority:
  -- request payload > manual driver row > existing invite row.
  v_payable := p_payable_amount;
  v_commission_percent := p_commission_percent;
  v_commission_per_km := p_commission_per_km;
  IF v_payable IS NULL THEN
    v_payable := v_driver.payable_amount;
  END IF;
  IF v_commission_percent IS NULL THEN
    v_commission_percent := v_driver.commission_percent;
  END IF;
  IF v_commission_per_km IS NULL THEN
    v_commission_per_km := v_driver.commission_per_km;
  END IF;

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
    IF v_existing.status = 'rejected' THEN
      UPDATE public.driver_invites
      SET status = 'pending',
          responded_at = null,
          responded_by = null,
          created_at = now(),
          payable_amount = coalesce(v_payable, payable_amount),
          commission_percent = coalesce(v_commission_percent, commission_percent),
          commission_per_km = coalesce(v_commission_per_km, commission_per_km)
      WHERE id = v_existing.id;

      UPDATE public.driver_signup_matches
      SET state = 'invite_sent',
          acted_at = now(),
          acted_by = auth.uid(),
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('invite_id', v_existing.id, 'reopened_at', now())
      WHERE id = v_match.id;

      RETURN jsonb_build_object(
        'ok', true,
        'already_exists', false,
        'reopened', true,
        'invite_id', v_existing.id,
        'status', 'pending'
      );
    END IF;

    -- Edge case: invite already pending/accepted but missing terms.
    UPDATE public.driver_invites
    SET payable_amount = coalesce(v_payable, payable_amount),
        commission_percent = coalesce(v_commission_percent, commission_percent),
        commission_per_km = coalesce(v_commission_per_km, commission_per_km)
    WHERE id = v_existing.id;

    UPDATE public.driver_signup_matches
    SET state = 'invite_sent',
        acted_at = now(),
        acted_by = auth.uid(),
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('invite_status', v_existing.status)
    WHERE id = v_match.id;

    RETURN jsonb_build_object('ok', true, 'already_exists', true, 'status', v_existing.status);
  END IF;

  BEGIN
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
  EXCEPTION
    WHEN unique_violation THEN
      SELECT di.id INTO v_invite_id
      FROM public.driver_invites di
      WHERE di.from_organization_id = v_driver.organization_id
        AND di.to_user_id = v_match.matched_user_id
      LIMIT 1;
  END;

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

-- Backward-compatible wrapper for clients still calling send_driver_signup_match_invite(uuid).
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

-- 2) Owner reset action for signup-match invite lifecycle.
CREATE OR REPLACE FUNCTION public.reset_driver_signup_invite(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_match public.driver_signup_matches;
  v_invite public.driver_invites;
BEGIN
  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;
  IF NOT public.is_org_member(v_driver.organization_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  PERFORM public.ensure_driver_signup_matches_for_driver(p_driver_id);

  SELECT *
  INTO v_match
  FROM public.driver_signup_matches
  WHERE driver_id = p_driver_id
    AND state IN ('pending_owner_action', 'invite_sent', 'declined', 'ignored', 'expired')
  ORDER BY detected_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No signup match found');
  END IF;

  SELECT *
  INTO v_invite
  FROM public.driver_invites di
  WHERE di.from_organization_id = v_driver.organization_id
    AND di.to_user_id = v_match.matched_user_id
  LIMIT 1;

  IF FOUND AND v_invite.status = 'rejected' THEN
    UPDATE public.driver_invites
    SET status = 'pending',
        responded_at = null,
        responded_by = null,
        created_at = now()
    WHERE id = v_invite.id;
  END IF;

  UPDATE public.driver_signup_matches
  SET state = 'pending_owner_action',
      acted_at = now(),
      acted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reset_at', now())
  WHERE id = v_match.id;

  RETURN jsonb_build_object(
    'ok', true,
    'reset', true,
    'invite_status',
      CASE
        WHEN FOUND THEN (SELECT status FROM public.driver_invites WHERE id = v_invite.id)
        ELSE null
      END
  );
END;
$$;

-- 3) Keep signup-match state in sync when driver rejects from driver app.
CREATE OR REPLACE FUNCTION public.reject_driver_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.driver_invites;
BEGIN
  SELECT * INTO v_invite
  FROM public.driver_invites
  WHERE id = p_invite_id
    AND to_user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already responded';
  END IF;

  UPDATE public.driver_invites
  SET status = 'rejected',
      responded_at = now(),
      responded_by = auth.uid()
  WHERE id = p_invite_id;

  UPDATE public.driver_signup_matches
  SET state = 'declined',
      acted_at = now(),
      acted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('declined_invite_id', p_invite_id, 'declined_at', now())
  WHERE organization_id = v_invite.from_organization_id
    AND matched_user_id = auth.uid()
    AND state IN ('pending_owner_action', 'invite_sent');
END;
$$;

-- One-time backfill for existing invites missing compensation:
-- copy terms from matched manual driver rows when available.
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
GRANT EXECUTE ON FUNCTION public.reset_driver_signup_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_driver_invite(uuid) TO authenticated;
