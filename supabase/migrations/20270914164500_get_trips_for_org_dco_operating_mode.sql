-- Hub list (`get_trips_for_org`) never projected commercial operating mode.
-- Indent DCO awards have supplier_id NULL + operating_mode = 'DCO', so the
-- Trips hub treated them as Asset. Discriminator is operating_mode only.
-- Do not infer DCO from indent_id, trip_payout_mode, or source.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_trips_for_org(p_org_id uuid)
RETURNS SETOF json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT row_to_json(q)
  FROM (
    SELECT DISTINCT ON (tr.id)
      CASE WHEN tr.organization_id = p_org_id THEN tr.client_price      END AS client_price,
      CASE WHEN tr.organization_id = p_org_id THEN tr.margin            END AS margin,
      CASE WHEN tr.organization_id = p_org_id THEN tr.platform_fee      END AS platform_fee,
      CASE WHEN tr.organization_id = p_org_id THEN tr.driver_commission END AS driver_commission,
      CASE WHEN tr.organization_id = p_org_id THEN tr.amount_paid       END AS amount_paid,
      CASE WHEN tr.organization_id = p_org_id THEN tr.payment_status    END AS payment_status,
      CASE WHEN tr.organization_id = p_org_id THEN tr.client_id         END AS client_id,

      tr.id,
      tr.organization_id,
      tr.trip_number,
      tr.source,
      tr.display_trip_id,
      tr.driver_display_trip_id,
      tr.trip_code,
      tr.trip_operational_code,
      tr.booking_ref,
      tr.sequence_number,

      tr.pickup_area,
      tr.drop_location,
      tr.distance,
      tr.estimated_duration,
      tr.pickup_lat,
      tr.pickup_lon,
      tr.drop_lat,
      tr.drop_lon,
      tr.load_type,
      tr.load_tons,
      tr.notes,

      tr.client_name,
      tr.supplier_id,
      tr.supplier_trip_sequence,

      tr.supplier_rate,
      tr.advance_paid,
      tr.is_guaranteed,
      tr.trip_payout_mode,
      tr.operating_mode,
      tr.dco_payee_id,

      tr.driver_id,
      tr.vehicle_id,
      tr.owner_vehicle_id,
      tr.driver_display_name,
      tr.vehicle_display_number,

      tr.status,
      tr.pickup_date,
      tr.started_at,
      tr.completed_at,
      tr.created_at,
      tr.updated_at,
      tr.deleted_at,
      tr.status_change_origin,
      tr.pod_received_at,
      tr.pod_required,

      tr.owner_user_id,
      tr.created_by_user_id,
      tr.assigned_by_user_id,

      tr.last_location_at,
      tr.last_location_chat_at,
      tr.actual_distance_traveled_km,
      tr.start_odometer_km,
      tr.end_odometer_km,
      tr.odometer_distance_km,
      tr.gps_distance_km,
      tr.distance_discrepancy_km,
      tr.distance_source,
      tr.odometer_verification_state,
      tr.odometer_notes,
      tr.odometer_updated_by,
      tr.odometer_updated_at,

      tr.indent_id,
      tr.source_indent_id,
      tr.source_indent_code,
      tr.indent_reference_code,
      tr.converted_from_indent_at,
      tr.converted_by,
      tr.source_bid_id,

      i.indent_number
    FROM public.trips tr
    LEFT JOIN public.indents i ON i.id = tr.indent_id
    WHERE public.is_org_member(p_org_id)
      AND (
        tr.organization_id = p_org_id
        OR (
          EXISTS (
            SELECT 1 FROM public.suppliers s
            WHERE s.id = tr.supplier_id
              AND s.linked_organization_id = p_org_id
          )
          AND tr.indent_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.trips m
            WHERE m.organization_id = p_org_id
              AND m.source = 'mover_asset'
              AND m.source_indent_id = tr.indent_id
              AND m.deleted_at IS NULL
          )
        )
      )
    ORDER BY tr.id, tr.created_at DESC
  ) q
  ORDER BY q.created_at DESC
  LIMIT 400;
$function$;

COMMIT;
