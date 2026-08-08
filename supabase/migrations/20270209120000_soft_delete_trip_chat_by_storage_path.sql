-- Soft-delete trip chat media messages when a job-card POD/LR/stage photo is removed.
-- Drivers can INSERT/SELECT trip_messages but often cannot UPDATE is_deleted via RLS;
-- this SECURITY DEFINER RPC is the authorized path for that revoke.

CREATE OR REPLACE FUNCTION public.soft_delete_trip_chat_by_storage_path(
  p_trip_id uuid,
  p_storage_path text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_norm text;
  n integer := 0;
BEGIN
  IF v_uid IS NULL OR p_trip_id IS NULL OR v_path = '' THEN
    RETURN 0;
  END IF;

  -- Strip accidental bucket prefixes so matching is path-key based.
  v_norm := regexp_replace(
    v_path,
    '^(trip-documents|documents|pod-documents)/',
    ''
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    LEFT JOIN public.drivers d ON d.id = t.driver_id
    WHERE t.id = p_trip_id
      AND (
        d.user_id = v_uid
        OR EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = t.organization_id
            AND om.user_id = v_uid
        )
      )
  ) THEN
    RAISE EXCEPTION 'not authorized to soft-delete chat media for this trip'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.trip_messages tm
  SET is_deleted = true
  FROM public.trip_conversations tc
  WHERE tm.conversation_id = tc.id
    AND tc.trip_id = p_trip_id
    AND coalesce(tm.is_deleted, false) = false
    AND tm.message_type IN ('document_share', 'image', 'document_upload')
    AND regexp_replace(
      coalesce(tm.metadata->>'storage_path', ''),
      '^(trip-documents|documents|pod-documents)/',
      ''
    ) = v_norm;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_trip_chat_by_storage_path(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_trip_chat_by_storage_path(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_trip_chat_by_storage_path(uuid, text) IS
  'Soft-deletes document_share/image/document_upload trip_messages for a storage path after job-card document removal.';
