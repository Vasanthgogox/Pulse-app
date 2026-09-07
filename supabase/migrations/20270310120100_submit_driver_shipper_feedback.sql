/**
 * Driver rates the shipper (client, else supplier) they just ran.
 * SECURITY DEFINER: assigned driver is usually not a member of the trip org,
 * so they cannot INSERT ratings via RLS.
 *
 * rater_type = driver, rater_id = auth.uid().
 * Version 20270310120100 — must not collide with 20270310120000_award_direct_quote_atomic.
 */
ALTER TABLE public.ratings
  DROP CONSTRAINT IF EXISTS ratings_rater_type_check;

ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_rater_type_check
  CHECK (rater_type IN ('client', 'supplier', 'organization', 'driver'));

COMMENT ON COLUMN public.ratings.rater_type IS
  'client = client rates supplier; supplier = supplier rates driver; organization = fleet rates own driver (asset trip); driver = assigned driver rates the shipper (client or supplier).';

DROP POLICY IF EXISTS ratings_select_when_rater_driver_is_self ON public.ratings;
CREATE POLICY ratings_select_when_rater_driver_is_self
  ON public.ratings
  FOR SELECT
  TO authenticated
  USING (
    rater_type = 'driver'
    AND rater_id = (select auth.uid())
  );

CREATE OR REPLACE FUNCTION public.submit_driver_shipper_feedback(
  p_trip_id uuid,
  p_message_id uuid,
  p_score integer,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_trip public.trips%ROWTYPE;
  v_rated_type text;
  v_rated_id uuid;
  v_linked uuid;
  v_submitted_at text;
  v_existing jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  p_score := GREATEST(1, LEAST(5, p_score));

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF NOT (
    v_trip.driver_id = v_uid
    OR EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = v_trip.driver_id
        AND d.user_id = v_uid
    )
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF v_trip.client_id IS NOT NULL THEN
    v_rated_type := 'client';
    v_rated_id := v_trip.client_id;
    SELECT c.linked_organization_id INTO v_linked
    FROM public.clients c
    WHERE c.id = v_trip.client_id
      AND c.deleted_at IS NULL;
  ELSIF v_trip.supplier_id IS NOT NULL THEN
    v_rated_type := 'supplier';
    v_rated_id := v_trip.supplier_id;
    SELECT s.linked_organization_id INTO v_linked
    FROM public.suppliers s
    WHERE s.id = v_trip.supplier_id
      AND s.deleted_at IS NULL;
  ELSIF v_trip.organization_id IS NOT NULL
        AND NOT public.is_org_member(v_trip.organization_id) THEN
    v_rated_type := 'client';
    v_rated_id := v_trip.organization_id;
  ELSE
    RETURN jsonb_build_object('error', 'shipper_not_linked');
  END IF;

  IF p_message_id IS NOT NULL THEN
    SELECT tm.metadata INTO v_existing
    FROM public.trip_messages tm
    JOIN public.trip_conversations tc ON tc.id = tm.conversation_id
    WHERE tm.id = p_message_id
      AND tc.trip_id = p_trip_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'message_not_found');
    END IF;

    IF (v_existing->>'submitted_at') IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_submitted', true,
        'submitted_at', v_existing->>'submitted_at',
        'submitted_score', (v_existing->>'submitted_score')::int
      );
    END IF;
  END IF;

  INSERT INTO public.ratings (
    organization_id, trip_id, rater_type, rater_id,
    rated_type, rated_id, score, comment, updated_at
  )
  VALUES (
    v_trip.organization_id, p_trip_id, 'driver', v_uid,
    v_rated_type, v_rated_id, p_score,
    NULLIF(TRIM(COALESCE(p_comment, '')), ''),
    now()
  )
  ON CONFLICT (trip_id, rater_type, rater_id, rated_type, rated_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    comment = COALESCE(EXCLUDED.comment, public.ratings.comment),
    updated_at = now();

  IF v_linked IS NULL
     AND v_rated_id IS DISTINCT FROM v_trip.organization_id
     AND v_trip.organization_id IS NOT NULL
     AND NOT public.is_org_member(v_trip.organization_id) THEN
    INSERT INTO public.ratings (
      organization_id, trip_id, rater_type, rater_id,
      rated_type, rated_id, score, comment, updated_at
    )
    VALUES (
      v_trip.organization_id, p_trip_id, 'driver', v_uid,
      'client', v_trip.organization_id, p_score,
      NULLIF(TRIM(COALESCE(p_comment, '')), ''),
      now()
    )
    ON CONFLICT (trip_id, rater_type, rater_id, rated_type, rated_id)
    DO UPDATE SET
      score = EXCLUDED.score,
      comment = COALESCE(EXCLUDED.comment, public.ratings.comment),
      updated_at = now();
  END IF;

  v_submitted_at := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  IF p_message_id IS NOT NULL THEN
    UPDATE public.trip_messages
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'submitted_at', v_submitted_at,
      'submitted_score', p_score,
      'rating', p_score,
      'rating_status', 'rated',
      'rated_party_type', v_rated_type,
      'rated_id', v_rated_id::text
    )
    WHERE id = p_message_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'submitted_at', v_submitted_at,
    'submitted_score', p_score,
    'rated_type', v_rated_type
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_driver_shipper_feedback(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_driver_shipper_feedback(uuid, uuid, integer, text) TO authenticated;

COMMENT ON FUNCTION public.submit_driver_shipper_feedback(uuid, uuid, integer, text) IS
  'Assigned driver rates the trip shipper. Writes public.ratings (rater_type=driver) against the client/supplier CRM id and, when that row is not org-linked, against trips.organization_id so get_connection_partner_display(_batch) averageRating includes it.';
