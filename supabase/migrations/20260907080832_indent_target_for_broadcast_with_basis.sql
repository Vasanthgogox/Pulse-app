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
