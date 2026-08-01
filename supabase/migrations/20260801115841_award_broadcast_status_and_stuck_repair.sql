-- Award on broadcast indents must be able to flip status (and optionally stamp
-- the winning rate). enforce_indent_draft_broadcast_rules previously blocked
-- ANY commercial-field change while OLD.status = 'broadcast', including the
-- IndentDetailScreen award payload that bundled status='awarded' with a new
-- supplier_target. Postgres applies the whole UPDATE or nothing, so status
-- stayed broadcast after the quote was already accepted.
--
-- Fix:
-- 1) Only lock commercial fields when status remains broadcast.
-- 2) Quote-accept trigger also sets indent.status = 'awarded' so award cannot
--    leave a half-applied state even if the client status update is skipped.
-- 3) Backfill rows that already have an accepted quote + assignee but are
--    still open/broadcast/pending/quoted.

CREATE OR REPLACE FUNCTION public.enforce_indent_draft_broadcast_rules()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'broadcast' AND NEW.shared_at IS NULL THEN
      NEW.shared_at := now();
    END IF;
    IF NEW.status = 'draft' AND NEW.last_saved_at IS NULL THEN
      NEW.last_saved_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'broadcast' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Broadcast indents cannot be reverted to draft'
      USING ERRCODE = '23514';
  END IF;

  -- Lock commercial edits only while the indent stays broadcast. Transitioning
  -- to awarded/completed/cancelled (award path) may stamp the winning rate.
  IF OLD.status = 'broadcast'
     AND NEW.status = 'broadcast'
     AND (
       NEW.pickup_area IS DISTINCT FROM OLD.pickup_area OR
       NEW.drop_location IS DISTINCT FROM OLD.drop_location OR
       NEW.client_name IS DISTINCT FROM OLD.client_name OR
       NEW.client_price IS DISTINCT FROM OLD.client_price OR
       NEW.supplier_target IS DISTINCT FROM OLD.supplier_target OR
       NEW.vehicle_type IS DISTINCT FROM OLD.vehicle_type OR
       NEW.load_type IS DISTINCT FROM OLD.load_type OR
       NEW.pickup_date IS DISTINCT FROM OLD.pickup_date OR
       NEW.circulation_target IS DISTINCT FROM OLD.circulation_target
     ) THEN
    RAISE EXCEPTION 'This indent has been shared and cannot be edited'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status <> 'broadcast' AND NEW.status = 'broadcast' AND NEW.shared_at IS NULL THEN
    NEW.shared_at := now();
  END IF;

  IF NEW.status = 'draft' THEN
    NEW.last_saved_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_indent_assigned_supplier_on_quote_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status = 'accepted' THEN
    UPDATE public.indents
    SET
      assigned_supplier_id = new.bidder_organization_id,
      assigned_supplier_rate = new.amount,
      -- Accepting a quote is the award event. Keep terminal statuses intact.
      status = CASE
        WHEN lower(coalesce(status, '')) IN (
          'awarded', 'completed', 'cancelled', 'closed', 'expired'
        ) THEN status
        ELSE 'awarded'
      END,
      updated_at = now()
    WHERE id = new.indent_id;
  END IF;
  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.set_indent_assigned_supplier_on_quote_accepted() IS
  'On direct_quotes.status -> accepted: assign supplier, stamp rate, and set indent.status to awarded unless already terminal.';

-- Repair half-applied awards: accepted quote + assignee, status still open-ish.
UPDATE public.indents i
SET
  status = 'awarded',
  updated_at = now()
WHERE i.deleted_at IS NULL
  AND lower(coalesce(i.status, '')) IN ('broadcast', 'open', 'pending', 'quoted')
  AND i.assigned_supplier_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.direct_quotes dq
    WHERE dq.indent_id = i.id
      AND dq.status = 'accepted'
      AND dq.bidder_organization_id = i.assigned_supplier_id
  );
