-- Reach campaign trip identity: snapshot the source indent.
--
-- Problem: campaign cards label a boost with "# TRIP <post_id prefix>". A LOAD
-- story broadcast from an indent carries posts.source_indent_id, but campaigns
-- never snapshotted it — so re-broadcasting the SAME indent creates a new post
-- and the campaign shows a DIFFERENT trip id. The indent is the stable trip
-- identity; the post is just one broadcast of it.
--
-- Fix: snapshot_source_indent_id on reach_campaigns, written at publish time
-- (same snapshot principle as 20261230000000 — never re-read posts after
-- publish), plus a best-effort backfill from still-live source posts.

ALTER TABLE public.reach_campaigns
  ADD COLUMN IF NOT EXISTS snapshot_source_indent_id uuid;

COMMENT ON COLUMN public.reach_campaigns.snapshot_source_indent_id IS
  'Indent behind the boosted LOAD story (posts.source_indent_id) snapshotted at publish time. Stable trip identity across re-broadcasts of the same load; null for UPDATE stories or ad-hoc loads.';

-- Backfill only rows whose source post still exists; idempotent.
UPDATE public.reach_campaigns rc
SET snapshot_source_indent_id = p.source_indent_id
FROM public.posts p
WHERE p.id = rc.post_id
  AND rc.snapshot_source_indent_id IS NULL
  AND p.source_indent_id IS NOT NULL;

-- ── publish_reach_campaign — adds snapshot_source_indent_id to the INSERT.
-- Same signature as 20261230000000; only the body changes.

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
    snapshot_vehicle_type, snapshot_material, snapshot_content, snapshot_posted_at,
    snapshot_source_indent_id
  )
  VALUES (
    p_org_id, p_post_id, (select auth.uid()), p_plan_id, 'active', now(), v_expires_at,
    v_post.type,
    COALESCE(v_post.material, CASE WHEN v_post.type = 'LOAD' THEN 'Load' ELSE 'Update' END),
    v_post.origin, v_post.destination, v_post.vehicle_type, v_post.material, v_post.content, v_post.created_at,
    v_post.source_indent_id
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
