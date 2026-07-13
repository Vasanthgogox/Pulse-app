-- Fix: on_connection_request_approved was inserting NULL into clients.phone (NOT NULL).
-- Use placeholder phone 'linked-<from_org_id>' when creating a new client on connection approval.

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
  v_linked_phone text;
BEGIN
  v_linked_phone := 'linked-' || new.from_organization_id::text;

  IF new.status <> 'approved' OR old.status = 'approved' THEN
    RETURN new;
  END IF;

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
      UPDATE public.suppliers s
      SET linked_organization_id = new.to_organization_id, supplier_type = 'integrated', updated_at = now()
      FROM public.organizations o
      WHERE o.id = new.to_organization_id
        AND s.organization_id = new.from_organization_id
        AND s.linked_organization_id IS NULL
        AND trim(lower(coalesce(s.name, ''))) = trim(lower(coalesce(o.name, '')));
      GET DIAGNOSTICS v_supplier_linked = row_count;
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
      UPDATE public.clients c
      SET linked_organization_id = new.from_organization_id, is_integrated = true, updated_at = now()
      FROM public.organizations o
      WHERE o.id = new.from_organization_id
        AND c.organization_id = new.to_organization_id
        AND c.linked_organization_id IS NULL
        AND trim(lower(coalesce(c.name, ''))) = trim(lower(coalesce(o.name, '')));
      GET DIAGNOSTICS v_client_linked = row_count;
    END IF;
    IF v_client_linked = 0 THEN
      INSERT INTO public.clients (organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at)
      SELECT new.to_organization_id, coalesce(nullif(trim(o.name), ''), 'Connected'), v_linked_phone, NULL, new.from_organization_id, true, now()
      FROM public.organizations o WHERE o.id = new.from_organization_id;
      IF NOT FOUND THEN
        INSERT INTO public.clients (organization_id, name, phone, linked_organization_id, is_integrated, updated_at)
        VALUES (new.to_organization_id, 'Connected', v_linked_phone, new.from_organization_id, true, now());
      END IF;
    END IF;
  ELSE
    UPDATE public.clients SET is_integrated = true, linked_organization_id = new.from_organization_id, updated_at = now()
    WHERE organization_id = new.to_organization_id AND linked_organization_id = new.from_organization_id;
  END IF;

  RETURN new;
END;
$$;
