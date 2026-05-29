-- Connection invite partner display: trips operated, ratings, tenure.

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
        'tripCount',        coalesce(trip_stats.trip_count, 0),
        'averageRating',    rating_stats.average_rating,
        'ratingCount',      coalesce(rating_stats.rating_count, 0)
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
  ) rating_stats ON true
  WHERE o.id = ANY(p_linked_organization_ids);
$$;

COMMENT ON FUNCTION public.get_connection_partner_display_batch(uuid[]) IS
  'Batch partner display for connection invites: branding, trip_count, average_rating, org tenure. SECURITY DEFINER.';
