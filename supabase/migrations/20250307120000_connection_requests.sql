-- connection_requests: org-to-org invitations (Add Client / Add Supplier "Send invitation").
-- Requires: organizations, organization_members. On approve, creates organization_relations and links clients/suppliers (uses profiles if present).

-- organization_relations (for trigger on approve)
CREATE TABLE IF NOT EXISTS public.organization_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  to_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'client_supplier' CHECK (relation_type IN ('client_supplier', 'supplier_client', 'broker_fleet')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'ended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(from_organization_id, to_organization_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_organization_relations_from ON public.organization_relations(from_organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_relations_to ON public.organization_relations(to_organization_id);

-- connection_requests
CREATE TABLE IF NOT EXISTS public.connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  to_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_shipper_client boolean NOT NULL DEFAULT false,
  request_carrier_supplier boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT at_least_one_role CHECK (request_shipper_client OR request_carrier_supplier),
  UNIQUE(from_organization_id, to_organization_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_requests_from ON public.connection_requests(from_organization_id);
CREATE INDEX IF NOT EXISTS idx_connection_requests_to ON public.connection_requests(to_organization_id);
CREATE INDEX IF NOT EXISTS idx_connection_requests_status ON public.connection_requests(status);

COMMENT ON TABLE public.connection_requests IS 'Org-to-org invitations. On approve, trigger creates organization_relations and client/supplier links.';

-- Trigger function: on status -> approved, create organization_relations and client/supplier rows
CREATE OR REPLACE FUNCTION public.on_connection_request_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to_owner_id uuid;
  v_from_owner_id uuid;
  v_to_owner_phone text;
  v_from_owner_phone text;
  v_supplier_linked int := 0;
  v_already_supplier int;
  v_client_linked int := 0;
  v_already_client int;
BEGIN
  IF new.status <> 'approved' OR old.status = 'approved' THEN
    RETURN new;
  END IF;

  -- Organization relations
  IF new.request_carrier_supplier THEN
    INSERT INTO public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
    VALUES (new.from_organization_id, new.to_organization_id, 'client_supplier', 'active')
    ON CONFLICT (from_organization_id, to_organization_id, relation_type) DO UPDATE SET status = 'active', updated_at = now();
  END IF;
  IF new.request_shipper_client THEN
    INSERT INTO public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
    VALUES (new.from_organization_id, new.to_organization_id, 'supplier_client', 'active')
    ON CONFLICT (from_organization_id, to_organization_id, relation_type) DO UPDATE SET status = 'active', updated_at = now();
  END IF;

  -- From_org: add to_org as supplier (link or create)
  SELECT 1 INTO v_already_supplier
  FROM public.suppliers
  WHERE organization_id = new.from_organization_id AND linked_organization_id = new.to_organization_id
  LIMIT 1;

  IF v_already_supplier IS NULL THEN
    SELECT o.owner_id INTO v_to_owner_id FROM public.organizations o WHERE o.id = new.to_organization_id;
    IF v_to_owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
      SELECT trim(coalesce(p.phone, '')) INTO v_to_owner_phone FROM public.profiles p WHERE p.id = v_to_owner_id;
      IF v_to_owner_phone <> '' THEN
        UPDATE public.suppliers
        SET linked_organization_id = new.to_organization_id, supplier_type = 'integrated', updated_at = now()
        WHERE organization_id = new.from_organization_id
          AND (linked_organization_id IS NULL OR linked_organization_id <> new.to_organization_id)
          AND phone IS NOT NULL
          AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(v_to_owner_phone, '\s+', '', 'g'));
        GET DIAGNOSTICS v_supplier_linked = row_count;
      END IF;
    END IF;
    IF v_supplier_linked = 0 THEN
      INSERT INTO public.suppliers (organization_id, name, phone, email, linked_organization_id, supplier_type, updated_at)
      SELECT new.from_organization_id,
        coalesce(nullif(trim(o.name), ''), 'Connected'),
        NULL, NULL,
        new.to_organization_id, 'integrated', now()
      FROM public.organizations o WHERE o.id = new.to_organization_id;
      IF NOT FOUND THEN
        INSERT INTO public.suppliers (organization_id, name, linked_organization_id, supplier_type, updated_at)
        VALUES (new.from_organization_id, 'Connected', new.to_organization_id, 'integrated', now());
      END IF;
    END IF;
  ELSE
    UPDATE public.suppliers SET supplier_type = 'integrated', linked_organization_id = new.to_organization_id, updated_at = now()
    WHERE organization_id = new.from_organization_id AND linked_organization_id = new.to_organization_id;
  END IF;

  -- To_org: add from_org as client (link or create)
  SELECT 1 INTO v_already_client
  FROM public.clients
  WHERE organization_id = new.to_organization_id AND linked_organization_id = new.from_organization_id
  LIMIT 1;

  IF v_already_client IS NULL THEN
    SELECT o.owner_id INTO v_from_owner_id FROM public.organizations o WHERE o.id = new.from_organization_id;
    IF v_from_owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
      SELECT trim(coalesce(p.phone, '')) INTO v_from_owner_phone FROM public.profiles p WHERE p.id = v_from_owner_id;
      IF v_from_owner_phone <> '' THEN
        UPDATE public.clients
        SET linked_organization_id = new.from_organization_id, is_integrated = true, updated_at = now()
        WHERE organization_id = new.to_organization_id AND linked_organization_id IS NULL
          AND phone IS NOT NULL
          AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(v_from_owner_phone, '\s+', '', 'g'));
        GET DIAGNOSTICS v_client_linked = row_count;
      END IF;
    END IF;
    IF v_client_linked = 0 THEN
      INSERT INTO public.clients (organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at)
      SELECT new.to_organization_id, coalesce(nullif(trim(o.name), ''), 'Connected'), NULL, NULL, new.from_organization_id, true, now()
      FROM public.organizations o WHERE o.id = new.from_organization_id;
      IF NOT FOUND THEN
        INSERT INTO public.clients (organization_id, name, linked_organization_id, is_integrated, updated_at)
        VALUES (new.to_organization_id, 'Connected', new.from_organization_id, true, now());
      END IF;
    END IF;
  ELSE
    UPDATE public.clients SET is_integrated = true, linked_organization_id = new.from_organization_id, updated_at = now()
    WHERE organization_id = new.to_organization_id AND linked_organization_id = new.from_organization_id;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_request_approved ON public.connection_requests;
