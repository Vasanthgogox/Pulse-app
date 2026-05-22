-- ============================================================
-- Fix connection invite → accept → supplier display flow.
--
-- Bugs addressed (in order of severity):
--  1. RPC + RLS: org owners (not just members) can read/update
--     their incoming connection_requests (timing race on new signup).
--  2. UNIQUE indexes on (org, linked_org) for suppliers + clients
--     prevent duplicate rows from repeated trigger calls.
--  3. Approval trigger: use real owner phone when inserting the
--     linked-client row; fall back to placeholder only on conflict.
--     Also adds ON CONFLICT guards for both supplier + client inserts.
--  4. Auto-link: when a new organization is created, match any
--     existing manual clients (by owner phone) and set their
--     linked_organization_id so dispatchers can see "now on platform".
-- ============================================================


-- ── 1. RPC: received invites — accept org owners, not just members ────────────

CREATE OR REPLACE FUNCTION public.get_connection_requests_received_with_names(p_org_id uuid)
RETURNS TABLE(
  id uuid, from_organization_id uuid, to_organization_id uuid,
  request_shipper_client boolean, request_carrier_supplier boolean,
  status text, created_at timestamptz, responded_at timestamptz,
  responded_by uuid, from_org_name text, to_org_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    cr.id, cr.from_organization_id, cr.to_organization_id,
    cr.request_shipper_client, cr.request_carrier_supplier,
    cr.status, cr.created_at, cr.responded_at, cr.responded_by,
    coalesce(nullif(trim(fo.name),    ''), 'Unknown organization'),
    coalesce(nullif(trim(to_o.name),  ''), 'Unknown organization')
  FROM public.connection_requests cr
  LEFT JOIN public.organizations fo   ON fo.id  = cr.from_organization_id
  LEFT JOIN public.organizations to_o ON to_o.id = cr.to_organization_id
  WHERE cr.to_organization_id = p_org_id
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = p_org_id AND om.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = p_org_id AND o.owner_id = auth.uid()
      )
    )
  ORDER BY cr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_connection_requests_received_with_names(uuid) TO authenticated;


-- ── 2. RLS: connection_requests — allow org owners to read/approve ────────────

DROP POLICY IF EXISTS "To-org can read connection_requests to them"   ON public.connection_requests;
DROP POLICY IF EXISTS "To-org can update connection_requests to them" ON public.connection_requests;

CREATE POLICY "To-org can read connection_requests to them"
  ON public.connection_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = connection_requests.to_organization_id
        AND om.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = connection_requests.to_organization_id
        AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY "To-org can update connection_requests to them"
  ON public.connection_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = connection_requests.to_organization_id
        AND om.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = connection_requests.to_organization_id
        AND o.owner_id = auth.uid()
    )
  );


-- ── 3. Unique indexes: prevent duplicate linked-org rows ──────────────────────

-- Suppliers: only one row per (org, linked_org) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_org_linked_org
  ON public.suppliers(organization_id, linked_organization_id)
  WHERE linked_organization_id IS NOT NULL;

-- Clients: only one row per (org, linked_org) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_linked_org
  ON public.clients(organization_id, linked_organization_id)
  WHERE linked_organization_id IS NOT NULL;


-- ── 4. Approval trigger: real owner phone + ON CONFLICT guards ────────────────

CREATE OR REPLACE FUNCTION public.on_connection_request_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to_owner_id      uuid;
  v_from_owner_id    uuid;
  v_to_owner_phone   text;
  v_from_owner_phone text := '';
  v_supplier_linked  int  := 0;
  v_already_supplier int;
  v_client_linked    int  := 0;
  v_already_client   int;
  v_client_phone     text;
