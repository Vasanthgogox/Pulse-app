-- Driver invites: table + RPCs for "Send invitation" (Add Driver by phone).
-- Without this migration, Send invitation fails (missing table/function).

CREATE TABLE IF NOT EXISTS public.driver_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_org_name text,
  payable_amount numeric(12,2),
  commission_percent numeric(5,2),
  commission_per_km numeric(10,2)
);

CREATE INDEX IF NOT EXISTS idx_driver_invites_to_user ON public.driver_invites(to_user_id);
CREATE INDEX IF NOT EXISTS idx_driver_invites_from_org ON public.driver_invites(from_organization_id);
CREATE INDEX IF NOT EXISTS idx_driver_invites_status ON public.driver_invites(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_invites_from_to ON public.driver_invites(from_organization_id, to_user_id);

COMMENT ON TABLE public.driver_invites IS 'Fleet owner invites driver (by phone). Driver sees under Invitations and can accept/reject.';

CREATE OR REPLACE FUNCTION public.set_driver_invite_from_org_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.from_org_name IS NULL OR trim(coalesce(NEW.from_org_name, '')) = '' THEN
    SELECT name INTO NEW.from_org_name FROM public.organizations WHERE id = NEW.from_organization_id;
    NEW.from_org_name := coalesce(nullif(trim(coalesce(NEW.from_org_name, '')), ''), 'Unknown');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_invites_set_from_org_name ON public.driver_invites;
CREATE TRIGGER trg_driver_invites_set_from_org_name
  BEFORE INSERT ON public.driver_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.set_driver_invite_from_org_name();

-- Look up driver by phone (digits-only, last 10 for Indian numbers). Uses auth.users.raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.get_driver_invitee_by_phone(p_phone text)
RETURNS TABLE(user_id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_name text;
  v_phone text;
  v_input_digits text;
  v_input_canon text;
  v_stored_digits text;
  v_stored_canon text;
BEGIN
  v_input_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_input_canon := CASE
    WHEN length(v_input_digits) >= 12 AND left(v_input_digits, 2) = '91' THEN right(v_input_digits, 10)
    WHEN length(v_input_digits) >= 10 THEN right(v_input_digits, 10)
    ELSE v_input_digits
  END;
  IF v_input_canon = '' THEN RETURN; END IF;

  FOR v_user_id, v_name, v_phone IN
    SELECT u.id,
           trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')),
           trim(coalesce(u.raw_user_meta_data->>'phone', ''))
      FROM auth.users u
      WHERE coalesce(u.raw_user_meta_data->>'role', '') = 'driver'
        AND coalesce(u.raw_user_meta_data->>'phone', '') <> ''
  LOOP
    v_stored_digits := regexp_replace(v_phone, '\D', '', 'g');
    v_stored_canon := CASE
      WHEN length(v_stored_digits) >= 12 AND left(v_stored_digits, 2) = '91' THEN right(v_stored_digits, 10)
      WHEN length(v_stored_digits) >= 10 THEN right(v_stored_digits, 10)
      ELSE v_stored_digits
    END;
    IF v_stored_canon = v_input_canon THEN
      RETURN QUERY SELECT v_user_id, (CASE WHEN v_name <> '' THEN v_name ELSE v_phone END), v_phone;
      RETURN;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_driver_invitee_by_phone(text) IS 'Returns user_id, full_name, phone for a driver with the given phone (normalized).';

CREATE OR REPLACE FUNCTION public.get_driver_invites_received()
RETURNS TABLE(id uuid, from_organization_id uuid, to_user_id uuid, status text, created_at timestamptz, responded_at timestamptz, responded_by uuid, from_org_name text, payable_amount numeric, commission_percent numeric, commission_per_km numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT di.id, di.from_organization_id, di.to_user_id, di.status, di.created_at, di.responded_at, di.responded_by,
    coalesce(nullif(trim(di.from_org_name), ''), nullif(trim(o.name), ''), 'Company'),
    di.payable_amount, di.commission_percent, di.commission_per_km
  FROM public.driver_invites di
  LEFT JOIN public.organizations o ON o.id = di.from_organization_id
  WHERE di.to_user_id = auth.uid()
  ORDER BY di.created_at DESC;
$$;

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
  INSERT INTO public.drivers (organization_id, name, phone, email, user_id, status)
  VALUES (v_invite.from_organization_id, coalesce(v_name, 'Driver'), v_phone, v_email, auth.uid(), 'offline')
  RETURNING id INTO v_driver_id;
  UPDATE public.driver_invites SET status = 'accepted', responded_at = now(), responded_by = auth.uid() WHERE id = p_invite_id;
  RETURN jsonb_build_object('driver_id', v_driver_id, 'organization_id', v_invite.from_organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_driver_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.driver_invites SET status = 'rejected', responded_at = now(), responded_by = auth.uid()
  WHERE id = p_invite_id AND to_user_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found or already responded'; END IF;
END;
$$;

ALTER TABLE public.driver_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can insert driver invites for their org" ON public.driver_invites;
CREATE POLICY "Org members can insert driver invites for their org"
  ON public.driver_invites FOR INSERT
  WITH CHECK (public.is_org_member(from_organization_id));

DROP POLICY IF EXISTS "Invitee can read own invites" ON public.driver_invites;
CREATE POLICY "Invitee can read own invites"
  ON public.driver_invites FOR SELECT
  USING (to_user_id = auth.uid());

DROP POLICY IF EXISTS "Invitee can update own pending invite" ON public.driver_invites;
CREATE POLICY "Invitee can update own pending invite"
  ON public.driver_invites FOR UPDATE
  USING (to_user_id = auth.uid() AND status = 'pending')
  WITH CHECK (to_user_id = auth.uid());

GRANT EXECUTE ON FUNCTION public.get_driver_invitee_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_invites_received() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_driver_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_driver_invite(uuid) TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.driver_invites TO authenticated;
