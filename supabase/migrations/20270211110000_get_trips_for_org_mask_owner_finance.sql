-- Seal cross-tenant finance leak in public.get_trips_for_org.
--
-- PROBLEM
-- The previous definition selected `tr.*` while declared STABLE SECURITY
-- DEFINER. SECURITY DEFINER runs the body as the function owner, so row-level
-- security on public.trips was never applied, and the SELECT list placed no
-- column-level restriction on the result. The function is also readable by any
-- org that is merely the *supplier* on a trip (the supplier branch of the WHERE
-- clause below), so a linked supplier org received the trip OWNER's private
-- commercial data.
--
-- Observed: org AERO, acting only as supplier on trip
-- c0eacf17-3c78-4930-b488-e2bc6c050e11 (owner: SpaceXLogistics), could read
-- client_price = 45000.00 and margin = 5000.00 — i.e. the owner's revenue and
-- the exact markup taken on AERO itself. margin is the most sensitive field
-- here: it discloses the owner's cut on that specific supplier, per trip.
--
-- FIX
-- Enumerate every column explicitly and wrap the seven owner-only finance
-- columns in `CASE WHEN tr.organization_id = p_org_id`, so they resolve to NULL
-- for a caller that is only the supplier.
--
-- SAFETY PROPERTIES
--   * Row visibility is UNCHANGED. The WHERE clause is copied byte-for-byte
--     from the previous definition (same is_org_member gate, same supplier
--     branch, same mover_asset exclusion). This migration can only narrow
--     column visibility; it cannot expose any additional row.
--   * No columns are dropped. All 73 columns of public.trips as of this
--     migration are listed below — 7 masked, 66 passed through — plus the
--     pre-existing i.indent_number. Verified against
--     information_schema.columns. An earlier draft listed only 27 columns and
--     would have silently broken the owner UI.
--   * client_name is deliberately NOT masked: on a supplier-visible trip it is
--     the SHIPPER's name, which the supplier legitimately needs, and
--     get_shipper_display_names_for_supplier_trips already governs that label.
--   * supplier_rate, advance_paid, supplier_id and supplier_trip_sequence are
--     deliberately NOT masked: those are the supplier's own agreed terms.
--
-- FOLLOW-UPS (separate tickets, intentionally not addressed here)
--   * supplierRowToTripRow in types/trip-views.ts still pads absent fields with
--     0 / '' / 'pending', which is why the UI shows "Awaiting data" next to a
--     real rupee figure. Fixing it requires widening TripRow to accept null.
--   * Ledger Sync reads supplier trips through two contradictory paths
--     (get_trips_for_org and get_trips_where_org_is_supplier) and should be
--     routed through the supplier-safe view only.

CREATE OR REPLACE FUNCTION public.get_trips_for_org(p_org_id uuid)
RETURNS SETOF json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT row_to_json(q)
  FROM (
    SELECT DISTINCT ON (tr.id)
      -- ---- Owner-only finance: NULL when the caller is only the supplier ----
      CASE WHEN tr.organization_id = p_org_id THEN tr.client_price      END AS client_price,
      CASE WHEN tr.organization_id = p_org_id THEN tr.margin            END AS margin,
      CASE WHEN tr.organization_id = p_org_id THEN tr.platform_fee      END AS platform_fee,
      CASE WHEN tr.organization_id = p_org_id THEN tr.driver_commission END AS driver_commission,
      CASE WHEN tr.organization_id = p_org_id THEN tr.amount_paid       END AS amount_paid,
      CASE WHEN tr.organization_id = p_org_id THEN tr.payment_status    END AS payment_status,
      CASE WHEN tr.organization_id = p_org_id THEN tr.client_id         END AS client_id,

      -- ---- Identity / ownership ----
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

      -- ---- Route / load ----
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

      -- ---- Parties (client_name = shipper name; supplier needs it) ----
      tr.client_name,
      tr.supplier_id,
      tr.supplier_trip_sequence,

      -- ---- Supplier's own commercial terms ----
      tr.supplier_rate,
      tr.advance_paid,
      tr.is_guaranteed,
      tr.trip_payout_mode,

      -- ---- Assignment ----
      tr.driver_id,
      tr.vehicle_id,
      tr.owner_vehicle_id,
      tr.driver_display_name,
      tr.vehicle_display_number,

      -- ---- Lifecycle ----
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

      -- ---- Actors ----
      tr.owner_user_id,
      tr.created_by_user_id,
      tr.assigned_by_user_id,

      -- ---- Telemetry / odometer ----
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

      -- ---- Indent / marketplace lineage ----
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
