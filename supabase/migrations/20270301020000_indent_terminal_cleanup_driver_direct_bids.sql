-- WS6 (Gate 4, step 3 of 7): extend the existing terminal-status cleanup
-- trigger (deactivate_posts_for_terminal_indent, from
-- 20260728280000_deactivate_posts_on_indent_terminal_status.sql) to also
-- reject pending driver_direct_bids when an indent transitions to a terminal
-- status. Today it only rejects rows in the org-to-org `bids` table -- a
-- DCO's pending bid on the same underlying indent would otherwise survive
-- silently after the indent is awarded elsewhere or cancelled (Gate 3A
-- Finding A).
--
-- market_bids does not exist yet at this point in the migration sequence
-- (it ships in the next migration) -- its own rejection clause is added
-- there, in the same file that creates the table, rather than guessed here.
--
-- Function body only; the trigger itself (trg_indents_deactivate_linked_posts)
-- is unchanged and does not need to be re-created.

CREATE OR REPLACE FUNCTION public.deactivate_posts_for_terminal_indent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_status := lower(trim(coalesce(NEW.status::text, '')));
  IF NOT (
    v_status = ANY (
      ARRAY['awarded', 'completed', 'cancelled', 'closed', 'expired']::text[]
    )
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.posts p
  SET
    is_active = false,
    updated_at = now()
  WHERE p.source_indent_id = NEW.id
    AND p.is_active = true;

  UPDATE public.bids b
  SET
    status = 'rejected',
    updated_at = now()
  WHERE b.status = 'pending'
    AND b.post_id IN (
      SELECT p.id FROM public.posts p WHERE p.source_indent_id = NEW.id
    );

  -- WS1: a DCO's pending direct bid on any post linked to this indent must
  -- not survive the indent reaching a terminal status.
  UPDATE public.driver_direct_bids ddb
  SET
    status = 'rejected',
    updated_at = now()
  WHERE ddb.status = 'pending'
    AND ddb.post_id IN (
      SELECT p.id FROM public.posts p WHERE p.source_indent_id = NEW.id
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.deactivate_posts_for_terminal_indent() IS
  'On indent awarded/completed/cancelled/closed/expired: deactivate linked LOAD stories and reject pending bids and driver_direct_bids. market_bids rejection is added in 20270301040000, once that table exists.';
