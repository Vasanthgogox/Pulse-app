-- Client invoice POD policy + invoice annexure snapshot + private invoices bucket.
-- Additive. No backfill. No enum. No PDF worker.

-- A. clients.invoice_pod_policy
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS invoice_pod_policy text;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_invoice_pod_policy_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_invoice_pod_policy_check
  CHECK (
    invoice_pod_policy IS NULL
    OR invoice_pod_policy IN ('none', 'soft_copy', 'hard_copy')
  );

COMMENT ON COLUMN public.clients.invoice_pod_policy IS
  'Client-level invoice POD requirement. NULL = unconfigured (workspace POD toggle fallback). none | soft_copy | hard_copy.';

-- Restrict writes to this column without changing the existing org-member
-- UPDATE policy for other client fields. Uses live organization_members.role
-- and permissions.grants / surfaces already stored in the DB.
CREATE OR REPLACE FUNCTION public.can_manage_client_invoice_pod_policy(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND (
        om.role IN ('owner', 'admin', 'finance')
        OR COALESCE(om.permissions -> 'grants', '[]'::jsonb) ? 'finance:manage'
        OR COALESCE(om.permissions #>> '{surfaces,finance.manage}', '') = 'true'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_client_invoice_pod_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_client_invoice_pod_policy(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_clients_protect_invoice_pod_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := COALESCE(auth.jwt() ->> 'role', '');
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_pod_policy IS NOT NULL
       AND NOT public.can_manage_client_invoice_pod_policy(NEW.organization_id) THEN
      RAISE EXCEPTION 'invoice_pod_policy_forbidden'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.invoice_pod_policy IS DISTINCT FROM OLD.invoice_pod_policy THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'invoice_pod_policy_forbidden'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_manage_client_invoice_pod_policy(NEW.organization_id) THEN
      RAISE EXCEPTION 'invoice_pod_policy_forbidden'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_clients_protect_invoice_pod_policy() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_clients_protect_invoice_pod_policy ON public.clients;
CREATE TRIGGER trg_clients_protect_invoice_pod_policy
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_clients_protect_invoice_pod_policy();

-- B. invoices.pod_annexure_snapshot
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pod_annexure_snapshot jsonb;

COMMENT ON COLUMN public.invoices.pod_annexure_snapshot IS
  'Immutable POD annexure metadata captured at issue. Application-owned JSON; no DB shape CHECK.';

-- D. invoices WITH CHECK: keep membership predicate, prevent org reassignment.
DROP POLICY IF EXISTS "org_members_manage_invoices" ON public.invoices;
CREATE POLICY "org_members_manage_invoices"
  ON public.invoices
  FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

-- C. private invoices bucket. Object names: {org_id}/{invoice_id}/...
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  52428800,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "invoices_select_org_member" ON storage.objects;
CREATE POLICY "invoices_select_org_member"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- No authenticated INSERT/UPDATE/DELETE on issued invoice PDFs.
-- service_role bypasses storage RLS for the future PDF worker.
