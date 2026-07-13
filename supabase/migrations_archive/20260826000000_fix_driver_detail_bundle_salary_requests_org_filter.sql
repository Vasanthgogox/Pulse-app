-- Fix get_driver_detail_bundle: salary_requests was missing organization_id filter,
-- allowing cross-org salary request leakage when a driver_id exists in multiple orgs.
CREATE OR REPLACE FUNCTION public.get_driver_detail_bundle(p_org_id uuid, p_driver_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'driver', (
      SELECT row_to_json(d)
      FROM drivers d
      WHERE d.id = p_driver_id
        AND d.organization_id = p_org_id
      LIMIT 1
    ),
    'ratings', (
      SELECT COALESCE(json_agg(r ORDER BY r.created_at DESC), '[]'::json)
      FROM ratings r
      WHERE r.rated_type = 'driver'
        AND r.rated_id = p_driver_id
    ),
    'salary_requests', (
      SELECT COALESCE(json_agg(sr ORDER BY sr.created_at DESC), '[]'::json)
      FROM driver_salary_requests sr
      WHERE sr.driver_id = p_driver_id
        AND sr.organization_id = p_org_id
    ),
    'ledger', (
      SELECT COALESCE(json_agg(dl ORDER BY dl.created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM driver_ledger
        WHERE driver_id = p_driver_id
        ORDER BY created_at DESC
        LIMIT 200
      ) dl
    ),
    'transactions', (
      SELECT COALESCE(json_agg(t ORDER BY t.transaction_date DESC, t.created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM transactions
        WHERE organization_id = p_org_id
          AND contact_type = 'driver'
          AND contact_id = p_driver_id
        ORDER BY transaction_date DESC, created_at DESC
        LIMIT 500
      ) t
    )
  );
$function$
