-- Public wrappers for platform schema RPCs (Supabase Data API / JS client)

CREATE OR REPLACE FUNCTION public.platform_next_canonical_code(
  p_prefix text,
  p_width  int DEFAULT 6
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = platform, pg_catalog
AS $$
  SELECT platform.next_canonical_code(p_prefix, p_width);
$$;

GRANT EXECUTE ON FUNCTION public.platform_next_canonical_code(text, int) TO authenticated, service_role;
