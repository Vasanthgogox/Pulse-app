-- Partner global average rating from trip-related feedback on linked connections.
--
-- Problems:
-- 1) get_connection_partner_display_batch averaged ratings only where rated_id = org.id,
--    but trip chat feedback stores rated_id as clients/suppliers/drivers CRM ids.
-- 2) confirm_trip_feedback (windowed migration) only stamped trip_messages.metadata
--    and never wrote public.ratings — so averages stayed empty.
-- 3) Single-partner display RPC omitted averageRating / ratingCount.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Restore confirm_trip_feedback → submit_trip_feedback (writes ratings)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_trip_feedback(
  p_msg_id UUID,
  p_rating INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta JSONB;
  v_trip UUID;
  v_org  UUID;
  v_rt   TEXT;
  v_rid  TEXT;
BEGIN
  p_rating := GREATEST(1, LEAST(5, p_rating));

  -- trip_messages has no trip_id column; resolve via context_trip_id or conversation lane.
  SELECT
    tm.metadata,
    COALESCE(tm.context_trip_id, tc.trip_id),
    COALESCE(t.organization_id, tc.organization_id, tm.organization_id)
  INTO v_meta, v_trip, v_org
  FROM public.trip_messages tm
  LEFT JOIN public.trip_conversations tc ON tc.id = tm.conversation_id
  LEFT JOIN public.trips t ON t.id = COALESCE(tm.context_trip_id, tc.trip_id)
  WHERE tm.id = p_msg_id;

  IF v_meta IS NULL OR v_trip IS NULL OR v_org IS NULL THEN
    RETURN jsonb_build_object('error', 'message_not_found');
  END IF;

  -- Caller must belong to the trip-owning org (DEFINER bypasses RLS otherwise).
  IF NOT public.is_org_member(v_org) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  v_rt := lower(trim(v_meta->>'rated_party_type'));
  IF v_rt NOT IN ('client', 'supplier', 'driver') THEN
    RETURN jsonb_build_object('error', 'invalid_metadata');
  END IF;

  v_rid := trim(v_meta->>'rated_id');
  IF v_rid = '' OR v_rid IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_metadata');
  END IF;

  RETURN public.submit_trip_feedback(
    v_org,
    v_trip,
    p_msg_id,
    v_rt,
    v_rid::uuid,
    p_rating,
    ARRAY[]::text[]
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('error', 'invalid_metadata');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_trip_feedback(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.confirm_trip_feedback(UUID, INT) IS
  'One-tap trip chat feedback: loads trip owner org + rated party from metadata, '
  'writes public.ratings via submit_trip_feedback, stamps message metadata.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Backfill ratings from already-submitted trip chat feedback metadata
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.ratings (
  organization_id,
  trip_id,
  rater_type,
  rater_id,
  rated_type,
  rated_id,
  score,
  comment,
  updated_at
)
SELECT
  COALESCE(t.organization_id, tc.organization_id, tm.organization_id),
  COALESCE(tm.context_trip_id, tc.trip_id),
  'organization',
  COALESCE(t.organization_id, tc.organization_id, tm.organization_id),
  lower(trim(tm.metadata->>'rated_party_type')),
  (trim(tm.metadata->>'rated_id'))::uuid,
  GREATEST(
    1,
    LEAST(
      5,
      COALESCE(
        NULLIF(trim(tm.metadata->>'submitted_score'), '')::int,
        NULLIF(trim(tm.metadata->>'rating'), '')::int
      )
    )
  ),
  jsonb_build_object(
    'source', 'trip_chat_feedback_backfill',
    'tags', '[]'::jsonb
  )::text,
  COALESCE(tm.created_at, now())
FROM public.trip_messages tm
LEFT JOIN public.trip_conversations tc ON tc.id = tm.conversation_id
LEFT JOIN public.trips t ON t.id = COALESCE(tm.context_trip_id, tc.trip_id)
WHERE tm.message_type IN ('feedback_request', 'feedback')
  AND (tm.metadata->>'submitted_at') IS NOT NULL
  AND COALESCE(tm.context_trip_id, tc.trip_id) IS NOT NULL
  AND COALESCE(t.organization_id, tc.organization_id, tm.organization_id) IS NOT NULL
  AND lower(trim(COALESCE(tm.metadata->>'rated_party_type', '')))
      IN ('client', 'supplier', 'driver')
  AND NULLIF(trim(tm.metadata->>'rated_id'), '') IS NOT NULL
  AND trim(tm.metadata->>'rated_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND COALESCE(
        NULLIF(trim(tm.metadata->>'submitted_score'), '')::int,
        NULLIF(trim(tm.metadata->>'rating'), '')::int
      ) BETWEEN 1 AND 5
ON CONFLICT (trip_id, rater_type, rater_id, rated_type, rated_id)
DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Partner display: average trip feedback on linked client/supplier (+ org id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_connection_partner_display_batch(
  p_linked_organization_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    jsonb_object_agg(
      o.id::text,
      jsonb_build_object(
        'organizationName', o.name,
        'contactPerson',    p.full_name,
        'phone',            p.phone,
        'email',            p.email,
        'logoUrl',          NULLIF(TRIM(o.logo_url), ''),
        'ownerAvatarUrl',   NULLIF(TRIM(p.avatar_url), ''),
        'orgAvatarSeed',    NULLIF(TRIM(p.avatar_seed), ''),
        'avatarUrl',        COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url),
        'avatarSeed',       NULLIF(TRIM(p.avatar_seed), ''),
        'ownerId',          o.owner_id,
        'orgCreatedAt',     o.created_at,
        'ownerSignedUpAt',  p.created_at,
        'tripCount',        coalesce(trip_stats.trip_count, 0),
        'averageRating',    rating_stats.average_rating,
        'ratingCount',      coalesce(rating_stats.rating_count, 0),
        'verificationStatus', o.verification_status::text,
        'vehicleCount',     coalesce(fleet_stats.vehicle_count, 0),
        'networkIndentCount', coalesce(indent_stats.network_indent_count, 0)
      )
    ),
    '{}'::jsonb
  )
  FROM public.organizations o
  JOIN public.profiles p ON p.id = o.owner_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS trip_count
    FROM public.trips t
    WHERE t.organization_id = o.id
      AND t.deleted_at IS NULL
  ) trip_stats ON true
  LEFT JOIN LATERAL (
    SELECT
      round(avg(r.score)::numeric, 2)::numeric(3, 2) AS average_rating,
      count(*)::int AS rating_count
    FROM public.ratings r
    WHERE r.rated_id = o.id
       OR r.rated_id IN (
         SELECT c.id
         FROM public.clients c
         WHERE c.linked_organization_id = o.id
           AND c.deleted_at IS NULL
       )
       OR r.rated_id IN (
         SELECT s.id
         FROM public.suppliers s
         WHERE s.linked_organization_id = o.id
           AND s.deleted_at IS NULL
       )
  ) rating_stats ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS vehicle_count
    FROM public.vehicles v
    WHERE v.organization_id = o.id
      AND v.deleted_at IS NULL
  ) fleet_stats ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS network_indent_count
    FROM public.indents i
    WHERE i.organization_id = o.id
      AND i.deleted_at IS NULL
      AND (i.status = 'broadcast' OR i.shared_at IS NOT NULL)
  ) indent_stats ON true
  WHERE o.id = ANY(p_linked_organization_ids);