BEGIN
  IF new.status <> 'approved' OR old.status = 'approved' THEN
    RETURN new;
  END IF;

  -- ── Organization relations ──────────────────────────────────────────────────
  IF new.request_carrier_supplier THEN
    INSERT INTO public.organization_relations
      (from_organization_id, to_organization_id, relation_type, status)
    VALUES (new.from_organization_id, new.to_organization_id, 'client_supplier', 'active')
    ON CONFLICT (from_organization_id, to_organization_id, relation_type)
      DO UPDATE SET status = 'active', updated_at = now();
  END IF;
  IF new.request_shipper_client THEN
    INSERT INTO public.organization_relations
      (from_organization_id, to_organization_id, relation_type, status)
    VALUES (new.from_organization_id, new.to_organization_id, 'supplier_client', 'active')
    ON CONFLICT (from_organization_id, to_organization_id, relation_type)
      DO UPDATE SET status = 'active', updated_at = now();
  END IF;

  -- ── From_org → to_org as supplier ──────────────────────────────────────────
  SELECT 1 INTO v_already_supplier
  FROM public.suppliers
  WHERE organization_id = new.from_organization_id
    AND linked_organization_id = new.to_organization_id
  LIMIT 1;

  IF v_already_supplier IS NULL THEN
    SELECT o.owner_id INTO v_to_owner_id
    FROM public.organizations o WHERE o.id = new.to_organization_id;

    IF v_to_owner_id IS NOT NULL THEN
      SELECT trim(coalesce(p.phone, '')) INTO v_to_owner_phone
      FROM public.profiles p WHERE p.id = v_to_owner_id;

      IF coalesce(v_to_owner_phone, '') <> '' THEN
        UPDATE public.suppliers
        SET linked_organization_id = new.to_organization_id,
            supplier_type = 'integrated',
            updated_at = now()
        WHERE organization_id = new.from_organization_id
          AND (linked_organization_id IS NULL OR linked_organization_id <> new.to_organization_id)
          AND phone IS NOT NULL
          AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g'))
            = trim(regexp_replace(v_to_owner_phone, '\s+', '', 'g'));
        GET DIAGNOSTICS v_supplier_linked = row_count;
      END IF;
    END IF;

    -- Fallback: link by org name
    IF v_supplier_linked = 0 THEN
      UPDATE public.suppliers s
      SET linked_organization_id = new.to_organization_id,
          supplier_type = 'integrated',
          updated_at = now()
      FROM public.organizations o
      WHERE o.id = new.to_organization_id
        AND s.organization_id = new.from_organization_id
        AND s.linked_organization_id IS NULL
        AND trim(lower(coalesce(s.name, ''))) = trim(lower(coalesce(o.name, '')));
      GET DIAGNOSTICS v_supplier_linked = row_count;
    END IF;

    -- Fallback: create new supplier row — ON CONFLICT (linked_org) is idempotent
    IF v_supplier_linked = 0 THEN
      INSERT INTO public.suppliers
        (organization_id, name, phone, email, linked_organization_id, supplier_type, updated_at)
      SELECT
        new.from_organization_id,
        coalesce(nullif(trim(o.name), ''), 'Connected'),
        NULL, NULL,
        new.to_organization_id, 'integrated', now()
      FROM public.organizations o WHERE o.id = new.to_organization_id
      ON CONFLICT (organization_id, linked_organization_id)
        WHERE linked_organization_id IS NOT NULL
        DO UPDATE SET supplier_type = 'integrated', updated_at = now();

      -- If to_org row not found, insert minimal row
      IF NOT FOUND THEN
        INSERT INTO public.suppliers
          (organization_id, name, linked_organization_id, supplier_type, updated_at)
        VALUES (new.from_organization_id, 'Connected', new.to_organization_id, 'integrated', now())
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

  -- ── To_org → from_org as client ────────────────────────────────────────────
  SELECT 1 INTO v_already_client
  FROM public.clients
  WHERE organization_id = new.to_organization_id
    AND linked_organization_id = new.from_organization_id
  LIMIT 1;

  IF v_already_client IS NULL THEN
    SELECT o.owner_id INTO v_from_owner_id
    FROM public.organizations o WHERE o.id = new.from_organization_id;

    IF v_from_owner_id IS NOT NULL THEN
      SELECT trim(coalesce(p.phone, '')) INTO v_from_owner_phone
      FROM public.profiles p WHERE p.id = v_from_owner_id;

      IF coalesce(v_from_owner_phone, '') <> '' THEN
        -- Try matching an existing manual client row by phone
        UPDATE public.clients
        SET linked_organization_id = new.from_organization_id,
            is_integrated = true,
            updated_at = now()
        WHERE organization_id = new.to_organization_id
          AND linked_organization_id IS NULL
          AND phone IS NOT NULL
          AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g'))
            = trim(regexp_replace(v_from_owner_phone, '\s+', '', 'g'));
        GET DIAGNOSTICS v_client_linked = row_count;
      END IF;
    END IF;

    -- Fallback: link by org name
    IF v_client_linked = 0 THEN
      UPDATE public.clients c
      SET linked_organization_id = new.from_organization_id,
          is_integrated = true,
          updated_at = now()
      FROM public.organizations o
      WHERE o.id = new.from_organization_id
        AND c.organization_id = new.to_organization_id
        AND c.linked_organization_id IS NULL
        AND trim(lower(coalesce(c.name, ''))) = trim(lower(coalesce(o.name, '')));
      GET DIAGNOSTICS v_client_linked = row_count;
    END IF;

    -- Fallback: create new client row.
    -- Use the real owner phone when no conflict exists; placeholder otherwise.
    IF v_client_linked = 0 THEN
      v_client_phone := CASE
        WHEN coalesce(v_from_owner_phone, '') <> ''
          AND NOT EXISTS (
            SELECT 1 FROM public.clients
            WHERE organization_id = new.to_organization_id
              AND phone = v_from_owner_phone
          )
        THEN v_from_owner_phone
        ELSE 'linked-' || new.from_organization_id::text
      END;

      INSERT INTO public.clients
        (organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at)
      SELECT
        new.to_organization_id,
        coalesce(nullif(trim(o.name), ''), 'Connected'),
        v_client_phone, NULL,
        new.from_organization_id, true, now()
      FROM public.organizations o WHERE o.id = new.from_organization_id
      ON CONFLICT (organization_id, linked_organization_id)
        WHERE linked_organization_id IS NOT NULL
        DO UPDATE SET is_integrated = true, updated_at = now();

      IF NOT FOUND THEN
        INSERT INTO public.clients
          (organization_id, name, phone, linked_organization_id, is_integrated, updated_at)
        VALUES (new.to_organization_id, 'Connected', v_client_phone,
                new.from_organization_id, true, now())
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

  RETURN new;
