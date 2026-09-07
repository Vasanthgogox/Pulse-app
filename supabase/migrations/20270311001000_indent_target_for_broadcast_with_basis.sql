-- indent_target_for_broadcast: also return the rate basis and weight.
--
-- Why: BidSheet falls back to this RPC when the viewer cannot read the indent
-- row directly. It returned supplier_target alone, so a per-MT target arriving
-- through the fallback had no basis or tonnage to expand with and rendered the
-- unit rate as the trip total — the same bug the read path was just fixed for
-- (IND197 Bhandara -> Hosur: ₹3,200/MT shown against a ₹1,24,256 trip).
--
-- weight is returned in KG, exactly as stored on indents.weight; the client
-- converts to tonnes. Both new columns are additive — the existing three
-- columns keep their names, types and order, so an older client that selects
-- only supplier_target is unaffected.
--
-- Auth and broadcast-visibility guards are carried over verbatim: still
-- STABLE SECURITY DEFINER, still returns nothing unless auth.uid() is present
-- AND a post links to the indent. No new data is exposed beyond the shipper's
-- own tonnage and how the target was quoted, both already visible on the
-- broadcast card.

DROP FUNCTION IF EXISTS public.indent_target_for_broadcast(uuid);

CREATE OR REPLACE FUNCTION public.indent_target_for_broadcast(indent_id uuid)
 RETURNS TABLE(
   id uuid,
   organization_id uuid,
   supplier_target numeric,
   supplier_rate_basis text,
   weight numeric
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Only expose the rate when a broadcast post links to this indent.
  IF NOT EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.source_indent_id = indent_target_for_broadcast.indent_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.organization_id,
    i.supplier_target,
    i.supplier_rate_basis,
    i.weight
  FROM public.indents i
  WHERE i.id = indent_target_for_broadcast.indent_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.indent_target_for_broadcast(uuid) TO authenticated;
