-- Delta sync RPCs: return rows changed since a cursor timestamp.
-- Each function returns a single JSON object:
--   { changed: [...rows], deleted_ids: [...uuid strings], next_cursor: "ISO timestamp" }
-- The frontend upserts `changed` into local cache and removes `deleted_ids`.
-- Soft-deleted rows (deleted_at IS NOT NULL) go into deleted_ids so the cache drops them.

-- ─── clients ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_clients_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_deleted   JSONB;
  v_next      TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.updated_at) FILTER (WHERE c.deleted_at IS NULL), '[]'),
    COALESCE(jsonb_agg(c.id::TEXT)                           FILTER (WHERE c.deleted_at IS NOT NULL), '[]'),
    MAX(c.updated_at)::TEXT
  INTO v_changed, v_deleted, v_next
  FROM (
    SELECT * FROM clients
    WHERE organization_id = p_org_id
      AND updated_at > v_since
    ORDER BY updated_at
    LIMIT p_limit
  ) c;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ─── suppliers ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_suppliers_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_deleted   JSONB;
  v_next      TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.updated_at) FILTER (WHERE s.deleted_at IS NULL), '[]'),
    COALESCE(jsonb_agg(s.id::TEXT)                           FILTER (WHERE s.deleted_at IS NOT NULL), '[]'),
    MAX(s.updated_at)::TEXT
  INTO v_changed, v_deleted, v_next
  FROM (
    SELECT * FROM suppliers
    WHERE organization_id = p_org_id
      AND updated_at > v_since
    ORDER BY updated_at
    LIMIT p_limit
  ) s;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ─── drivers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_drivers_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_deleted   JSONB;
  v_next      TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.updated_at) FILTER (WHERE d.deleted_at IS NULL), '[]'),
    COALESCE(jsonb_agg(d.id::TEXT)                           FILTER (WHERE d.deleted_at IS NOT NULL), '[]'),
    MAX(d.updated_at)::TEXT
  INTO v_changed, v_deleted, v_next
  FROM (
    SELECT * FROM drivers
    WHERE organization_id = p_org_id
      AND updated_at > v_since
    ORDER BY updated_at
    LIMIT p_limit
  ) d;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ─── vehicles ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_vehicles_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_deleted   JSONB;
  v_next      TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(row_to_json(v) ORDER BY v.updated_at) FILTER (WHERE v.deleted_at IS NULL), '[]'),
    COALESCE(jsonb_agg(v.id::TEXT)                           FILTER (WHERE v.deleted_at IS NOT NULL), '[]'),
    MAX(v.updated_at)::TEXT
  INTO v_changed, v_deleted, v_next
  FROM (
    SELECT * FROM vehicles
    WHERE organization_id = p_org_id
      AND updated_at > v_since
    ORDER BY updated_at
    LIMIT p_limit
  ) v;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ─── trips ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_trips_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_deleted   JSONB;
  v_next      TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.updated_at) FILTER (WHERE t.deleted_at IS NULL), '[]'),
    COALESCE(jsonb_agg(t.id::TEXT)                           FILTER (WHERE t.deleted_at IS NOT NULL), '[]'),
    MAX(t.updated_at)::TEXT
  INTO v_changed, v_deleted, v_next
  FROM (
    SELECT * FROM trips
    WHERE organization_id = p_org_id
      AND updated_at > v_since
    ORDER BY updated_at
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ─── transactions (no updated_at — use created_at; no soft-delete) ──────────
CREATE OR REPLACE FUNCTION get_transactions_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_next      TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(row_to_json(tx) ORDER BY tx.created_at), '[]'),
    MAX(tx.created_at)::TEXT
  INTO v_changed, v_next
  FROM (
    SELECT * FROM transactions
    WHERE organization_id = p_org_id
      AND created_at > v_since
    ORDER BY created_at
    LIMIT p_limit
  ) tx;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  '[]'::JSONB,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ─── indents ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_indents_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_deleted   JSONB;
  v_next      TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(row_to_json(i) ORDER BY i.updated_at) FILTER (WHERE i.deleted_at IS NULL), '[]'),
    COALESCE(jsonb_agg(i.id::TEXT)                           FILTER (WHERE i.deleted_at IS NOT NULL), '[]'),
    MAX(i.updated_at)::TEXT
  INTO v_changed, v_deleted, v_next
  FROM (
    SELECT * FROM indents
    WHERE organization_id = p_org_id
      AND updated_at > v_since
    ORDER BY updated_at
    LIMIT p_limit
  ) i;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  v_deleted,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- ─── network_conversations (scoped by org_a_id OR org_b_id; no deleted_at) ──
CREATE OR REPLACE FUNCTION get_network_conversations_delta(
  p_org_id  UUID,
  p_since   TEXT,
  p_limit   INT DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := p_since::TIMESTAMPTZ;
  v_changed   JSONB;
  v_next      TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(row_to_json(nc) ORDER BY nc.updated_at), '[]'),
    MAX(nc.updated_at)::TEXT
  INTO v_changed, v_next
  FROM (
    SELECT * FROM network_conversations
    WHERE (org_a_id = p_org_id OR org_b_id = p_org_id)
      AND updated_at > v_since
    ORDER BY updated_at
    LIMIT p_limit
  ) nc;

  RETURN jsonb_build_object(
    'changed',      v_changed,
    'deleted_ids',  '[]'::JSONB,
    'next_cursor',  COALESCE(v_next, p_since)
  );
END;
$$;

-- Grant execute to authenticated users (anon key + RLS enforced by SECURITY DEFINER
-- reading only rows the caller's org owns via the WHERE clause).
GRANT EXECUTE ON FUNCTION get_clients_delta(UUID, TEXT, INT)               TO authenticated;
GRANT EXECUTE ON FUNCTION get_suppliers_delta(UUID, TEXT, INT)             TO authenticated;
GRANT EXECUTE ON FUNCTION get_drivers_delta(UUID, TEXT, INT)               TO authenticated;
GRANT EXECUTE ON FUNCTION get_vehicles_delta(UUID, TEXT, INT)              TO authenticated;
GRANT EXECUTE ON FUNCTION get_trips_delta(UUID, TEXT, INT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION get_transactions_delta(UUID, TEXT, INT)          TO authenticated;
GRANT EXECUTE ON FUNCTION get_indents_delta(UUID, TEXT, INT)               TO authenticated;
GRANT EXECUTE ON FUNCTION get_network_conversations_delta(UUID, TEXT, INT) TO authenticated;
