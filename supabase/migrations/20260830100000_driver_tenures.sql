-- ─────────────────────────────────────────────────────────────────────────────
-- Driver Tenure History
--
-- Problem: when a driver disconnects and reconnects, a second `drivers` row can
-- be created for the same person, causing duplicates in the fleet list.
--
-- Solution:
--   1. `driver_tenures` table – records every connect/disconnect period per driver.
--   2. Trigger – auto-opens / closes a tenure when `left_at` changes.
--   3. RPC `get_driver_tenures` – fetch tenure history for the detail screen.
--   4. RPC `get_driver_previous_rows_by_identity` – find any superseded rows for
--      the same phone/user_id so the fleet list can suppress them.
--   5. Backfill – seed tenures from existing `drivers.created_at` / `left_at`.
--   6. Deduplicate – mark superseded disconnected rows as `tracking_only = true`
--      where an active row for the same identity already exists.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. driver_tenures table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.driver_tenures (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL,
  left_at         timestamptz,
  trip_count      integer     DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_tenures_driver_id
  ON public.driver_tenures(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_tenures_org_id
  ON public.driver_tenures(organization_id);

CREATE INDEX IF NOT EXISTS idx_driver_tenures_org_driver
  ON public.driver_tenures(organization_id, driver_id);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.driver_tenures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_view_driver_tenures"
  ON public.driver_tenures
  FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM   public.organization_members om
      WHERE  om.user_id = auth.uid()
    )
  );

-- ── 3. Trigger: auto-record tenure on left_at change ─────────────────────────

