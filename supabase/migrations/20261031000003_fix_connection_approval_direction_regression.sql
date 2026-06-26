-- Restore directional client/supplier assignment on connection approval.
--
-- Regression: 20260729120000_fix_connection_flow_bugs.sql overwrote the directional
-- trigger from 20260427121000 and always created from_org→supplier + to_org→client,
-- ignoring request_shipper_client vs request_carrier_supplier.
--
-- Correct semantics:
--   request_shipper_client (Add Client): from_org gets to_org as CLIENT; to_org gets from_org as SUPPLIER.
--   request_carrier_supplier (Add Supplier): from_org gets to_org as SUPPLIER; to_org gets from_org as CLIENT.

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
  v_placeholder_phone text;
  v_org_id uuid;
  v_other_org_id uuid;
BEGIN
  IF new.status <> 'approved' OR old.status = 'approved' THEN
    RETURN new;
  END IF;

  IF new.request_carrier_supplier THEN
    INSERT INTO public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
    VALUES (new.from_organization_id, new.to_organization_id, 'client_supplier', 'active')
    ON CONFLICT (from_organization_id, to_organization_id, relation_type)
    DO UPDATE SET status = 'active', updated_at = now();
  END IF;

  IF new.request_shipper_client THEN
    INSERT INTO public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
    VALUES (new.from_organization_id, new.to_organization_id, 'supplier_client', 'active')
    ON CONFLICT (from_organization_id, to_organization_id, relation_type)
    DO UPDATE SET status = 'active', updated_at = now();
  END IF;

  -- request_shipper_client: from_org adds to_org as CLIENT; to_org adds from_org as SUPPLIER.
  IF new.request_shipper_client THEN
    v_linked := 0;
    SELECT 1 INTO v_already
    FROM public.clients
    WHERE organization_id = new.from_organization_id
      AND linked_organization_id = new.to_organization_id
    LIMIT 1;

    IF v_already IS NULL THEN
      v_org_id := new.from_organization_id;
      v_other_org_id := new.to_organization_id;
      v_placeholder_phone := 'linked-' || v_other_org_id::text;

      SELECT o.owner_id INTO v_other_owner_id
      FROM public.organizations o
      WHERE o.id = v_other_org_id;

      IF v_other_owner_id IS NOT NULL THEN
        SELECT trim(coalesce(p.phone, '')) INTO v_other_phone
        FROM public.profiles p
        WHERE p.id = v_other_owner_id;

        IF v_other_phone <> '' THEN
          UPDATE public.clients
          SET linked_organization_id = v_other_org_id,
              is_integrated = true,
              updated_at = now()
          WHERE organization_id = v_org_id
            AND linked_organization_id IS NULL
            AND phone IS NOT NULL
            AND (
              trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) =
                trim(regexp_replace(v_other_phone, '\s+', '', 'g'))
              OR (
                length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 10
                AND length(regexp_replace(v_other_phone, '\D', '', 'g')) >= 10
                AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) =
                  right(regexp_replace(v_other_phone, '\D', '', 'g'), 10)
              )
            );
          GET DIAGNOSTICS v_linked = row_count;
        END IF;
      END IF;

      IF v_linked = 0 THEN
        UPDATE public.clients c
        SET name = coalesce(nullif(trim(o.name), ''), c.name, 'Connected'),
            linked_organization_id = v_other_org_id,
            is_integrated = true,
            updated_at = now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id
          AND c.organization_id = v_org_id
          AND c.phone = v_placeholder_phone;
        GET DIAGNOSTICS v_linked = row_count;
      END IF;

      IF v_linked = 0 THEN
        INSERT INTO public.clients (organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at)
        SELECT v_org_id,
               coalesce(nullif(trim(o.name), ''), 'Connected'),
               v_placeholder_phone,
               NULL,
               v_other_org_id,
               true,
               now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id
        ON CONFLICT (organization_id, linked_organization_id)
          WHERE linked_organization_id IS NOT NULL
        DO UPDATE SET is_integrated = true, updated_at = now();

        IF NOT FOUND THEN
          INSERT INTO public.clients (organization_id, name, phone, linked_organization_id, is_integrated, updated_at)
          VALUES (v_org_id, 'Connected', v_placeholder_phone, v_other_org_id, true, now())
          ON CONFLICT (organization_id, linked_organization_id)
            WHERE linked_organization_id IS NOT NULL
          DO UPDATE SET is_integrated = true, updated_at = now();
        END IF;
      END IF;
    ELSE
      UPDATE public.clients
      SET is_integrated = true,
          linked_organization_id = new.to_organization_id,
          updated_at = now()
      WHERE organization_id = new.from_organization_id
        AND linked_organization_id = new.to_organization_id;
    END IF;

    v_linked := 0;
    SELECT 1 INTO v_already
    FROM public.suppliers
    WHERE organization_id = new.to_organization_id
      AND linked_organization_id = new.from_organization_id
    LIMIT 1;

    IF v_already IS NULL THEN
      v_org_id := new.to_organization_id;
      v_other_org_id := new.from_organization_id;

      SELECT o.owner_id INTO v_other_owner_id
      FROM public.organizations o
      WHERE o.id = v_other_org_id;

      IF v_other_owner_id IS NOT NULL THEN
        SELECT trim(coalesce(p.phone, '')) INTO v_other_phone
        FROM public.profiles p
        WHERE p.id = v_other_owner_id;

        IF v_other_phone <> '' THEN
          UPDATE public.suppliers
          SET linked_organization_id = v_other_org_id,
              supplier_type = 'integrated',
              updated_at = now()
          WHERE organization_id = v_org_id
            AND (linked_organization_id IS NULL OR linked_organization_id <> v_other_org_id)
            AND phone IS NOT NULL
            AND (
              trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) =
                trim(regexp_replace(v_other_phone, '\s+', '', 'g'))
              OR (
                length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 10
                AND length(regexp_replace(v_other_phone, '\D', '', 'g')) >= 10
                AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) =
                  right(regexp_replace(v_other_phone, '\D', '', 'g'), 10)
              )
            );
          GET DIAGNOSTICS v_linked = row_count;
        END IF;
      END IF;

      IF v_linked = 0 THEN
        INSERT INTO public.suppliers (organization_id, name, phone, email, linked_organization_id, supplier_type, updated_at)
        SELECT v_org_id,
               coalesce(nullif(trim(o.name), ''), 'Connected'),
               NULL,
               NULL,
               v_other_org_id,
               'integrated',
               now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id
        ON CONFLICT (organization_id, linked_organization_id)
          WHERE linked_organization_id IS NOT NULL
        DO UPDATE SET supplier_type = 'integrated', updated_at = now();

        IF NOT FOUND THEN
          INSERT INTO public.suppliers (organization_id, name, linked_organization_id, supplier_type, updated_at)
          VALUES (v_org_id, 'Connected', v_other_org_id, 'integrated', now())
          ON CONFLICT (organization_id, linked_organization_id)
            WHERE linked_organization_id IS NOT NULL
          DO UPDATE SET supplier_type = 'integrated', updated_at = now();
        END IF;
      END IF;
    ELSE
      UPDATE public.suppliers
      SET supplier_type = 'integrated',
          linked_organization_id = new.from_organization_id,
          updated_at = now()
      WHERE organization_id = new.to_organization_id
        AND linked_organization_id = new.from_organization_id;
    END IF;

  -- request_carrier_supplier: from_org adds to_org as SUPPLIER; to_org adds from_org as CLIENT.
  ELSIF new.request_carrier_supplier THEN
    v_linked := 0;
    SELECT 1 INTO v_already
    FROM public.suppliers
    WHERE organization_id = new.from_organization_id
      AND linked_organization_id = new.to_organization_id
    LIMIT 1;

    IF v_already IS NULL THEN
      v_org_id := new.from_organization_id;
      v_other_org_id := new.to_organization_id;

      SELECT o.owner_id INTO v_other_owner_id
      FROM public.organizations o
      WHERE o.id = v_other_org_id;

      IF v_other_owner_id IS NOT NULL THEN
        SELECT trim(coalesce(p.phone, '')) INTO v_other_phone
        FROM public.profiles p
        WHERE p.id = v_other_owner_id;

        IF v_other_phone <> '' THEN
          UPDATE public.suppliers
          SET linked_organization_id = v_other_org_id,
              supplier_type = 'integrated',
              updated_at = now()
          WHERE organization_id = v_org_id
            AND (linked_organization_id IS NULL OR linked_organization_id <> v_other_org_id)
            AND phone IS NOT NULL
            AND (
              trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) =
                trim(regexp_replace(v_other_phone, '\s+', '', 'g'))
              OR (
                length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 10
                AND length(regexp_replace(v_other_phone, '\D', '', 'g')) >= 10
                AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) =
                  right(regexp_replace(v_other_phone, '\D', '', 'g'), 10)
              )
            );
          GET DIAGNOSTICS v_linked = row_count;
        END IF;
      END IF;

      IF v_linked = 0 THEN
        INSERT INTO public.suppliers (organization_id, name, phone, email, linked_organization_id, supplier_type, updated_at)
        SELECT v_org_id,
               coalesce(nullif(trim(o.name), ''), 'Connected'),
               NULL,
               NULL,
               v_other_org_id,
               'integrated',
               now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id
        ON CONFLICT (organization_id, linked_organization_id)
          WHERE linked_organization_id IS NOT NULL
        DO UPDATE SET supplier_type = 'integrated', updated_at = now();

        IF NOT FOUND THEN
          INSERT INTO public.suppliers (organization_id, name, linked_organization_id, supplier_type, updated_at)
          VALUES (v_org_id, 'Connected', v_other_org_id, 'integrated', now())
          ON CONFLICT (organization_id, linked_organization_id)
            WHERE linked_organization_id IS NOT NULL
          DO UPDATE SET supplier_type = 'integrated', updated_at = now();
        END IF;
      END IF;
    ELSE
      UPDATE public.suppliers
      SET supplier_type = 'integrated',
          linked_organization_id = new.to_organization_id,
          updated_at = now()
      WHERE organization_id = new.from_organization_id
        AND linked_organization_id = new.to_organization_id;
    END IF;

    v_linked := 0;
    SELECT 1 INTO v_already
    FROM public.clients
    WHERE organization_id = new.to_organization_id
      AND linked_organization_id = new.from_organization_id
    LIMIT 1;

    IF v_already IS NULL THEN
      v_org_id := new.to_organization_id;
      v_other_org_id := new.from_organization_id;
      v_placeholder_phone := 'linked-' || v_other_org_id::text;

      SELECT o.owner_id INTO v_other_owner_id
      FROM public.organizations o
      WHERE o.id = v_other_org_id;

      IF v_other_owner_id IS NOT NULL THEN
        SELECT trim(coalesce(p.phone, '')) INTO v_other_phone
        FROM public.profiles p
        WHERE p.id = v_other_owner_id;

        IF v_other_phone <> '' THEN
          UPDATE public.clients
          SET linked_organization_id = v_other_org_id,
              is_integrated = true,
              updated_at = now()
          WHERE organization_id = v_org_id
            AND linked_organization_id IS NULL
            AND phone IS NOT NULL
            AND (
              trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) =
                trim(regexp_replace(v_other_phone, '\s+', '', 'g'))
              OR (
                length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 10
                AND length(regexp_replace(v_other_phone, '\D', '', 'g')) >= 10
                AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) =
                  right(regexp_replace(v_other_phone, '\D', '', 'g'), 10)
              )
            );
          GET DIAGNOSTICS v_linked = row_count;
        END IF;
      END IF;

      IF v_linked = 0 THEN
        UPDATE public.clients c
        SET name = coalesce(nullif(trim(o.name), ''), c.name, 'Connected'),
            linked_organization_id = v_other_org_id,
            is_integrated = true,
            updated_at = now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id
          AND c.organization_id = v_org_id
          AND c.phone = v_placeholder_phone;
        GET DIAGNOSTICS v_linked = row_count;
      END IF;

      IF v_linked = 0 THEN
        INSERT INTO public.clients (organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at)
        SELECT v_org_id,
               coalesce(nullif(trim(o.name), ''), 'Connected'),
               v_placeholder_phone,
               NULL,
               v_other_org_id,
               true,
               now()
        FROM public.organizations o
        WHERE o.id = v_other_org_id
        ON CONFLICT (organization_id, linked_organization_id)
          WHERE linked_organization_id IS NOT NULL
        DO UPDATE SET is_integrated = true, updated_at = now();

        IF NOT FOUND THEN
          INSERT INTO public.clients (organization_id, name, phone, linked_organization_id, is_integrated, updated_at)
          VALUES (v_org_id, 'Connected', v_placeholder_phone, v_other_org_id, true, now())
          ON CONFLICT (organization_id, linked_organization_id)
            WHERE linked_organization_id IS NOT NULL
          DO UPDATE SET is_integrated = true, updated_at = now();
        END IF;
      END IF;
    ELSE
      UPDATE public.clients
      SET is_integrated = true,
          linked_organization_id = new.from_organization_id,
          updated_at = now()
      WHERE organization_id = new.to_organization_id
        AND linked_organization_id = new.from_organization_id;
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_request_approved ON public.connection_requests;
CREATE TRIGGER trg_connection_request_approved
  AFTER UPDATE OF status ON public.connection_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_connection_request_approved();


