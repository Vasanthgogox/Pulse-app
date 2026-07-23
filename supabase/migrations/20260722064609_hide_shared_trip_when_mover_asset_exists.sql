-- Suppress the aggregator's shared trip from a MOVER's trip list once the mover
-- has its own asset trip for the same load.
--
-- When an aggregator (e.g. MAX) awards a load to a mover (e.g. Lenovo), the
-- mover could see TWO tiles for the load: the aggregator's shared row (via the
-- supplier branch) AND its own 'mover_asset' trip. The shared row opens the
-- market/supplier-settlement finance layout (no driver-pay / truck-expense UI),
-- so movers kept landing on the wrong screen. The mover's own asset trip is the
-- correct home (left = client receivable, right = driver pay + truck expenses).
--
-- Fix: on the supplier branch only, drop the shared row when the viewer already
-- owns a mover_asset trip linked to the same indent. The aggregator (owner
-- branch) is unaffected — it still sees its own row.
CREATE OR REPLACE FUNCTION public.get_trips_for_org(p_org_id uuid)
 RETURNS SETOF json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT row_to_json(q)
  FROM (
    SELECT DISTINCT ON (tr.id)
      tr.*,
      i.indent_number
    FROM public.trips tr
    LEFT JOIN public.indents i ON i.id = tr.indent_id
    WHERE public.is_org_member(p_org_id)
      AND (
        tr.organization_id = p_org_id
        OR (
          EXISTS (
            SELECT 1 FROM public.suppliers s
            WHERE s.id = tr.supplier_id
              AND s.linked_organization_id = p_org_id
          )
          -- Hide the shared aggregator row if this org already has its own
          -- asset trip for the same load (avoids the duplicate tile).
          AND NOT EXISTS (
            SELECT 1 FROM public.trips m
            WHERE m.organization_id = p_org_id
              AND m.source = 'mover_asset'
              AND m.source_indent_id = tr.indent_id
              AND m.deleted_at IS NULL
          )
        )
      )
    ORDER BY tr.id, tr.created_at DESC
  ) q
  ORDER BY q.created_at DESC
  LIMIT 400;
$function$;
