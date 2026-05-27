-- ============================================================================
-- Compliance Documents — fix-on-top of `20260827200000_document_compliance.sql`.
--
-- Why this file exists
-- --------------------
-- The original migration created `entity_documents` + `document_audit_log` +
-- two RPCs (`get_compliance_summary`, `get_expiring_documents`) but
-- referenced a non-existent table name `org_members` in every RLS policy
-- and RPC body. The correct table is `public.organization_members`, and
-- the canonical RLS helper is `public.is_org_member(uuid)`
-- (`20260518070000_security_fix_search_path_and_is_org_member.sql`).
--
-- Per workspace migration rules we DO NOT edit the prior file; instead we
-- drop + recreate the broken policies / RPCs here. We also add several
-- pieces the original file omitted that the wider Compliance & Document
-- Intelligence system depends on:
--   1. `'uploaded'` action in the `document_audit_log.action` CHECK enum
--      (was missing from {created, updated, verified, rejected, replaced,
--       deleted, downloaded}).
--   2. Auto-audit trigger on `entity_documents` so every INSERT / UPDATE /
--      DELETE writes an `document_audit_log` row without the service
--      layer having to remember to do so.
--   3. `is_compliance_blocking(p_vehicle_id, p_driver_id)` RPC — the
--      server-side helper used by `updateTripAssignment` (and siblings)
--      to refuse trip allocation when required vehicle / driver documents
--      are expired or missing. Mirrors the client-side
--      `computeComplianceScore` thresholds.
--   4. `compute_compliance_score(p_entity_type, p_entity_id)` RPC —
--      single source of truth scoring used by dashboards, list views and
--      drill-downs (avoids N+1 client fetches for the heatmap).
--
-- All statements are idempotent (DROP … IF EXISTS, CREATE OR REPLACE) so
-- the file replays cleanly on `supabase db reset`.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recreate RLS policies using the canonical org-membership helper.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org_member_read_write"   ON public.entity_documents;
DROP POLICY IF EXISTS "org_member_read_audit"   ON public.document_audit_log;
DROP POLICY IF EXISTS "org_member_insert_audit" ON public.document_audit_log;

CREATE POLICY "entity_documents_org_member_all"
ON public.entity_documents
FOR ALL
TO authenticated
USING       (public.is_org_member(organization_id))
WITH CHECK  (public.is_org_member(organization_id));

CREATE POLICY "document_audit_log_org_member_select"
ON public.document_audit_log
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

