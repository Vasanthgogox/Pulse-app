-- DB-authoritative phone busy check for aggregate assign-by-phone flows.
-- SECURITY DEFINER bypasses client-side RLS blind spots across linked org rows.

CREATE OR REPLACE FUNCTION public.get_driver_phone_active_trip(
  p_phone text,
  p_exclude_trip_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last10 text;
  v_trip_id uuid;
  v_trip_number text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('is_busy', false);
  END IF;

  v_last10 := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  IF length(v_last10) < 10 THEN
    RETURN jsonb_build_object('is_busy', false);
  END IF;

  SELECT t.id, coalesce(nullif(trim(t.display_trip_id), ''), t.trip_number)
  INTO v_trip_id, v_trip_number
  FROM public.trips t
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE (p_exclude_trip_id IS NULL OR t.id <> p_exclude_trip_id)
    AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = v_last10
    AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
  ORDER BY t.updated_at DESC
  LIMIT 1;

  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('is_busy', false);
  END IF;

  RETURN jsonb_build_object(
    'is_busy', true,
    'trip_id', v_trip_id,
    'trip_label', coalesce(v_trip_number, 'another active trip')
  );
END;
$$;

COMMENT ON FUNCTION public.get_driver_phone_active_trip(text, uuid) IS
  'Returns whether a phone (last-10 digits) is on another non-terminal trip; SECURITY DEFINER for aggregate allocation busy checks.';

REVOKE ALL ON FUNCTION public.get_driver_phone_active_trip(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_phone_active_trip(text, uuid) TO authenticated;
