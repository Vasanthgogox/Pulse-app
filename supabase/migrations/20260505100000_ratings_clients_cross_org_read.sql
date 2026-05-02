-- Let integrated customer org (linked_organization_id) read partner ratings scored against them,
-- and read partner CRM client rows that link to them (for resolving ids in-app).

DROP POLICY IF EXISTS "clients_select_where_linked_to_my_org" ON public.clients;
DROP POLICY IF EXISTS "ratings_select_rated_client_when_linked_to_my_org" ON public.ratings;

CREATE POLICY "clients_select_where_linked_to_my_org"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    linked_organization_id IS NOT NULL
    AND public.is_org_member(linked_organization_id)
  );

CREATE POLICY "ratings_select_rated_client_when_linked_to_my_org"
  ON public.ratings
  FOR SELECT
  TO authenticated
  USING (
    rated_type = 'client'
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = ratings.rated_id
        AND c.linked_organization_id IS NOT NULL
        AND public.is_org_member(c.linked_organization_id)
    )
  );
