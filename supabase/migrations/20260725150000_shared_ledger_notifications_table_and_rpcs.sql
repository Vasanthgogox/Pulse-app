-- Shared ledger notification center: table + RPCs (docs/SHARED_LEDGER_NOTIFICATIONS_BACKEND_CONTRACT.md).
-- Client: services/sharedLedgerNotificationsService.ts

CREATE TABLE IF NOT EXISTS public.shared_ledger_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_org_id uuid NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  partner_key text NULL,
  trip_id uuid NULL,
  transaction_id text NULL,
  source_dispute_id uuid NULL REFERENCES public.dispute(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  title text NOT NULL,
  subtitle text NULL,
  amount_meta numeric NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL,
  handled_at timestamptz NULL,
  handled_by_user_id uuid NULL,
  CONSTRAINT shared_ledger_notifications_event_type_chk CHECK (
    event_type IN (
      'dispute_received',
      'dispute_status_changed',
      'pending_partner_followup',
      'mismatch_detected',
      'partner_only_ghost'
    )
  ),
  CONSTRAINT shared_ledger_notifications_status_chk CHECK (
    status IN ('open', 'read', 'handled', 'resolved')
  )
);

CREATE INDEX IF NOT EXISTS idx_shared_ledger_notifications_org_created
  ON public.shared_ledger_notifications(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_ledger_notifications_org_status
  ON public.shared_ledger_notifications(organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_ledger_notifications_dedupe_active
  ON public.shared_ledger_notifications(organization_id, dedupe_key, status)
  WHERE dedupe_key IS NOT NULL AND status IN ('open', 'read');

CREATE TRIGGER set_shared_ledger_notifications_updated_at
  BEFORE UPDATE ON public.shared_ledger_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.shared_ledger_notifications IS
  'Dispatcher shared-ledger notification stream; inserts from backend/service_role; members read/update lifecycle.';

ALTER TABLE public.shared_ledger_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_ledger_notifications_select_member
  ON public.shared_ledger_notifications FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY shared_ledger_notifications_update_member
  ON public.shared_ledger_notifications FOR UPDATE
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT ON public.shared_ledger_notifications TO authenticated;
GRANT UPDATE (status, read_at, handled_at, handled_by_user_id, updated_at)
  ON public.shared_ledger_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- RPCs (PostgREST / supabase-js)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_shared_ledger_notifications(
  org_id uuid,
  status_filter text DEFAULT 'all'
)
RETURNS SETOF public.shared_ledger_notifications
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.shared_ledger_notifications s
  WHERE s.organization_id = org_id
    AND public.is_org_member(org_id)
    AND (
      status_filter = 'all'
      OR (status_filter = 'action_required' AND s.status = 'open')
      OR (
        status_filter = 'history'
        AND s.status IN ('read', 'handled', 'resolved')
      )
    )
  ORDER BY s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_ledger_notifications_count(org_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.shared_ledger_notifications s
  WHERE s.organization_id = org_id
    AND public.is_org_member(org_id)
    AND s.status = 'open';
$$;

CREATE OR REPLACE FUNCTION public.mark_shared_ledger_notification_read(
  p_id uuid,
  p_org_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN;
  END IF;
  UPDATE public.shared_ledger_notifications
  SET
    status = 'read',
    read_at = now(),
    updated_at = now()
  WHERE id = p_id
    AND organization_id = p_org_id
    AND status = 'open';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_shared_ledger_notification_handled(
  p_id uuid,
  p_org_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN;
  END IF;
  UPDATE public.shared_ledger_notifications
  SET
    status = 'handled',
    handled_at = now(),
    handled_by_user_id = auth.uid(),
    updated_at = now()
  WHERE id = p_id
    AND organization_id = p_org_id
    AND status IN ('open', 'read');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_ledger_notifications(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_ledger_notifications_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_shared_ledger_notification_read(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_shared_ledger_notification_handled(uuid, uuid) TO authenticated;
