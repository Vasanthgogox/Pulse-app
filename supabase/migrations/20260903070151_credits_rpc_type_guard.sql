CREATE OR REPLACE FUNCTION public.increment_credit_wallet(
  p_org_id uuid,
  p_type text,
  p_amount bigint,
  p_reference_type text DEFAULT NULL::text,
  p_reference_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS TABLE(balance bigint, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_balance bigint;
  v_tx_id   uuid;
BEGIN
  IF NOT (
    COALESCE(current_setting('app.credit_ledger_internal', true), '') = 'on'
    OR COALESCE(public.has_platform_permission((select auth.uid()), 'credits.issue'), false)
    OR COALESCE((select auth.role()) = 'service_role', false)
  ) THEN
    RAISE EXCEPTION 'unauthorized: credits.issue permission required';
  END IF;

  BEGIN
    INSERT INTO public.pulse_credit_wallets (org_id, balance, lifetime_earned, lifetime_spent)
    VALUES (
      p_org_id,
      GREATEST(p_amount, 0),
      GREATEST(p_amount, 0),
      GREATEST(-p_amount, 0)
    )
    ON CONFLICT (org_id) DO UPDATE SET
      balance         = public.pulse_credit_wallets.balance + p_amount,
      lifetime_earned = public.pulse_credit_wallets.lifetime_earned + GREATEST(p_amount, 0),
      lifetime_spent  = public.pulse_credit_wallets.lifetime_spent + GREATEST(-p_amount, 0),
      updated_at      = now()
    RETURNING public.pulse_credit_wallets.balance INTO v_balance;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'insufficient_credits: wallet balance would go negative for org %', p_org_id;
  END;

  INSERT INTO public.pulse_credit_transactions
    (org_id, type, amount, balance_after, reference_type, reference_id, created_by, notes)
  VALUES
    (p_org_id, p_type, p_amount, v_balance, p_reference_type, p_reference_id, (select auth.uid()), p_notes)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_balance, v_tx_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.increment_credit_wallet(uuid, text, bigint, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_credit_wallet(uuid, text, bigint, text, uuid, text)
  TO authenticated, service_role;

DO $patch$
DECLARE
  v_name   text;
  v_def    text;
  v_marker text := '  PERFORM set_config(''app.credit_ledger_internal'', ''on'', true);';
  v_pos    int;
BEGIN
  FOR v_name IN
    SELECT unnest(ARRAY[
      'publish_reach_campaign',
      'upgrade_reach_campaign',
      'fn_release_reach_referral_escrow',
      'platform_approve_verification'
    ])
  LOOP
    SELECT pg_get_functiondef(p.oid)
      INTO v_def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
     WHERE p.proname = v_name
     LIMIT 1;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'expected function public.% to exist', v_name;
    END IF;

    IF position('app.credit_ledger_internal' in v_def) > 0 THEN
      CONTINUE;
    END IF;

    v_pos := position(E'\nBEGIN\n' in v_def);
    IF v_pos = 0 THEN
      v_pos := position(E'\nbegin\n' in v_def);
    END IF;
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'could not locate body BEGIN for public.%', v_name;
    END IF;

    v_def := left(v_def, v_pos + 6) || v_marker || E'\n' || substr(v_def, v_pos + 7);

    EXECUTE v_def;
    RAISE NOTICE 'patched public.% with credit-ledger delegation flag', v_name;
  END LOOP;
END
$patch$;