$$;

COMMENT ON FUNCTION public.get_connection_partner_display_batch(uuid[]) IS
  'Batch partner display: branding, stats, KYC, assets, network indents; '
  'averageRating aggregates trip feedback on the org id and linked client/supplier CRM rows.';

CREATE OR REPLACE FUNCTION public.get_connection_partner_display(p_linked_organization_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'organizationName', o.name,
    'contactPerson',    p.full_name,
    'phone',            p.phone,
    'email',            p.email,
    'avatarUrl',        COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url),
    'avatarSeed',       p.avatar_seed,
    'gstin',            o.gstin,
    'address',          NULLIF(TRIM(
                          COALESCE(NULLIF(TRIM(o.address_line), ''), '')
                          || CASE WHEN NULLIF(TRIM(o.city),  '') IS NOT NULL THEN ', ' || TRIM(o.city)  ELSE '' END
                          || CASE WHEN NULLIF(TRIM(o.state), '') IS NOT NULL THEN ', ' || TRIM(o.state) ELSE '' END
                        ), ''),
    'website',          o.profile_website,
    'orgCreatedAt',     o.created_at,
    'ownerSignedUpAt',  p.created_at,
    'verificationStatus', o.verification_status::text,
    'tripCount', (
      SELECT count(*)::int
      FROM public.trips t
      WHERE t.organization_id = o.id
        AND t.deleted_at IS NULL
    ),
    'averageRating', (
      SELECT round(avg(r.score)::numeric, 2)::numeric(3, 2)
      FROM public.ratings r
      WHERE r.rated_id = o.id
         OR r.rated_id IN (
           SELECT c.id
           FROM public.clients c
           WHERE c.linked_organization_id = o.id
             AND c.deleted_at IS NULL
         )
         OR r.rated_id IN (
           SELECT s.id
           FROM public.suppliers s
           WHERE s.linked_organization_id = o.id
             AND s.deleted_at IS NULL
         )
    ),
    'ratingCount', (
      SELECT count(*)::int
      FROM public.ratings r
      WHERE r.rated_id = o.id
         OR r.rated_id IN (
           SELECT c.id
           FROM public.clients c
           WHERE c.linked_organization_id = o.id
             AND c.deleted_at IS NULL
         )
         OR r.rated_id IN (
           SELECT s.id
           FROM public.suppliers s
           WHERE s.linked_organization_id = o.id
             AND s.deleted_at IS NULL
         )
    ),
    'vehicleCount', (
      SELECT count(*)::int
      FROM public.vehicles v
      WHERE v.organization_id = o.id
        AND v.deleted_at IS NULL
    ),
    'networkIndentCount', (
      SELECT count(*)::int
      FROM public.indents i
      WHERE i.organization_id = o.id
        AND i.deleted_at IS NULL
        AND (i.status = 'broadcast' OR i.shared_at IS NOT NULL)
    )
  )
  FROM  public.organizations o
  JOIN  public.profiles p ON p.id = o.owner_id
  WHERE o.id = p_linked_organization_id;
$$;

COMMENT ON FUNCTION public.get_connection_partner_display(uuid) IS
  'Linked org display including KYC, assets, network indents, and connection trip-feedback averageRating.';

GRANT EXECUTE ON FUNCTION public.get_connection_partner_display_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display(uuid) TO authenticated;
