-- Ground Ops pickup-side status simulation (Phase B, approved design v2 —
-- supersedes an earlier draft on this branch that invented at_pickup/
-- loading + a separate trip_assignment_audit event; that draft was never
-- pushed and is fully replaced here).
--
-- Reuses the EXISTING business-simulate mechanism byte-for-byte, scoped to
-- only the pickup half of the state machine:
--   - Same two writes TripDetailScreen's handleConfirmSimulate does today:
--     trips.status + trips.status_change_origin = 'business_simulated'
--     (a trigger — fn_trip_status_chat_message_body's caller in
--     20260830210000_location_ping_chat_city_label.sql — reads this origin
--     to post a "(simulated)" trip chat message, then clears it back to
--     NULL itself; this RPC does NOT need to clear it).
--   - Same trips.notes-appended audit line format:
--     [BISIM|{targetStatus}|{isoTimestamp}|{lat}|{lng}|{userName}|{fromStatus}]
--     — parsed by TripDetailScreen's simLogEntries (same file, ~line 1005).
--
-- Only two transitions, ever: {draft,assigned} -> in_progress ("reached
-- pickup"), and in_progress -> in_transit ("loaded, departed"). Never
-- at_drop/completed — those stay exclusive to the full
-- tripops.trips.simulate surface. Ground_ops gets a new, narrower surface
-- (tripops.trips.groundOpsSimulatePickup, added to lib/memberSurfaces.ts in
-- the next commit) — this RPC does not check surfaces itself (surfaces are
-- an app-layer/UI gate), it re-derives authorization independently from
-- platformRole + warehouse assignment, same as every other ground_ops
-- database gate in this feature.
--
-- Before in_transit: every document type listed in
-- organizations.settings.groundOpsMandatoryDocumentTypes must have at least
-- one trip_documents row for this trip. 'pod' (and any pod-like value) is
-- always excluded from the eligible set, even if misconfigured — it is a
-- drop-side document.
--
-- Revoke v1 (last-step only): a companion RPC lets ground_ops undo their
-- own most recent pickup-side simulation, mirroring BISIM_REVOKE, but only
-- for the two edges this feature owns (in_transit -> in_progress,
-- in_progress -> assigned). It refuses to revoke anything it didn't
-- itself simulate (checks the last BISIM line's userName was written by
-- THIS RPC's caller... in practice: checks the last audit line was written
-- within this feature's scope by inspecting trips.status_change_origin
-- history is not kept per-line, so instead this only allows reverting the
-- trip's CURRENT status back to the immediately preceding one in the fixed
-- two-edge table, regardless of who simulated forward — matching how the
-- existing canRevokeLastSimulation check works today (position-based, not
-- actor-based).

BEGIN;

CREATE OR REPLACE FUNCTION public.ground_ops_missing_mandatory_documents(
  p_trip_id uuid,
  p_org_id uuid
)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  -- Unset (key genuinely absent from settings) defaults to ['lr'], matching
  -- GROUND_OPS_MANDATORY_DOCUMENT_TYPES_DEFAULT client-side — an org that
  -- has never opened the Ground Ops settings screen still gets the LR gate,
  -- not an accidental no-op. An explicitly saved empty array ([]) is
  -- honored as "no documents required" — that's a deliberate admin choice,
  -- distinct from "never configured."
  SELECT COALESCE(
    ARRAY(
      SELECT mandatory_type
      FROM jsonb_array_elements_text(
        CASE
          WHEN (SELECT o.settings ? 'groundOpsMandatoryDocumentTypes' FROM public.organizations o WHERE o.id = p_org_id)
            THEN COALESCE((SELECT o.settings -> 'groundOpsMandatoryDocumentTypes' FROM public.organizations o WHERE o.id = p_org_id), '[]'::jsonb)
          ELSE '["lr"]'::jsonb
        END
      ) AS mandatory_type
      WHERE mandatory_type NOT IN ('pod', 'pod_soft', 'soft_pod')  -- never part of this pre-transit gate
        AND NOT EXISTS (
          SELECT 1 FROM public.trip_documents td
          WHERE td.trip_id = p_trip_id
            AND td.document_type = mandatory_type
        )
    ),
    ARRAY[]::text[]
  );
$$;

REVOKE ALL ON FUNCTION public.ground_ops_missing_mandatory_documents(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ground_ops_missing_mandatory_documents(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.simulate_ground_ops_pickup_status(
  p_trip_id uuid,
  p_new_status text  -- 'in_progress' | 'in_transit' only
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trip trips%ROWTYPE;
  v_member organization_members%ROWTYPE;
  v_missing text[];
  v_user_name text;
  v_from_status text;
  v_bisim_entry text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_status NOT IN ('in_progress', 'in_transit') THEN
    RAISE EXCEPTION 'Invalid status for ground_ops pickup simulation: %', p_new_status;
  END IF;

  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  SELECT * INTO v_member
  FROM organization_members
  WHERE organization_id = v_trip.organization_id
    AND user_id = v_uid
    AND status = 'active'
    AND COALESCE(permissions ->> 'platformRole', '') = 'ground_ops';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an active ground_ops member of this trip''s organization can do this';
  END IF;

  -- Same warehouse-membership predicate as trips_ground_ops_select_assigned /
  -- get_trips_for_org (20270917100000 / 20270918100100) — inline, not a
  -- SECURITY DEFINER helper called per row (see that migration's
  -- PERFORMANCE NOTE on the 2026-09-16 outage this avoids repeating). This
  -- RPC runs the check once per call, so the concern doesn't apply the
  -- same way, but the pattern is kept consistent across the feature.
  IF NOT EXISTS (
    SELECT 1
    FROM organization_member_warehouses omw
    JOIN indents i ON i.id = v_trip.indent_id
    WHERE omw.organization_member_id = v_member.id
      AND (
        i.warehouse_id = omw.warehouse_id
        OR EXISTS (
          SELECT 1 FROM sales_orders so
          WHERE so.id = i.sales_order_id
            AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
        )
        OR (
          i.execution_plan_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM shipment_allocations sa
            JOIN sales_order_lines sol ON sol.id = sa.sales_order_line_id
            JOIN sales_orders so2 ON so2.id = sol.sales_order_id
            WHERE sa.execution_plan_id = i.execution_plan_id
              AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'This trip is not at one of your assigned warehouses';
  END IF;

  -- Fixed forward sequence only: {draft,assigned} -> in_progress, in_progress -> in_transit.
  IF p_new_status = 'in_progress' AND v_trip.status NOT IN ('draft', 'assigned') THEN
    RAISE EXCEPTION 'Cannot mark reached-pickup from status %', v_trip.status;
  END IF;
  IF p_new_status = 'in_transit' AND v_trip.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Cannot mark loaded/departed from status %', v_trip.status;
  END IF;

  IF p_new_status = 'in_transit' THEN
    v_missing := public.ground_ops_missing_mandatory_documents(p_trip_id, v_trip.organization_id);
    IF array_length(v_missing, 1) > 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'missing_mandatory_documents',
        'missing_document_types', to_jsonb(v_missing)
      );
    END IF;
  END IF;

  v_from_status := v_trip.status;
  SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Ground Ops') INTO v_user_name
  FROM profiles p WHERE p.id = v_uid;

  v_bisim_entry := '[BISIM|' || p_new_status || '|' || to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    || '||' || '|' || v_user_name || '|' || v_from_status || ']';

  UPDATE trips
  SET
    status = p_new_status,
    status_change_origin = 'business_simulated',
    started_at = CASE WHEN p_new_status = 'in_progress' AND started_at IS NULL THEN now() ELSE started_at END,
    notes = CASE WHEN COALESCE(TRIM(notes), '') = '' THEN v_bisim_entry ELSE notes || E'\n' || v_bisim_entry END,
    updated_at = now()
  WHERE id = p_trip_id;

  RETURN jsonb_build_object('ok', true, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.simulate_ground_ops_pickup_status(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.simulate_ground_ops_pickup_status(uuid, text) TO authenticated;

-- ── Revoke v1: last-step-only, position-based (mirrors existing
-- canRevokeLastSimulation / BISIM_REVOKE semantics — not actor-based) ────
CREATE OR REPLACE FUNCTION public.revoke_ground_ops_pickup_status(
  p_trip_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trip trips%ROWTYPE;
  v_member organization_members%ROWTYPE;
  v_revert_to text;
  v_user_name text;
  v_revoke_entry text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  SELECT * INTO v_member
  FROM organization_members
  WHERE organization_id = v_trip.organization_id
    AND user_id = v_uid
    AND status = 'active'
    AND COALESCE(permissions ->> 'platformRole', '') = 'ground_ops';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an active ground_ops member of this trip''s organization can do this';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM organization_member_warehouses omw
    JOIN indents i ON i.id = v_trip.indent_id
    WHERE omw.organization_member_id = v_member.id
      AND (
        i.warehouse_id = omw.warehouse_id
        OR EXISTS (
          SELECT 1 FROM sales_orders so
          WHERE so.id = i.sales_order_id
            AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
        )
        OR (
          i.execution_plan_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM shipment_allocations sa
            JOIN sales_order_lines sol ON sol.id = sa.sales_order_line_id
            JOIN sales_orders so2 ON so2.id = sol.sales_order_id
            WHERE sa.execution_plan_id = i.execution_plan_id
              AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'This trip is not at one of your assigned warehouses';
  END IF;

  -- Only these two edges are revocable by this feature.
  IF v_trip.status = 'in_transit' THEN
    v_revert_to := 'in_progress';
  ELSIF v_trip.status = 'in_progress' THEN
    v_revert_to := 'assigned';
  ELSE
    RAISE EXCEPTION 'Nothing to revoke from status %', v_trip.status;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Ground Ops') INTO v_user_name
  FROM profiles p WHERE p.id = v_uid;

  -- Byte-compatible with handleRevokeLastSimulation's client-side format:
  -- [BISIM_REVOKE|{fromStatus}|{revertToStatus}|{iso}|{lat}|{lng}|{userName}]
  -- (7 fields; lat/lng left blank — this RPC has no device location).
  v_revoke_entry := '[BISIM_REVOKE|' || v_trip.status || '|' || v_revert_to || '|'
    || to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '||' || '|' || v_user_name || ']';

  UPDATE trips
  SET
    status = v_revert_to,
    -- Matches handleRevokeLastSimulation's revertPayload.status_change_origin
    -- exactly ("business_simulation_revoked", distinct from the forward
    -- transition's "business_simulated") — the chat trigger only appends
    -- "(simulated)" for the latter, and only 'business_simulated' gets
    -- auto-cleared back to NULL by that trigger; leaving this value as-is
    -- matches how the existing client-side revoke leaves it too (no
    -- explicit clear in handleRevokeLastSimulation).
    status_change_origin = 'business_simulation_revoked',
    completed_at = CASE WHEN v_revert_to <> 'completed' THEN NULL ELSE completed_at END,
    started_at = CASE WHEN v_revert_to IN ('pending_acceptance', 'assigned', 'draft') THEN NULL ELSE started_at END,
    notes = CASE WHEN COALESCE(TRIM(notes), '') = '' THEN v_revoke_entry ELSE notes || E'\n' || v_revoke_entry END,
    updated_at = now()
  WHERE id = p_trip_id;

  RETURN jsonb_build_object('ok', true, 'status', v_revert_to);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_ground_ops_pickup_status(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.revoke_ground_ops_pickup_status(uuid) TO authenticated;

-- ── Backfill: grant the new surface to every EXISTING active ground_ops
-- member ──────────────────────────────────────────────────────────────
-- useMemberAccess prefers stored permissions->surfaces over
-- defaultSurfacesForRole whenever the stored map is non-empty (see
-- lib/useMemberAccess.ts). An org member invited/edited before this
-- migration already has a stored surfaces object (e.g.
-- {"tripops.tab":true,"tripops.trips.docs":true,...}) with no
-- "tripops.trips.groundOpsSimulatePickup" key — the new default added to
-- defaultSurfacesForRole's ground_ops case never applies to them, so their
-- UI would never show the new buttons despite the DB-side RPC/RLS being
-- fully live. Confirmed live before writing this: nihas ofc
-- (8f1595bc-94f2-477e-ad96-d5d4dad9378c) has exactly this stale shape.
UPDATE public.organization_members
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{surfaces,tripops.trips.groundOpsSimulatePickup}',
  'true'::jsonb,
  true
)
WHERE status = 'active'
  AND COALESCE(permissions ->> 'platformRole', '') = 'ground_ops'
  AND permissions ? 'surfaces';

COMMIT;