CREATE OR REPLACE FUNCTION public.sync_driver_tenure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Driver just left (left_at was NULL, now set)
  IF NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    UPDATE public.driver_tenures
    SET    left_at = NEW.left_at
    WHERE  driver_id = NEW.id
      AND  left_at IS NULL;
  END IF;

  -- Driver reconnected (left_at was set, now cleared)
  IF NEW.left_at IS NULL AND OLD.left_at IS NOT NULL THEN
    -- Close any stale open tenure (safety net)
    UPDATE public.driver_tenures
    SET    left_at = OLD.left_at
    WHERE  driver_id = NEW.id
      AND  left_at IS NULL;

    -- Open a fresh tenure
    INSERT INTO public.driver_tenures (driver_id, organization_id, joined_at, left_at)
    VALUES (NEW.id, NEW.organization_id, now(), NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_tenure ON public.drivers;

CREATE TRIGGER trg_driver_tenure
  AFTER UPDATE ON public.drivers
  FOR EACH ROW
  WHEN (OLD.left_at IS DISTINCT FROM NEW.left_at)
  EXECUTE FUNCTION public.sync_driver_tenure();

-- ── 4. Backfill tenures from existing driver rows ─────────────────────────────

-- Closed tenures (driver has already left)
INSERT INTO public.driver_tenures (driver_id, organization_id, joined_at, left_at)
SELECT
  d.id,
  d.organization_id,
  COALESCE(d.created_at, now()) AS joined_at,
  d.left_at
FROM public.drivers d
WHERE d.left_at IS NOT NULL
  AND COALESCE(d.tracking_only, false) = false
ON CONFLICT DO NOTHING;

-- Open tenures (driver is currently active)
INSERT INTO public.driver_tenures (driver_id, organization_id, joined_at, left_at)
SELECT
  d.id,
  d.organization_id,
  COALESCE(d.created_at, now()) AS joined_at,
  NULL AS left_at
FROM public.drivers d
WHERE d.left_at IS NULL
  AND COALESCE(d.tracking_only, false) = false
ON CONFLICT DO NOTHING;

-- ── 5. Deduplicate existing duplicate driver rows ─────────────────────────────
--
-- When an active row and a disconnected row share the same (org, phone OR user_id),
-- the disconnected row is superseded. We flag it tracking_only=true so it disappears
-- from the fleet list but its trip/ledger history remains intact.

-- By user_id (most reliable identity signal)
UPDATE public.drivers AS old_row
SET    tracking_only = true
FROM   public.drivers AS active_row
WHERE  old_row.organization_id    = active_row.organization_id
  AND  old_row.user_id            IS NOT NULL
  AND  old_row.user_id            = active_row.user_id
  AND  old_row.left_at            IS NOT NULL       -- old row is disconnected
  AND  active_row.left_at         IS NULL           -- active row exists
  AND  old_row.id                 <> active_row.id
  AND  COALESCE(old_row.tracking_only, false) = false;

-- By normalized phone (fallback when user_id is null on old rows)
UPDATE public.drivers AS old_row
SET    tracking_only = true
FROM   public.drivers AS active_row
WHERE  old_row.organization_id    = active_row.organization_id
  AND  old_row.phone              IS NOT NULL
  AND  RIGHT(REGEXP_REPLACE(old_row.phone,    '[^0-9]', '', 'g'), 10)
     = RIGHT(REGEXP_REPLACE(active_row.phone, '[^0-9]', '', 'g'), 10)
  AND  old_row.left_at            IS NOT NULL
  AND  active_row.left_at         IS NULL
  AND  old_row.id                 <> active_row.id
  AND  COALESCE(old_row.tracking_only, false) = false;

-- ── 6. RPC: get_driver_tenures ───────────────────────────────────────────────
--
-- Returns all tenure periods for a driver (current + historical), ordered
-- most-recent first.  The UI uses this for the "Tenure History" section.

CREATE OR REPLACE FUNCTION public.get_driver_tenures(
  p_org_id   uuid,
  p_driver_id uuid
)
RETURNS TABLE (
  id              uuid,
  driver_id       uuid,
  organization_id uuid,
  joined_at       timestamptz,
  left_at         timestamptz,
  trip_count      integer,
  created_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Verify caller belongs to this org
  SELECT
    dt.id, dt.driver_id, dt.organization_id, dt.joined_at, dt.left_at,
    dt.trip_count, dt.created_at
  FROM public.driver_tenures dt
  WHERE dt.driver_id       = p_driver_id
    AND dt.organization_id = p_org_id
    AND dt.organization_id IN (
      SELECT om.organization_id
      FROM   public.organization_members om
      WHERE  om.user_id = auth.uid()
    )
  ORDER BY dt.joined_at DESC;
$$;

-- ── 7. RPC: get_driver_previous_rows_by_identity ─────────────────────────────
--
-- Given an org + active driver row, returns any OTHER driver rows in the same
-- org that match by user_id or normalized phone AND have left_at set.
-- Used by the service deduplication logic.

CREATE OR REPLACE FUNCTION public.get_driver_previous_rows_by_identity(
  p_org_id    uuid,
  p_driver_id uuid
)
RETURNS TABLE (
  id        uuid,
  user_id   uuid,
  phone     text,
  name      text,
  left_at   timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d2.id, d2.user_id, d2.phone, d2.name, d2.left_at, d2.created_at
  FROM   public.drivers d1
  JOIN   public.drivers d2
         ON  d2.organization_id = d1.organization_id
         AND d2.id             <> d1.id
         AND d2.left_at        IS NOT NULL
         AND (
               -- same linked account
               (d1.user_id IS NOT NULL AND d1.user_id = d2.user_id)
               OR
               -- same normalized phone
               (
                 d1.phone IS NOT NULL AND d2.phone IS NOT NULL
                 AND RIGHT(REGEXP_REPLACE(d1.phone, '[^0-9]', '', 'g'), 10)
                   = RIGHT(REGEXP_REPLACE(d2.phone, '[^0-9]', '', 'g'), 10)
               )
             )
  WHERE  d1.id             = p_driver_id
    AND  d1.organization_id = p_org_id
    AND  d1.organization_id IN (
           SELECT om.organization_id
           FROM   public.organization_members om
           WHERE  om.user_id = auth.uid()
         )
  ORDER BY d2.left_at DESC;
$$;
