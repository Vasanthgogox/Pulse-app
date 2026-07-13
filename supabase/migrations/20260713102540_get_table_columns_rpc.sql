-- Pulse DBA audit: introspect live table columns for schema compare UI.

CREATE OR REPLACE FUNCTION public.get_table_columns(
  p_schema text,
  p_table  text
)
RETURNS TABLE(
  column_name      text,
  data_type        text,
  udt_name         text,
  is_nullable      text,
  ordinal_position integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public, pg_catalog
AS $$
  SELECT
    c.column_name::text,
    c.data_type::text,
    c.udt_name::text,
    c.is_nullable::text,
    c.ordinal_position::integer
  FROM information_schema.columns c
  WHERE c.table_schema = p_schema
    AND c.table_name = p_table
  ORDER BY c.ordinal_position;
$$;

GRANT EXECUTE ON FUNCTION public.get_table_columns(text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_table_columns(text, text) IS
  'Returns information_schema columns for DBA audit compare (documented schema vs live DB).';
