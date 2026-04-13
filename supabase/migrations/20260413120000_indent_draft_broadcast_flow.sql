-- Add draft/share lifecycle for indents while preserving existing statuses.

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_saved_at timestamptz;

ALTER TABLE public.indents DROP CONSTRAINT IF EXISTS indents_status_check;

ALTER TABLE public.indents
  ADD CONSTRAINT indents_status_check
  CHECK (
    status IN (
      'draft',
      'broadcast',
      'open',
      'pending',
      'quoted',
      'awarded',
      'completed',
      'expired',
      'cancelled',
      'closed'
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_indent_draft_broadcast_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'broadcast' AND NEW.shared_at IS NULL THEN
      NEW.shared_at := now();
    END IF;
    IF NEW.status = 'draft' AND NEW.last_saved_at IS NULL THEN
      NEW.last_saved_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'broadcast' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Broadcast indents cannot be reverted to draft'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'broadcast' AND (
    NEW.pickup_area IS DISTINCT FROM OLD.pickup_area OR
    NEW.drop_location IS DISTINCT FROM OLD.drop_location OR
    NEW.client_name IS DISTINCT FROM OLD.client_name OR
    NEW.client_price IS DISTINCT FROM OLD.client_price OR
    NEW.supplier_target IS DISTINCT FROM OLD.supplier_target OR
    NEW.vehicle_type IS DISTINCT FROM OLD.vehicle_type OR
    NEW.load_type IS DISTINCT FROM OLD.load_type OR
    NEW.pickup_date IS DISTINCT FROM OLD.pickup_date OR
    NEW.circulation_target IS DISTINCT FROM OLD.circulation_target
  ) THEN
    RAISE EXCEPTION 'This indent has been shared and cannot be edited'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status <> 'broadcast' AND NEW.status = 'broadcast' AND NEW.shared_at IS NULL THEN
    NEW.shared_at := now();
  END IF;

  IF NEW.status = 'draft' THEN
    NEW.last_saved_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_indent_draft_broadcast_rules ON public.indents;
CREATE TRIGGER trg_enforce_indent_draft_broadcast_rules
BEFORE INSERT OR UPDATE ON public.indents
FOR EACH ROW
EXECUTE FUNCTION public.enforce_indent_draft_broadcast_rules();

COMMENT ON COLUMN public.indents.shared_at IS 'Timestamp when indent was shared with the network.';
COMMENT ON COLUMN public.indents.last_saved_at IS 'Timestamp when a draft indent was last saved.';

-- Draft indents should not appear in Find Work.
CREATE OR REPLACE FUNCTION public.market_indents_for_org(org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  indent_number text,
  pickup_area text,
  drop_location text,
  client_name text,
  client_price numeric,
  supplier_target numeric,
  status text,
  vehicle_type text,
  load_type text,
  pickup_date date,
  circulation_target text,
  created_at timestamptz,
  updated_at timestamptz,
  creator_organization_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_ids uuid[];
BEGIN
  IF NOT public.is_org_member(org_id) THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT pid) FILTER (WHERE pid IS NOT NULL),
    ARRAY[]::uuid[]
  ) INTO partner_ids
  FROM (
    SELECT r.from_organization_id AS pid
    FROM public.organization_relations r
    WHERE r.to_organization_id = market_indents_for_org.org_id
      AND r.relation_type = 'client_supplier'
      AND r.status = 'active'
    UNION ALL
    SELECT r.to_organization_id AS pid
    FROM public.organization_relations r
    WHERE r.from_organization_id = market_indents_for_org.org_id
      AND r.relation_type = 'supplier_client'
      AND r.status = 'active'
  ) sub;

  IF array_length(partner_ids, 1) IS NULL OR array_length(partner_ids, 1) = 0 THEN
    SELECT COALESCE(array_agg(DISTINCT s.organization_id) FILTER (WHERE s.organization_id IS NOT NULL AND s.organization_id != market_indents_for_org.org_id), ARRAY[]::uuid[])
    INTO partner_ids
    FROM public.suppliers s
    WHERE s.linked_organization_id = market_indents_for_org.org_id;
  END IF;

  IF array_length(partner_ids, 1) IS NULL OR array_length(partner_ids, 1) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.organization_id,
    i.indent_number,
    i.pickup_area,
    i.drop_location,
    i.client_name,
    i.client_price,
    i.supplier_target,
    i.status,
    i.vehicle_type,
    i.load_type,
    i.pickup_date,
    i.circulation_target,
    i.created_at,
    i.updated_at,
    o.name::text AS creator_organization_name
  FROM public.indents i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.organization_id = ANY(partner_ids)
    AND i.circulation_target IN ('integrated_supplier', 'both')
    AND i.status <> 'draft'
  ORDER BY i.created_at DESC;
END;
$$;