CREATE POLICY "document_audit_log_org_member_insert"
ON public.document_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_member(organization_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add `'uploaded'` to the audit-log action CHECK constraint.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.document_audit_log
  DROP CONSTRAINT IF EXISTS document_audit_log_action_check;

ALTER TABLE public.document_audit_log
  ADD CONSTRAINT document_audit_log_action_check
  CHECK (action IN (
    'created', 'uploaded', 'updated', 'verified', 'rejected',
    'replaced', 'deleted', 'downloaded'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Auto-audit trigger — write a `document_audit_log` row for every change
--    to `entity_documents`. Service layer can still INSERT custom audit
--    rows (e.g. `downloaded`) directly, but the basic create / update /
--    delete / verify / reject / replace lifecycle is automatic.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.entity_documents_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action  text;
  v_old     text;
  v_new     text;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_action := 'created';
    v_old    := NULL;
    v_new    := NEW.status;
    INSERT INTO public.document_audit_log
      (document_id, organization_id, entity_type, entity_id,
       action, actor_id, old_status, new_status)
    VALUES
      (NEW.id, NEW.organization_id, NEW.entity_type, NEW.entity_id,
       v_action, NEW.created_by, v_old, v_new);
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Choose the most specific action label based on what changed.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := CASE NEW.status
        WHEN 'verified' THEN 'verified'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'replaced' THEN 'replaced'
        ELSE 'updated'
      END;
    ELSE
      v_action := 'updated';
    END IF;

    INSERT INTO public.document_audit_log
      (document_id, organization_id, entity_type, entity_id,
       action, actor_id, old_status, new_status,
       notes, metadata)
    VALUES
      (NEW.id, NEW.organization_id, NEW.entity_type, NEW.entity_id,
       v_action, auth.uid(), OLD.status, NEW.status,
       NEW.notes,
       jsonb_build_object(
         'doc_type',     NEW.doc_type,
         'expiry_date',  NEW.expiry_date,
         'storage_path', NEW.storage_path
       ));
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.document_audit_log
      (document_id, organization_id, entity_type, entity_id,
       action, actor_id, old_status, new_status)
    VALUES
      (OLD.id, OLD.organization_id, OLD.entity_type, OLD.entity_id,
       'deleted', auth.uid(), OLD.status, NULL);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS entity_documents_audit ON public.entity_documents;
CREATE TRIGGER entity_documents_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.entity_documents
  FOR EACH ROW EXECUTE FUNCTION public.entity_documents_audit_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Recreate the existing two RPCs with the correct membership check.
--    Bodies are identical to the original migration except `_access` now
--    uses `public.is_org_member`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_compliance_summary(p_org_id uuid)
RETURNS TABLE (
  entity_type   text,
  total_docs    bigint,
  active_docs   bigint,
  expired_docs  bigint,
  expiring_7d   bigint,
  expiring_30d  bigint,
  pending_docs  bigint,
  verified_docs bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    entity_type,
    COUNT(*)                                                            AS total_docs,
    COUNT(*) FILTER (WHERE status = 'active' OR status = 'verified')    AS active_docs,
    COUNT(*) FILTER (
      WHERE status = 'expired'
         OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)
    )                                                                   AS expired_docs,
    COUNT(*) FILTER (
      WHERE expiry_date IS NOT NULL
        AND expiry_date >= CURRENT_DATE
        AND expiry_date <= CURRENT_DATE + INTERVAL '7 days'
        AND status NOT IN ('replaced', 'rejected')
    )                                                                   AS expiring_7d,
    COUNT(*) FILTER (
      WHERE expiry_date IS NOT NULL
        AND expiry_date >= CURRENT_DATE
        AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
        AND status NOT IN ('replaced', 'rejected')
    )                                                                   AS expiring_30d,
    COUNT(*) FILTER (WHERE status = 'pending')                          AS pending_docs,
    COUNT(*) FILTER (WHERE status = 'verified')                         AS verified_docs
  FROM public.entity_documents
  WHERE organization_id = p_org_id
    AND public.is_org_member(p_org_id)
  GROUP BY entity_type;
$$;

CREATE OR REPLACE FUNCTION public.get_expiring_documents(
  p_org_id     uuid,
  p_days_ahead int DEFAULT 30
)
RETURNS TABLE (
  id           uuid,
  entity_type  text,
  entity_id    uuid,
  doc_type     text,
  doc_label    text,
  doc_number   text,
  expiry_date  date,
  days_until   int,
  status       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, entity_type, entity_id, doc_type, doc_label, doc_number, expiry_date,
    (expiry_date - CURRENT_DATE)::int AS days_until,
    status
  FROM public.entity_documents
  WHERE organization_id = p_org_id
    AND expiry_date IS NOT NULL
    AND expiry_date >= CURRENT_DATE - INTERVAL '1 day'
    AND expiry_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval
    AND status NOT IN ('replaced', 'rejected')
    AND public.is_org_member(p_org_id)
  ORDER BY expiry_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_compliance_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expiring_documents(uuid, int) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. `compute_compliance_score(entity_type, entity_id)` — single-entity score.
--
-- Mirrors the TS implementation in `features/compliance/utils/complianceScore.util.ts`:
--   composite = validity * 0.40 + completeness * 0.35 + verification * 0.25
--
-- Required docs (must be kept in sync with `REQUIRED_DOC_TYPES` in TS):
--   vehicle  : rc, insurance, fitness, permit, pollution
--   driver   : license, medical
--   supplier : gst, pan
--
-- Returns a single jsonb so the client can decode without column drift.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_compliance_score(
  p_entity_type text,
  p_entity_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required          text[];
  v_total             int;
  v_active            int;
  v_expired           int;
  v_expiring_7d       int;
  v_expiring_30d      int;
  v_verified          int;
  v_pending           int;
  v_missing           int;
  v_validity          int;
  v_completeness      int;
  v_verification      int;
  v_score             int;
  v_level             text;
BEGIN
  v_required := CASE p_entity_type
    WHEN 'vehicle'      THEN ARRAY['rc','insurance','fitness','permit','pollution']
    WHEN 'driver'       THEN ARRAY['license','medical']
    WHEN 'supplier'     THEN ARRAY['gst','pan']
    WHEN 'organization' THEN ARRAY[]::text[]
    ELSE                       ARRAY[]::text[]
  END;

  SELECT
    COUNT(*)                                                                                   ,
    COUNT(*) FILTER (WHERE status IN ('active','verified'))                                    ,
    COUNT(*) FILTER (
      WHERE status = 'expired'
         OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)
    )                                                                                          ,
    COUNT(*) FILTER (
      WHERE expiry_date IS NOT NULL
        AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        AND status NOT IN ('replaced','rejected')
    )                                                                                          ,
    COUNT(*) FILTER (
      WHERE expiry_date IS NOT NULL
        AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND status NOT IN ('replaced','rejected')
    )                                                                                          ,
    COUNT(*) FILTER (WHERE status = 'verified')                                                ,
    COUNT(*) FILTER (WHERE status = 'pending')
  INTO
    v_total, v_active, v_expired, v_expiring_7d, v_expiring_30d, v_verified, v_pending
  FROM public.entity_documents
  WHERE entity_type = p_entity_type
    AND entity_id   = p_entity_id
    AND status     <> 'replaced';

  v_missing := (
    SELECT COUNT(*)
    FROM unnest(v_required) AS r(doc)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.entity_documents ed
      WHERE ed.entity_type = p_entity_type
        AND ed.entity_id   = p_entity_id
        AND ed.doc_type    = r.doc
        AND ed.status     <> 'replaced'
    )
  );

  v_validity := CASE
    WHEN v_total > 0
      THEN ROUND(((v_total - v_expired)::numeric / v_total) * 100)
    WHEN cardinality(v_required) = 0 THEN 100
    ELSE 0
  END;

  v_completeness := CASE
    WHEN cardinality(v_required) > 0
      THEN ROUND(((cardinality(v_required) - v_missing)::numeric / cardinality(v_required)) * 100)
    ELSE 100
  END;

  v_verification := CASE
    WHEN v_total > 0 THEN ROUND((v_verified::numeric / v_total) * 100)
    ELSE 100
  END;

  v_score := ROUND(v_validity * 0.40 + v_completeness * 0.35 + v_verification * 0.25);

  v_level := CASE
    WHEN v_score >= 90 THEN 'excellent'
    WHEN v_score >= 70 THEN 'good'
    WHEN v_score >= 50 THEN 'warning'
    ELSE                    'critical'
  END;

  RETURN jsonb_build_object(
    'score',              v_score,
    'level',              v_level,
    'validityScore',      v_validity,
    'completenessScore',  v_completeness,
    'verificationScore',  v_verification,
    'breakdown', jsonb_build_object(
      'total',        v_total,
      'active',       v_active,
      'expired',      v_expired,
      'expiring7d',   v_expiring_7d,
      'expiring30d',  v_expiring_30d,
      'verified',     v_verified,
      'pending',      v_pending,
      'missing',      v_missing
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_compliance_score(text, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. `is_compliance_blocking(p_vehicle_id, p_driver_id)` — operational gate.
--
-- Returns `{ blocked: bool, reasons: [{entity_type, entity_id, doc_type,
-- reason, expiry_date}] }`. Called by `updateTripAssignment` and siblings
-- before mutating trip rows, so the client cannot bypass the rule.
--
-- Blocking criteria (kept conservative — extend by ALTER OR REPLACE):
--   • Vehicle: `insurance`, `permit`, `fitness` expired OR missing.
--   • Driver : `license` expired OR missing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_compliance_blocking(
  p_vehicle_id uuid DEFAULT NULL,
  p_driver_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reasons   jsonb := '[]'::jsonb;
  v_vehicle_required CONSTANT text[] := ARRAY['insurance','permit','fitness'];
  v_driver_required  CONSTANT text[] := ARRAY['license'];
  r RECORD;
BEGIN
  IF p_vehicle_id IS NOT NULL THEN
    -- Expired vehicle docs that count as blockers.
    FOR r IN
      SELECT doc_type, expiry_date
      FROM public.entity_documents
      WHERE entity_type = 'vehicle'
        AND entity_id   = p_vehicle_id
        AND doc_type    = ANY (v_vehicle_required)
        AND status     <> 'replaced'
        AND (
          status = 'expired'
          OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)
        )
    LOOP
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'vehicle',
        'entity_id',   p_vehicle_id,
        'doc_type',    r.doc_type,
        'reason',      'expired',
        'expiry_date', r.expiry_date
      );
    END LOOP;

    -- Missing required vehicle docs.
    FOR r IN
      SELECT d AS doc_type
      FROM unnest(v_vehicle_required) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.entity_documents ed
        WHERE ed.entity_type = 'vehicle'
          AND ed.entity_id   = p_vehicle_id
          AND ed.doc_type    = d
          AND ed.status NOT IN ('replaced', 'rejected', 'expired')
      )
    LOOP
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'vehicle',
        'entity_id',   p_vehicle_id,
        'doc_type',    r.doc_type,
        'reason',      'missing',
        'expiry_date', NULL
      );
    END LOOP;
  END IF;

  IF p_driver_id IS NOT NULL THEN
    FOR r IN
      SELECT doc_type, expiry_date
      FROM public.entity_documents
      WHERE entity_type = 'driver'
        AND entity_id   = p_driver_id
        AND doc_type    = ANY (v_driver_required)
        AND status     <> 'replaced'
        AND (
          status = 'expired'
          OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)
        )
    LOOP
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'driver',
        'entity_id',   p_driver_id,
        'doc_type',    r.doc_type,
        'reason',      'expired',
        'expiry_date', r.expiry_date
      );
    END LOOP;

    FOR r IN
      SELECT d AS doc_type
      FROM unnest(v_driver_required) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.entity_documents ed
        WHERE ed.entity_type = 'driver'
          AND ed.entity_id   = p_driver_id
          AND ed.doc_type    = d
          AND ed.status NOT IN ('replaced', 'rejected', 'expired')
      )
    LOOP
      v_reasons := v_reasons || jsonb_build_object(
        'entity_type', 'driver',
        'entity_id',   p_driver_id,
        'doc_type',    r.doc_type,
        'reason',      'missing',
        'expiry_date', NULL
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'blocked', jsonb_array_length(v_reasons) > 0,
    'reasons', v_reasons
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_compliance_blocking(uuid, uuid) TO authenticated;
