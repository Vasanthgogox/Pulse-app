-- Cross-device dismissals for B2B Operations Cockpit (Dynamic Island + web shelf/toast).
-- Realtime INSERT/UPDATE propagates to all sessions; RPC is SECURITY DEFINER with org membership check.

CREATE TABLE IF NOT EXISTS public.b2b_operations_dismissals (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2b_operations_dismissals_pkey PRIMARY KEY (organization_id, alert_key)
);

CREATE INDEX IF NOT EXISTS b2b_operations_dismissals_org_dismissed_at_idx
  ON public.b2b_operations_dismissals (organization_id, dismissed_at DESC);

ALTER TABLE public.b2b_operations_dismissals ENABLE ROW LEVEL SECURITY;

-- Members of the org can read dismissals (Realtime + client hydration).
DROP POLICY IF EXISTS "b2b_operations_dismissals_select_member" ON public.b2b_operations_dismissals;
CREATE POLICY "b2b_operations_dismissals_select_member"
  ON public.b2b_operations_dismissals
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.b2b_operations_dismissals IS
  'Keyed dismissals for synthetic + derived ops alerts (e.g. syn:idle:<trip_id>).';

-- Upsert dismissal; clients pass the same string id used in useGlobalSyncStore.dismissedOperationKeys.
CREATE OR REPLACE FUNCTION public.acknowledge_global_alert(p_alert_key text, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_alert_key IS NULL OR btrim(p_alert_key) = '' THEN
    RAISE EXCEPTION 'invalid alert key';
  END IF;

  INSERT INTO public.b2b_operations_dismissals (organization_id, alert_key, dismissed_at)
  VALUES (p_org_id, btrim(p_alert_key), now())
  ON CONFLICT (organization_id, alert_key) DO UPDATE
    SET dismissed_at = excluded.dismissed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_global_alert(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_global_alert(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_global_alert(text, uuid) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'b2b_operations_dismissals'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.b2b_operations_dismissals';
END;
$$;
