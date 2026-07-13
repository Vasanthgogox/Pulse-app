-- Partner display: expose owner signup (profiles.created_at) and org tenure for network profiles.
-- Applied on remote as version 20261128000003; retained here for local db reset parity.

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
  'Batch partner display: branding, trip_count, average_rating, org tenure, owner signup. SECURITY DEFINER.';

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
    'ownerSignedUpAt',  p.created_at
  )
  FROM  public.organizations o
  JOIN  public.profiles p ON p.id = o.owner_id
  WHERE o.id = p_linked_organization_id;
$$;

COMMENT ON FUNCTION public.get_connection_partner_display(uuid) IS
  'Linked org display profile including orgCreatedAt and ownerSignedUpAt for tenure. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_connection_partner_display_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display(uuid) TO authenticated;
