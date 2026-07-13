-- Update accept_driver_invite function to copy compensation data from invite to driver
-- This ensures compensation terms are preserved when drivers accept invitations

CREATE OR REPLACE FUNCTION public.accept_driver_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.driver_invites;
  v_driver_id uuid;
  v_name text;
  v_phone text;
  v_email text;
BEGIN
  SELECT * INTO v_invite FROM public.driver_invites WHERE id = p_invite_id AND to_user_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found or already responded'; END IF;
  
  SELECT coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), nullif(trim(raw_user_meta_data->>'name'), ''), 'Driver'),
         nullif(trim(raw_user_meta_data->>'phone'), ''), nullif(trim(email), '')
    INTO v_name, v_phone, v_email FROM auth.users WHERE id = auth.uid();
    
  -- Check if driver already exists for this org/user (reconnecting case)
  SELECT id INTO v_driver_id FROM public.drivers 
  WHERE organization_id = v_invite.from_organization_id 
    AND user_id = auth.uid() 
    AND left_at IS NOT NULL
  LIMIT 1;
    
  IF v_driver_id IS NOT NULL THEN
    -- Reconnect existing driver: update with compensation from invite (invite terms win)
    UPDATE public.drivers SET 
        name = coalesce(v_name, 'Driver'),
        phone = v_phone,
        email = v_email,
        left_at = null,
        status = 'offline',
        payable_amount = v_invite.payable_amount,
        commission_percent = v_invite.commission_percent,
        commission_per_km = v_invite.commission_per_km,
        updated_at = now()
    WHERE id = v_driver_id;
  ELSE
    -- Create new driver with compensation from invite
    INSERT INTO public.drivers (
        organization_id, 
        name, 
        phone, 
        email, 
        user_id, 
        status,
        payable_amount,
        commission_percent,
        commission_per_km
    )
    VALUES (
        v_invite.from_organization_id, 
        coalesce(v_name, 'Driver'), 
        v_phone, 
        v_email, 
        auth.uid(), 
        'offline',
        v_invite.payable_amount,
        v_invite.commission_percent,
        v_invite.commission_per_km
    )
    RETURNING id INTO v_driver_id;
  END IF;
  
  UPDATE public.driver_invites SET status = 'accepted', responded_at = now(), responded_by = auth.uid() WHERE id = p_invite_id;
  RETURN jsonb_build_object('driver_id', v_driver_id, 'organization_id', v_invite.from_organization_id);
END;
$$;