END;
$$;

-- Re-attach trigger (function replace keeps it, but be explicit)
DROP TRIGGER IF EXISTS trg_connection_request_approved ON public.connection_requests;
CREATE TRIGGER trg_connection_request_approved
  AFTER UPDATE OF status ON public.connection_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_connection_request_approved();


-- ── 5. Auto-link: set linked_organization_id on manual clients when ───────────
--       their contact person's org is created on the platform.
--       Keeps is_integrated = false (invite still required);
--       just surfaces "this contact is now on platform" in the client list.

CREATE OR REPLACE FUNCTION public.on_organization_created_link_manual_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_phone text;
BEGIN
  SELECT trim(coalesce(p.phone, '')) INTO v_owner_phone
  FROM public.profiles p WHERE p.id = new.owner_id;

  IF coalesce(v_owner_phone, '') = '' THEN
    RETURN new;
  END IF;

  -- Link unlinked manual clients whose stored phone matches this new org's owner
  UPDATE public.clients
  SET linked_organization_id = new.id,
      updated_at = now()
  WHERE linked_organization_id IS NULL
    AND is_integrated = false
    AND phone IS NOT NULL
    AND trim(regexp_replace(phone, '\s+', '', 'g'))
      = trim(regexp_replace(v_owner_phone, '\s+', '', 'g'))
    AND organization_id <> new.id;  -- never self-link

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_created_link_manual_clients ON public.organizations;
CREATE TRIGGER trg_organization_created_link_manual_clients
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.on_organization_created_link_manual_clients();


-- ── Backfill: apply auto-link to orgs that already exist ─────────────────────
-- Safe: only touches rows where linked_organization_id IS NULL and is_integrated = false.

DO $$
DECLARE
  r RECORD;
  v_phone text;
BEGIN
  FOR r IN
    SELECT o.id AS org_id, p.phone
    FROM public.organizations o
    JOIN public.profiles p ON p.id = o.owner_id
    WHERE trim(coalesce(p.phone, '')) <> ''
  LOOP
    v_phone := trim(regexp_replace(r.phone, '\s+', '', 'g'));
    UPDATE public.clients
    SET linked_organization_id = r.org_id,
        updated_at = now()
    WHERE linked_organization_id IS NULL
      AND is_integrated = false
      AND phone IS NOT NULL
      AND trim(regexp_replace(phone, '\s+', '', 'g')) = v_phone
      AND organization_id <> r.org_id;
  END LOOP;
END $$;
