-- Fix: vehicle/trip/indent/driver inserts fail when organizations.operational_code is NULL.
-- Root cause: backfill ran once at migration time; orgs created afterward never received a code.

CREATE OR REPLACE FUNCTION public.ensure_organization_operational_code(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_name text;
  v_candidate text;
  v_salt integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  SELECT operational_code, name
  INTO v_code, v_name
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

  IF v_code IS NOT NULL AND btrim(v_code) <> '' THEN
    RETURN upper(btrim(v_code));
  END IF;

  v_salt := 0;
  LOOP
    v_candidate := public.make_operational_org_code(v_name, p_org_id, v_salt);
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.operational_code = v_candidate
        AND o.id <> p_org_id
    );
    v_salt := v_salt + 1;
    IF v_salt > 100 THEN
      RAISE EXCEPTION 'Unable to allocate unique operational_code for org %', p_org_id;
    END IF;
  END LOOP;

  UPDATE public.organizations
  SET operational_code = v_candidate
  WHERE id = p_org_id;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_organization_operational_code_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate text;
  v_salt integer;
BEGIN
  IF NEW.operational_code IS NOT NULL AND btrim(NEW.operational_code) <> '' THEN
    NEW.operational_code := upper(btrim(NEW.operational_code));
    RETURN NEW;
  END IF;

  v_salt := 0;
  LOOP
    v_candidate := public.make_operational_org_code(NEW.name, NEW.id, v_salt);
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.operational_code = v_candidate
        AND o.id IS DISTINCT FROM NEW.id
    );
    v_salt := v_salt + 1;
    IF v_salt > 100 THEN
      RAISE EXCEPTION 'Unable to allocate unique operational_code for org %', NEW.id;
    END IF;
  END LOOP;

  NEW.operational_code := v_candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_organization_operational_code ON public.organizations;
CREATE TRIGGER trg_set_organization_operational_code
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_organization_operational_code_on_insert();

CREATE OR REPLACE FUNCTION public.generate_operational_code(
  org_id uuid,
  entity_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_code text;
  v_entity text := lower(trim(entity_type));
  v_seq bigint;
  v_prefix text;
BEGIN
  v_org_code := public.ensure_organization_operational_code(org_id);

  v_prefix := public.operational_prefix_for_entity(v_entity);
  v_seq := public.next_operational_sequence_value(org_id, v_entity);

  RETURN upper(v_org_code) || '-' || v_prefix || '-' || lpad(v_seq::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_enterprise_operational_code(
  p_org_id uuid,
  p_entity_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_code text;
  v_org_name text;
  v_org_short text;
  v_entity text := lower(trim(p_entity_type));
  v_prefix text;
  v_seq bigint;
BEGIN
  v_org_code := public.ensure_organization_operational_code(p_org_id);

  SELECT coalesce(name, '')
  INTO v_org_name
  FROM public.organizations
  WHERE id = p_org_id;

  v_org_short := upper(substr(regexp_replace(v_org_name, '[^A-Za-z]', '', 'g') || 'ORG', 1, 3));

  CASE v_entity
    WHEN 'trip' THEN v_prefix := 'TRIP';
    WHEN 'indent' THEN v_prefix := 'IND';
    WHEN 'vehicle' THEN v_prefix := 'VEH';
    WHEN 'driver' THEN v_prefix := 'DRV';
    WHEN 'invoice' THEN v_prefix := 'INV';
    WHEN 'pod' THEN v_prefix := 'POD';
    WHEN 'maintenance' THEN v_prefix := 'MNT';
    ELSE
      RAISE EXCEPTION 'Unsupported entity_type: %', p_entity_type;
  END CASE;

  v_seq := public.allocate_operational_sequence(p_org_id, v_entity);
  RETURN v_org_code || v_org_short || v_prefix || lpad(v_seq::text, 6, '0');
END;
$$;

-- Backfill any organizations still missing a code (including the org in the error report).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.organizations
    WHERE operational_code IS NULL OR btrim(operational_code) = ''
  LOOP
    PERFORM public.ensure_organization_operational_code(r.id);
  END LOOP;
END $$;
