-- Perf: rating_stats previously used three OR-ed predicates
--   (r.rated_id = o.id OR r.rated_id IN (...) OR r.rated_id IN (...))
-- which no index can satisfy, forcing a full scan of public.ratings once per
-- organization in the batch. Rewritten as UNION ALL so each branch is an
-- indexable equality/join. Result shape and values are unchanged.
-- Requires index idx_ratings_rated_id (do NOT drop it).
CREATE OR REPLACE FUNCTION public.get_connection_partner_display_batch(p_linked_organization_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      round(avg(all_ratings.score)::numeric, 2)::numeric(3, 2) AS average_rating,
      count(*)::int AS rating_count
    FROM (
      SELECT r.score
      FROM public.ratings r
      WHERE r.rated_id = o.id

      UNION ALL

      SELECT r.score
      FROM public.ratings r
      JOIN public.clients c ON c.id = r.rated_id
      WHERE c.linked_organization_id = o.id
        AND c.deleted_at IS NULL

      UNION ALL

      SELECT r.score
      FROM public.ratings r
      JOIN public.suppliers s ON s.id = r.rated_id
      WHERE s.linked_organization_id = o.id
        AND s.deleted_at IS NULL
    ) all_ratings
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
$function$;
