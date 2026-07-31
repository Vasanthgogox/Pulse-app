-- Load-chain loop guard.
--
-- Problem: a load can be sub-contracted back to an org that already sits
-- upstream in its own custody chain (cargo owner -> broker -> carrier -> cargo
-- owner). Observed case: MAX (cargo owner) -> Lenovo company (broker) ->
-- ABI Logistics (carrier), where ABI's supplier list offered MAX back as a
-- carrier for MAX's own freight.
--
-- No single column detects this. `indents` carries only a free-text
-- `client_name` (no client_id), and the looping org may be two or more hops
-- upstream -- so it is NOT the assigning org's own client. A naive
-- "supplier != my client" rule compares MAX against Lenovo and passes.
--
-- Approach: resolve the load's ancestor org set by walking provenance upward
-- (indent owner org -> that org's clients row matched on client_name ->
-- linked_organization_id), then reject any supplier whose linked org is
-- already in that set.
--
-- Enforcement is layered: UI filter (grey-out with reason) + service guard in
-- features/trips/services/loadChainGuard.service.ts + this trigger as the
-- backstop for direct SQL, imports and seed scripts.

-- ---------------------------------------------------------------------------
-- 1. Ancestor resolver
-- ---------------------------------------------------------------------------
-- Returns every org upstream of (and including) the given indent's owner.
--
-- Depth-capped and visited-guarded: client_name matching is heuristic, and
-- mutual client rows between two orgs would otherwise recurse forever.
--
-- A hop only continues when the upstream indent plausibly *is* the same load
-- (same route + same pickup date). Without that check the walk would follow an
-- upstream org's newest unrelated indent and leak strangers into the ancestor
-- set -- e.g. H&M, a client on MAX's unrelated Chennai loads, surfaced on a
-- Mumbai->Bengaluru chain and would have blocked an innocent carrier.
-- This deliberately prefers false negatives (miss a deep loop) over false
-- positives (block legitimate business); the cargo-owner and broker hops that
-- matter in practice are still caught.
CREATE OR REPLACE FUNCTION public.get_load_chain_ancestor_orgs(
  p_indent_id uuid,
  p_max_depth int DEFAULT 8
)
RETURNS TABLE(org_id uuid, hop int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE chain AS (
    -- Hop 0: the org that owns the indent (the party that awarded the load out).
    SELECT
      i.organization_id            AS org_id,
      i.client_name                AS next_client_name,
      i.pickup_area                AS route_pickup,
      i.drop_location              AS route_drop,
      i.pickup_date                AS route_date,
      0                            AS hop,
      ARRAY[i.organization_id]     AS seen
    FROM public.indents i
    WHERE i.id = p_indent_id
      AND i.organization_id IS NOT NULL

    UNION ALL

    -- Hop n+1: resolve the current org's named client to a real org via its
    -- clients row. Only integrated clients carry an org identity; a plain text
    -- client is a dead end and simply terminates the walk.
    SELECT
      c.linked_organization_id,
      up.client_name,
      chain.route_pickup,
      chain.route_drop,
      chain.route_date,
      chain.hop + 1,
      chain.seen || c.linked_organization_id
    FROM chain
    JOIN public.clients c
      ON c.organization_id = chain.org_id
     AND lower(btrim(c.name)) = lower(btrim(chain.next_client_name))
     AND c.deleted_at IS NULL
     AND c.linked_organization_id IS NOT NULL
    -- Continue upward only via an indent that looks like the SAME load.
    LEFT JOIN LATERAL (
      SELECT i2.client_name
      FROM public.indents i2
      WHERE i2.organization_id = c.linked_organization_id
        AND i2.deleted_at IS NULL
        AND lower(btrim(i2.pickup_area))   = lower(btrim(chain.route_pickup))
        AND lower(btrim(i2.drop_location)) = lower(btrim(chain.route_drop))
        AND i2.pickup_date IS NOT DISTINCT FROM chain.route_date
      ORDER BY i2.created_at DESC
      LIMIT 1
    ) up ON TRUE
    WHERE chain.hop < p_max_depth
      AND NOT (c.linked_organization_id = ANY(chain.seen))
  )
  SELECT chain.org_id, MIN(chain.hop) AS hop
  FROM chain
  WHERE chain.org_id IS NOT NULL
  GROUP BY chain.org_id;
$function$;

COMMENT ON FUNCTION public.get_load_chain_ancestor_orgs(uuid, int) IS
  'Orgs upstream of an indent in its custody chain (hop 0 = indent owner). Used to block sub-contracting a load back to a party that already handled it.';

GRANT EXECUTE ON FUNCTION public.get_load_chain_ancestor_orgs(uuid, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger backstop on trips
-- ---------------------------------------------------------------------------
-- Layer of last resort: catches direct SQL, imports and seed scripts that
-- bypass the app's UI filter and service guard.
CREATE OR REPLACE FUNCTION public.tg_trips_block_chain_loop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_indent_id     uuid;
  v_supplier_org  uuid;
  v_offender      text;
BEGIN
  -- Only aggregate (supplier-backed) trips can form a loop.
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nothing changed on the supplier lane? skip the work.
  IF TG_OP = 'UPDATE'
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id THEN
    RETURN NEW;
  END IF;

  v_indent_id := COALESCE(NEW.source_indent_id, NEW.indent_id);
  IF v_indent_id IS NULL THEN
    RETURN NEW;  -- no provenance: nothing to compare against.
  END IF;

  SELECT s.linked_organization_id
    INTO v_supplier_org
  FROM public.suppliers s
  WHERE s.id = NEW.supplier_id;

  -- Non-integrated supplier: no org identity, cannot close a loop.
  IF v_supplier_org IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.name
    INTO v_offender
  FROM public.get_load_chain_ancestor_orgs(v_indent_id) a
  JOIN public.organizations o ON o.id = a.org_id
  WHERE a.org_id = v_supplier_org
  LIMIT 1;

  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION
      'load_chain_loop: % is already upstream in this load''s chain and cannot also be its supplier', v_offender
      USING ERRCODE = 'check_violation',
            HINT = 'Assign a carrier that is not the cargo owner or an upstream broker on this load.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trips_block_chain_loop ON public.trips;
CREATE TRIGGER trips_block_chain_loop
  BEFORE INSERT OR UPDATE OF supplier_id ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_trips_block_chain_loop();
