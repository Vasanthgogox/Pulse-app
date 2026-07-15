-- Fix client-supplier role assignment on connection approval.
--
-- Bug: Trigger was always creating the same roles regardless of request type:
--   - From_org always got to_org as supplier (wrong when user sent "Add Client")
--   - To_org always got from_org as client AND from_org as supplier (duplicate role)
--
-- Correct semantics (directional, one party = client, other = supplier):
--   - request_shipper_client = true (Add Client): Inviter wants invitee as their CLIENT.
--     => From_org gets to_org as CLIENT. To_org gets from_org as SUPPLIER only.
--   - request_carrier_supplier = true (Add Supplier): Inviter wants invitee as their SUPPLIER.
--     => From_org gets to_org as SUPPLIER. To_org gets from_org as CLIENT only.
--   - If both flags set (shouldn't happen from UI): prefer request_shipper_client only
--     so we never create "both client and supplier" for the same pair.
--
-- Edge cases preserved:
--   - Duplicate request (same from/to): UNIQUE(on from_organization_id, to_organization_id) prevents
--     duplicate row; approval runs once.
--   - Re-invitation after existing connection: same as above; trigger upserts/links by
--     linked_organization_id so existing rows are updated, not duplicated.
--   - Mutual invites (A→B and B→A): two separate connection_requests rows (from/to swapped);
--     each approval creates one directional relationship.

CREATE OR REPLACE FUNCTION public.on_connection_request_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_owner_id uuid;
  v_other_phone text;
  v_linked int := 0;
  v_already int;
  v_linked_phone text;
  v_org_id uuid;
  v_other_org_id uuid;
BEGIN
  v_linked_phone := 'linked-' || new.from_organization_id::text;

  IF new.status <> 'approved' OR old.status = 'approved' THEN
    RETURN new;
  END IF;

  -- Organization relations (unchanged)
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

  -- --- request_shipper_client: from_org adds to_org as CLIENT; to_org adds from_org as SUPPLIER ---
  IF new.request_shipper_client THEN
    -- From_org: ensure client row with linked_organization_id = to_org
    SELECT 1 INTO v_already
    FROM public.clients
    WHERE organization_id = new.from_organization_id AND linked_organization_id = new.to_organization_id
    LIMIT 1;

    IF v_already IS NULL THEN
      v_org_id := new.from_organization_id;
      v_other_org_id := new.to_organization_id;
      SELECT o.owner_id INTO v_other_owner_id FROM public.organizations o WHERE o.id = v_other_org_id;
      IF v_other_owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        SELECT trim(coalesce(p.phone, '')) INTO v_other_phone FROM public.profiles p WHERE p.id = v_other_owner_id;
        IF v_other_phone <> '' THEN
          UPDATE public.clients
          SET linked_organization_id = v_other_org_id, is_integrated = true, updated_at = now()
          WHERE organization_id = v_org_id AND linked_organization_id IS NULL
            AND phone IS NOT NULL
            AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(v_other_phone, '\s+', '', 'g'));
          GET DIAGNOSTICS v_linked = row_count;
        END IF;
      END IF;
      IF v_linked = 0 THEN
        UPDATE public.clients c
        SET linked_organization_id = v_other_org_id, is_integrated = true, updated_at = now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id AND c.organization_id = v_org_id AND c.linked_organization_id IS NULL
          AND trim(lower(coalesce(c.name, ''))) = trim(lower(coalesce(o.name, '')));
        GET DIAGNOSTICS v_linked = row_count;
      END IF;
      IF v_linked = 0 THEN
        INSERT INTO public.clients (organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at)
        SELECT v_org_id, coalesce(nullif(trim(o.name), ''), 'Connected'), v_linked_phone, NULL, v_other_org_id, true, now()
        FROM public.organizations o WHERE o.id = v_other_org_id;
        IF NOT FOUND THEN
          INSERT INTO public.clients (organization_id, name, phone, linked_organization_id, is_integrated, updated_at)
          VALUES (v_org_id, 'Connected', v_linked_phone, v_other_org_id, true, now());
        END IF;
      END IF;
    ELSE
      UPDATE public.clients SET is_integrated = true, linked_organization_id = new.to_organization_id, updated_at = now()
      WHERE organization_id = new.from_organization_id AND linked_organization_id = new.to_organization_id;
    END IF;

    -- To_org: ensure supplier row with linked_organization_id = from_org (receiver sees inviter as supplier)
    v_linked := 0;
    SELECT 1 INTO v_already
    FROM public.suppliers
    WHERE organization_id = new.to_organization_id AND linked_organization_id = new.from_organization_id
    LIMIT 1;

    IF v_already IS NULL THEN
      v_org_id := new.to_organization_id;
      v_other_org_id := new.from_organization_id;
      SELECT o.owner_id INTO v_other_owner_id FROM public.organizations o WHERE o.id = v_other_org_id;
      IF v_other_owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        SELECT trim(coalesce(p.phone, '')) INTO v_other_phone FROM public.profiles p WHERE p.id = v_other_owner_id;
        IF v_other_phone <> '' THEN
          UPDATE public.suppliers
          SET linked_organization_id = v_other_org_id, supplier_type = 'integrated', updated_at = now()
          WHERE organization_id = v_org_id
            AND (linked_organization_id IS NULL OR linked_organization_id <> v_other_org_id)
            AND phone IS NOT NULL
            AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(v_other_phone, '\s+', '', 'g'));
          GET DIAGNOSTICS v_linked = row_count;
        END IF;
      END IF;
      IF v_linked = 0 THEN
        UPDATE public.suppliers s
        SET linked_organization_id = v_other_org_id, supplier_type = 'integrated', updated_at = now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id AND s.organization_id = v_org_id AND s.linked_organization_id IS NULL
          AND trim(lower(coalesce(s.name, ''))) = trim(lower(coalesce(o.name, '')));
        GET DIAGNOSTICS v_linked = row_count;
      END IF;
      IF v_linked = 0 THEN
        INSERT INTO public.suppliers (organization_id, name, phone, email, linked_organization_id, supplier_type, updated_at)
        SELECT v_org_id, coalesce(nullif(trim(o.name), ''), 'Connected'), NULL, NULL, v_other_org_id, 'integrated', now()
        FROM public.organizations o WHERE o.id = v_other_org_id;
        IF NOT FOUND THEN
          INSERT INTO public.suppliers (organization_id, name, linked_organization_id, supplier_type, updated_at)
          VALUES (v_org_id, 'Connected', v_other_org_id, 'integrated', now());
        END IF;
      END IF;
    ELSE
      UPDATE public.suppliers SET supplier_type = 'integrated', linked_organization_id = new.from_organization_id, updated_at = now()
      WHERE organization_id = new.to_organization_id AND linked_organization_id = new.from_organization_id;
    END IF;

  -- --- request_carrier_supplier: from_org adds to_org as SUPPLIER; to_org adds from_org as CLIENT ---
  -- One direction per approval; if both flags set, prefer Add Client (request_shipper_client) above.
  ELSIF new.request_carrier_supplier THEN
    -- From_org: ensure supplier row with linked_organization_id = to_org
    v_linked := 0;
    SELECT 1 INTO v_already
    FROM public.suppliers
    WHERE organization_id = new.from_organization_id AND linked_organization_id = new.to_organization_id
    LIMIT 1;

    IF v_already IS NULL THEN
      v_org_id := new.from_organization_id;
      v_other_org_id := new.to_organization_id;
      SELECT o.owner_id INTO v_other_owner_id FROM public.organizations o WHERE o.id = v_other_org_id;
      IF v_other_owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        SELECT trim(coalesce(p.phone, '')) INTO v_other_phone FROM public.profiles p WHERE p.id = v_other_owner_id;
        IF v_other_phone <> '' THEN
          UPDATE public.suppliers
          SET linked_organization_id = v_other_org_id, supplier_type = 'integrated', updated_at = now()
          WHERE organization_id = v_org_id
            AND (linked_organization_id IS NULL OR linked_organization_id <> v_other_org_id)
            AND phone IS NOT NULL
            AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(v_other_phone, '\s+', '', 'g'));
          GET DIAGNOSTICS v_linked = row_count;
        END IF;
      END IF;
      IF v_linked = 0 THEN
        UPDATE public.suppliers s
        SET linked_organization_id = v_other_org_id, supplier_type = 'integrated', updated_at = now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id AND s.organization_id = v_org_id AND s.linked_organization_id IS NULL
          AND trim(lower(coalesce(s.name, ''))) = trim(lower(coalesce(o.name, '')));
        GET DIAGNOSTICS v_linked = row_count;
      END IF;
      IF v_linked = 0 THEN
        INSERT INTO public.suppliers (organization_id, name, phone, email, linked_organization_id, supplier_type, updated_at)
        SELECT v_org_id, coalesce(nullif(trim(o.name), ''), 'Connected'), NULL, NULL, v_other_org_id, 'integrated', now()
        FROM public.organizations o WHERE o.id = v_other_org_id;
        IF NOT FOUND THEN
          INSERT INTO public.suppliers (organization_id, name, linked_organization_id, supplier_type, updated_at)
          VALUES (v_org_id, 'Connected', v_other_org_id, 'integrated', now());
        END IF;
      END IF;
    ELSE
      UPDATE public.suppliers SET supplier_type = 'integrated', linked_organization_id = new.to_organization_id, updated_at = now()
      WHERE organization_id = new.from_organization_id AND linked_organization_id = new.to_organization_id;
    END IF;

    -- To_org: ensure client row with linked_organization_id = from_org
    v_linked := 0;
    SELECT 1 INTO v_already
    FROM public.clients
    WHERE organization_id = new.to_organization_id AND linked_organization_id = new.from_organization_id
    LIMIT 1;

    IF v_already IS NULL THEN
      v_org_id := new.to_organization_id;
      v_other_org_id := new.from_organization_id;
      SELECT o.owner_id INTO v_other_owner_id FROM public.organizations o WHERE o.id = v_other_org_id;
      IF v_other_owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        SELECT trim(coalesce(p.phone, '')) INTO v_other_phone FROM public.profiles p WHERE p.id = v_other_owner_id;
        IF v_other_phone <> '' THEN
          UPDATE public.clients
          SET linked_organization_id = v_other_org_id, is_integrated = true, updated_at = now()
          WHERE organization_id = v_org_id AND linked_organization_id IS NULL
            AND phone IS NOT NULL
            AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(v_other_phone, '\s+', '', 'g'));
          GET DIAGNOSTICS v_linked = row_count;
        END IF;
      END IF;
      IF v_linked = 0 THEN
        UPDATE public.clients c
        SET linked_organization_id = v_other_org_id, is_integrated = true, updated_at = now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id AND c.organization_id = v_org_id AND c.linked_organization_id IS NULL
          AND trim(lower(coalesce(c.name, ''))) = trim(lower(coalesce(o.name, '')));
        GET DIAGNOSTICS v_linked = row_count;
      END IF;
      IF v_linked = 0 THEN
        INSERT INTO public.clients (organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at)
        SELECT v_org_id, coalesce(nullif(trim(o.name), ''), 'Connected'), v_linked_phone, NULL, v_other_org_id, true, now()
        FROM public.organizations o WHERE o.id = v_other_org_id;
        IF NOT FOUND THEN
          INSERT INTO public.clients (organization_id, name, phone, linked_organization_id, is_integrated, updated_at)
          VALUES (v_org_id, 'Connected', v_linked_phone, v_other_org_id, true, now());
        END IF;
      END IF;
    ELSE
      UPDATE public.clients SET is_integrated = true, linked_organization_id = new.from_organization_id, updated_at = now()
      WHERE organization_id = new.to_organization_id AND linked_organization_id = new.from_organization_id;
    END IF;
  END IF;

  RETURN new;
END;
$$;
