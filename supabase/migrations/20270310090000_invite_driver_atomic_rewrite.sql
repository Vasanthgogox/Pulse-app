-- Phase 2, path 1: invite_driver RPC + its caller inviteDriver().
--
-- Today, inviteDriver() (TS) does its OWN org-scoped check-then-insert/update
-- against public.drivers, and THEN separately calls this RPC, which does a
-- SECOND, independent org-scoped check-then-insert against the same table.
-- Two uncoordinated race windows stacked on the same global partial index.
--
-- Fix: this RPC becomes the sole, atomic authority for "find or create the
-- org's driver row for this phone, then create the pending invite". The
-- paired TS change (drivers.service.ts) deletes its own check-then-insert/
-- update block entirely and just calls this RPC.
--
-- The RPC gains the email/pay-term params so it can absorb the UPDATE-
-- existing-row behavior the client block used to perform (name/phone/email/
-- status/pay terms) when reusing an active same-org row -- relationship_origin
-- is deliberately never touched here (write-once, same convention as
-- accept_driver_invite).
--
-- Return type changes from uuid (invite id only) to jsonb, since the caller
-- now needs the driver row too (previously sourced from its own insert/
-- update call) and a clean error channel for the cross-org case. DROP is
-- required because Postgres won't let CREATE OR REPLACE change a return
-- type; a 3-arg call still resolves to this function since the 4 new
-- params are all DEFAULT NULL.

DROP FUNCTION IF EXISTS public.invite_driver(text, text, uuid);

CREATE OR REPLACE FUNCTION public.invite_driver(
  p_phone text,
  p_name text,
  p_org_id uuid,
  p_email text DEFAULT NULL,
  p_payable_amount numeric DEFAULT NULL,
  p_commission_percent numeric DEFAULT NULL,
  p_commission_per_km numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone_norm text := public.normalise_phone(p_phone);
  v_driver     public.drivers%ROWTYPE;
  v_invite_id  uuid;
  v_org_name   text;
  v_name       text := coalesce(nullif(trim(p_name), ''), 'Driver');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;
  IF length(coalesce(v_phone_norm, '')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid phone required');
  END IF;

  PERFORM public.lock_driver_phone(v_phone_norm);

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE phone_normalised = v_phone_norm
    AND organization_id = p_org_id
    AND left_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Reuse the existing row; refresh the same fields the removed client-side
    -- block used to update. relationship_origin is write-once -- untouched.
    UPDATE public.drivers
    SET name = v_name,
        phone = coalesce(nullif(trim(p_phone), ''), phone),
        email = nullif(trim(coalesce(p_email, '')), ''),
        status = 'offline',
        payable_amount = p_payable_amount,
        commission_percent = p_commission_percent,
        commission_per_km = p_commission_per_km,
        updated_at = now()
    WHERE id = v_driver.id
    RETURNING * INTO v_driver;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.phone_normalised = v_phone_norm AND d.user_id IS NULL AND d.left_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before inviting here.'
      );
    END IF;

    INSERT INTO public.drivers (name, phone, organization_id, status, email, payable_amount, commission_percent, commission_per_km)
    VALUES (
      v_name,
      nullif(trim(p_phone), ''),
      p_org_id,
      'offline',
      nullif(trim(coalesce(p_email, '')), ''),
      p_payable_amount,
      p_commission_percent,
      p_commission_per_km
    )
    ON CONFLICT (phone_normalised) WHERE (phone_normalised IS NOT NULL AND user_id IS NULL AND left_at IS NULL)
    DO NOTHING
    RETURNING * INTO v_driver;

    IF v_driver.id IS NULL THEN
      SELECT * INTO v_driver
      FROM public.drivers
      WHERE phone_normalised = v_phone_norm AND organization_id = p_org_id AND left_at IS NULL
      LIMIT 1;
      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before inviting here.'
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.driver_invites
  SET status = 'expired'
  WHERE driver_id = v_driver.id
    AND status = 'pending'
    AND to_user_id IS NULL;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

  INSERT INTO public.driver_invites (
    driver_id,
    from_organization_id,
    phone_normalised,
    invited_by,
    to_user_id,
    invitee_name,
    from_org_name,
    status,
    expires_at
  )
  VALUES (
    v_driver.id,
    p_org_id,
    v_phone_norm,
    auth.uid(),
    NULL,
    v_name,
    coalesce(v_org_name, 'Company'),
    'pending',
    now() + interval '7 days'
  )
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'invite_id', v_invite_id);
END;
$function$;