-- Backfill: swap inverted roles for approved "Add Client" requests created by the regression.
DO $$
DECLARE
  r RECORD;
  v_wrong_supplier public.suppliers%ROWTYPE;
  v_wrong_client public.clients%ROWTYPE;
  v_placeholder_phone text;
BEGIN
  FOR r IN
    SELECT cr.from_organization_id, cr.to_organization_id
    FROM public.connection_requests cr
    WHERE cr.status = 'approved'
      AND cr.request_shipper_client = true
      AND cr.request_carrier_supplier = false
      AND EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.organization_id = cr.from_organization_id
          AND s.linked_organization_id = cr.to_organization_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.organization_id = cr.from_organization_id
          AND c.linked_organization_id = cr.to_organization_id
      )
      AND EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.organization_id = cr.to_organization_id
          AND c.linked_organization_id = cr.from_organization_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.organization_id = cr.to_organization_id
          AND s.linked_organization_id = cr.from_organization_id
      )
  LOOP
    SELECT * INTO v_wrong_supplier
    FROM public.suppliers s
    WHERE s.organization_id = r.from_organization_id
      AND s.linked_organization_id = r.to_organization_id
    LIMIT 1;

    SELECT * INTO v_wrong_client
    FROM public.clients c
    WHERE c.organization_id = r.to_organization_id
      AND c.linked_organization_id = r.from_organization_id
    LIMIT 1;

    IF v_wrong_supplier.id IS NULL OR v_wrong_client.id IS NULL THEN
      CONTINUE;
    END IF;

    -- Skip rows referenced by trips or chat (manual fix required).
    IF EXISTS (SELECT 1 FROM public.trips WHERE supplier_id = v_wrong_supplier.id)
       OR EXISTS (SELECT 1 FROM public.trips WHERE client_id = v_wrong_client.id)
       OR EXISTS (SELECT 1 FROM public.chat_conversations WHERE supplier_id = v_wrong_supplier.id)
       OR EXISTS (SELECT 1 FROM public.chat_conversations WHERE client_id = v_wrong_client.id) THEN
      CONTINUE;
    END IF;

    v_placeholder_phone := 'linked-' || r.to_organization_id::text;

    INSERT INTO public.clients (
      organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at
    )
    VALUES (
      r.from_organization_id,
      coalesce(nullif(trim(v_wrong_supplier.name), ''), 'Connected'),
      v_placeholder_phone,
      v_wrong_supplier.email,
      r.to_organization_id,
      true,
      now()
    )
    ON CONFLICT (organization_id, linked_organization_id)
      WHERE linked_organization_id IS NOT NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      is_integrated = true,
      updated_at = now();

    INSERT INTO public.suppliers (
      organization_id, name, phone, email, linked_organization_id, supplier_type, updated_at
    )
    VALUES (
      r.to_organization_id,
      coalesce(nullif(trim(v_wrong_client.name), ''), 'Connected'),
      NULL,
      v_wrong_client.email,
      r.from_organization_id,
      'integrated',
      now()
    )
    ON CONFLICT (organization_id, linked_organization_id)
      WHERE linked_organization_id IS NOT NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      supplier_type = 'integrated',
      updated_at = now();

    DELETE FROM public.suppliers WHERE id = v_wrong_supplier.id;
    DELETE FROM public.clients WHERE id = v_wrong_client.id;
  END LOOP;
END $$;