CREATE TRIGGER trg_connection_request_approved
  AFTER UPDATE OF status ON public.connection_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_connection_request_approved();

-- RLS
ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "From-org can insert connection_requests" ON public.connection_requests;
CREATE POLICY "From-org can insert connection_requests" ON public.connection_requests FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = from_organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "From-org can manage own connection_requests" ON public.connection_requests;
CREATE POLICY "From-org can manage own connection_requests" ON public.connection_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = connection_requests.from_organization_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = connection_requests.from_organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "To-org can read connection_requests to them" ON public.connection_requests;
CREATE POLICY "To-org can read connection_requests to them" ON public.connection_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = connection_requests.to_organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "To-org can update connection_requests to them" ON public.connection_requests;
CREATE POLICY "To-org can update connection_requests to them" ON public.connection_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = connection_requests.to_organization_id AND om.user_id = auth.uid()));

-- organization_relations RLS (minimal: from_org manages, to_org can read)
ALTER TABLE public.organization_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "From-org members can manage organization_relations" ON public.organization_relations;
CREATE POLICY "From-org members can manage organization_relations" ON public.organization_relations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_relations.from_organization_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_relations.from_organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "To-org members can read organization_relations" ON public.organization_relations;
CREATE POLICY "To-org members can read organization_relations" ON public.organization_relations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_relations.to_organization_id AND om.user_id = auth.uid()));

-- RPCs for list received/sent with org names
CREATE OR REPLACE FUNCTION public.get_connection_requests_received_with_names(p_org_id uuid)
RETURNS TABLE(id uuid, from_organization_id uuid, to_organization_id uuid, request_shipper_client boolean, request_carrier_supplier boolean, status text, created_at timestamptz, responded_at timestamptz, responded_by uuid, from_org_name text, to_org_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT cr.id, cr.from_organization_id, cr.to_organization_id, cr.request_shipper_client, cr.request_carrier_supplier, cr.status, cr.created_at, cr.responded_at, cr.responded_by,
    coalesce(nullif(trim(fo.name), ''), 'Unknown organization'),
    coalesce(nullif(trim(to_org.name), ''), 'Unknown organization')
  FROM public.connection_requests cr
  LEFT JOIN public.organizations fo ON fo.id = cr.from_organization_id
  LEFT JOIN public.organizations to_org ON to_org.id = cr.to_organization_id
  WHERE cr.to_organization_id = p_org_id
    AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = p_org_id AND om.user_id = auth.uid())
  ORDER BY cr.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_connection_requests_sent_with_names(p_org_id uuid)
RETURNS TABLE(id uuid, from_organization_id uuid, to_organization_id uuid, request_shipper_client boolean, request_carrier_supplier boolean, status text, created_at timestamptz, responded_at timestamptz, responded_by uuid, from_org_name text, to_org_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT cr.id, cr.from_organization_id, cr.to_organization_id, cr.request_shipper_client, cr.request_carrier_supplier, cr.status, cr.created_at, cr.responded_at, cr.responded_by,
    coalesce(nullif(trim(fo.name), ''), 'Unknown organization'),
    coalesce(nullif(trim(to_org.name), ''), 'Unknown organization')
  FROM public.connection_requests cr
  LEFT JOIN public.organizations fo ON fo.id = cr.from_organization_id
  LEFT JOIN public.organizations to_org ON to_org.id = cr.to_organization_id
  WHERE cr.from_organization_id = p_org_id
    AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = p_org_id AND om.user_id = auth.uid())
  ORDER BY cr.created_at DESC;
$$;

GRANT ALL ON TABLE public.connection_requests TO authenticated;
GRANT ALL ON TABLE public.organization_relations TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_requests_received_with_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_requests_sent_with_names(uuid) TO authenticated;
