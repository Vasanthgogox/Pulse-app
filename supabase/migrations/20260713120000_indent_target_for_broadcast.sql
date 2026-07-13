-- RPC: indent_target_for_broadcast(indent_id)
-- Returns the reference rate (supplier_target / client_price) for a single indent
-- to ANY authenticated org that is bidding on a broadcast linked to that indent.
--
-- Authorization is derived from the broadcast, not from partner relations:
-- a supplier viewing a load broadcast (posts.source_indent_id = indent) may see the
-- supplier_target even when the indent was not circulated to them via
-- market_indents_for_org. Never exposes client_price / client_name / client_id.
-- SECURITY DEFINER so we can read the owner's indent row across orgs.

CREATE OR REPLACE FUNCTION public.indent_target_for_broadcast(indent_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  supplier_target numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    i.supplier_target
  FROM public.indents i
  WHERE i.id = indent_target_for_broadcast.indent_id;
END;
$$;

COMMENT ON FUNCTION public.indent_target_for_broadcast(uuid) IS
  'BidSheet: supplier_target for a broadcast-linked indent, visible to any bidding org. Never exposes client_price / client PII.';

REVOKE ALL ON FUNCTION public.indent_target_for_broadcast(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.indent_target_for_broadcast(uuid) TO authenticated;
