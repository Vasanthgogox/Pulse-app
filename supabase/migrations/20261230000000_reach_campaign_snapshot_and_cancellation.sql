-- Reach campaign identity & lifecycle integrity.
--
-- 1) Snapshot columns: campaign cards/detail currently show only a plan
--    badge ("Growth"/"Starter") with zero indication of which load/story was
--    boosted — getReachCampaignsForOrg() never even selected posts columns.
--    Snapshotting the identity fields onto reach_campaigns at publish time
--    means cards/detail render correctly without a live join, AND stay
--    accurate even if the source post is later edited or deleted.
--
-- 2) cancel_reason: distinguishes story-deletion-triggered cancellation from
--    a (future) user-initiated one, reusing the existing 4-value status
--    enum rather than adding a 5th lifecycle state.
--
-- 3) post_id FK: CASCADE -> SET NULL. deactivatePost() normally just
--    soft-deactivates the post (is_active = false), but falls back to a
--    hard DELETE when RLS blocks the update — and ON DELETE CASCADE would
--    silently destroy the reach_campaigns row (and transitively
--    reach_campaign_purchases/reach_events/reach_campaign_daily_metrics,
--    which all cascade from reach_campaigns.id) along with it. A paid
--    campaign's history must survive its source post being deleted.

ALTER TABLE public.reach_campaigns
  ALTER COLUMN post_id DROP NOT NULL;

ALTER TABLE public.reach_campaigns
  DROP CONSTRAINT IF EXISTS reach_campaigns_post_id_fkey;

ALTER TABLE public.reach_campaigns
  ADD CONSTRAINT reach_campaigns_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;

ALTER TABLE public.reach_campaigns
  ADD COLUMN IF NOT EXISTS snapshot_post_type    text,
  ADD COLUMN IF NOT EXISTS snapshot_title        text,
  ADD COLUMN IF NOT EXISTS snapshot_origin       text,
  ADD COLUMN IF NOT EXISTS snapshot_destination  text,
  ADD COLUMN IF NOT EXISTS snapshot_vehicle_type text,
  ADD COLUMN IF NOT EXISTS snapshot_material     text,
  ADD COLUMN IF NOT EXISTS snapshot_content      text,
  ADD COLUMN IF NOT EXISTS snapshot_posted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason         text;

-- Best-effort backfill for existing campaigns from their still-live source
-- post (only fills rows that predate this migration; publish_reach_campaign
-- below writes the snapshot going forward, so this WHERE guard makes the
-- backfill idempotent and never overwrites a real snapshot).
UPDATE public.reach_campaigns rc
SET
  snapshot_post_type    = p.type,
  snapshot_title        = COALESCE(p.material, CASE WHEN p.type = 'LOAD' THEN 'Load' ELSE 'Update' END),
  snapshot_origin       = p.origin,
  snapshot_destination  = p.destination,
  snapshot_vehicle_type = p.vehicle_type,
  snapshot_material     = p.material,
  snapshot_content      = p.content,
  snapshot_posted_at    = p.created_at
FROM public.posts p
WHERE p.id = rc.post_id AND rc.snapshot_title IS NULL;

-- ── publish_reach_campaign — writes the snapshot at publish time ──────────
-- Same signature as 20261226000000_reach_campaign_lifecycle.sql; only the
-- body changes (adds v_post lookup + snapshot columns in the INSERT).

CREATE OR REPLACE FUNCTION public.publish_reach_campaign(
  p_org_id          uuid,
  p_post_id         uuid,
  p_plan_id         uuid,
  p_payment_method  text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan        record;
  v_post        record;
  v_campaign_id uuid;
  v_purchase_id uuid;
  v_status      text;
  v_expires_at  timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the boosting organization';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id AND organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: post % does not belong to org %', p_post_id, p_org_id;
  END IF;

  SELECT * INTO v_plan FROM public.reach_plans WHERE id = p_plan_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: reach plan % is not active', p_plan_id;
  END IF;

  IF p_payment_method NOT IN ('credits', 'money') THEN
    RAISE EXCEPTION 'invalid_payment_method: %', p_payment_method;
  END IF;

  v_expires_at := now() + (v_plan.duration_hours || ' hours')::interval;

  INSERT INTO public.reach_campaigns (
    org_id, post_id, created_by, plan_id, status, published_at, expires_at,
    snapshot_post_type, snapshot_title, snapshot_origin, snapshot_destination,
    snapshot_vehicle_type, snapshot_material, snapshot_content, snapshot_posted_at
  )
  VALUES (
    p_org_id, p_post_id, (select auth.uid()), p_plan_id, 'active', now(), v_expires_at,
    v_post.type,
    COALESCE(v_post.material, CASE WHEN v_post.type = 'LOAD' THEN 'Load' ELSE 'Update' END),
    v_post.origin, v_post.destination, v_post.vehicle_type, v_post.material, v_post.content, v_post.created_at
  )
  RETURNING id INTO v_campaign_id;

  IF p_payment_method = 'credits' THEN
    PERFORM public.increment_credit_wallet(
      p_org_id, 'spend_reach', -v_plan.credit_price,
      'reach_campaign_purchase', v_campaign_id, 'Boost: ' || v_plan.name
    );
    v_status := 'paid';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO public.reach_campaign_purchases
    (campaign_id, plan_id, payment_method, credits_charged, amount_inr_charged, status)
  VALUES (
    v_campaign_id, p_plan_id, p_payment_method,
    CASE WHEN p_payment_method = 'credits' THEN v_plan.credit_price ELSE 0 END,
    CASE WHEN p_payment_method = 'money' THEN v_plan.price_inr ELSE 0 END,
    v_status
  )
  RETURNING id INTO v_purchase_id;

  PERFORM public.emit_platform_event(
    'ReachCampaignPublished', p_org_id,
    jsonb_build_object('campaign_id', v_campaign_id, 'post_id', p_post_id, 'plan_code', v_plan.code, 'payment_method', p_payment_method)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign_id,
    'purchase_id', v_purchase_id,
    'purchase_status', v_status,
    'plan_code', v_plan.code,
    'expires_at', v_expires_at
  );
END;
$$;

-- ── cancel_reach_campaign — new. Draft/active only, no refund logic (see
-- docs/PULSE_GROWTH_PLATFORM.md: campaigns cannot be refunded once
-- activated — a documented policy, not a missing feature). ────────────────

CREATE OR REPLACE FUNCTION public.cancel_reach_campaign(
  p_campaign_id uuid,
  p_reason      text DEFAULT 'user_cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign record;
BEGIN
  SELECT * INTO v_campaign FROM public.reach_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: reach campaign %', p_campaign_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_campaign.org_id AND user_id = (select auth.uid()) AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the boosting organization';
  END IF;

  IF v_campaign.status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'invalid_state: only a draft or active campaign can be cancelled (current: %)', v_campaign.status;
  END IF;

  UPDATE public.reach_campaigns
  SET status = 'cancelled', cancel_reason = p_reason, archived_at = now()
  WHERE id = p_campaign_id;

  PERFORM public.emit_platform_event(
    'ReachCampaignCancelled', v_campaign.org_id,
    jsonb_build_object('campaign_id', p_campaign_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'campaign_id', p_campaign_id, 'status', 'cancelled', 'reason', p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_reach_campaign(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_reach_campaign(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_reach_campaign IS
  'Cancels a draft/active campaign (e.g. its source story was deleted, or the org cancelled it directly). No refund — campaigns cannot be refunded once activated, see docs/PULSE_GROWTH_PLATFORM.md.';
