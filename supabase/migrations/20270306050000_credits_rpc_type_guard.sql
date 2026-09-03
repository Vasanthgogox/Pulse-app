-- SECURITY: close the transaction-type bypass in increment_credit_wallet().
--
-- The authorization check was scoped to a single value:
--
--   IF p_type = 'admin_adjustment' AND NOT (<permitted>) THEN RAISE ...
--
-- so it never ran for the other seven types the table's CHECK constraint allows
-- (earn_referral, earn_verification, spend_reach, refund, expiry,
-- reserve_referral, referral_refund). Any *authenticated* caller could pass one
-- of those and mint credits into any organization's wallet.
--
-- Verified against the live database before this fix: an ordinary user holding
-- no platform permission, calling with p_type = 'earn_referral', moved a wallet
-- to a balance of 500000 and wrote a matching ledger row. (Rolled back.) anon
-- could not reach it -- 20270306030000 had already revoked that -- so exposure
-- was limited to signed-in users, which is still every account on the platform.
--
-- ── Why the guard is not simply "widen the IF to all types" ──────────────────
-- Four SECURITY DEFINER functions delegate to this one, and two of them
-- (publish_reach_campaign, upgrade_reach_campaign) are invoked by ORDINARY org
-- users spending their own credits; fn_release_reach_referral_escrow and
-- platform_approve_verification likewise move credits on behalf of non-admins.
-- A guard requiring credits.issue for every type would break all four.
--
-- current_user cannot separate those cases. Measured on this database: inside a
-- SECURITY DEFINER function owned by postgres, current_user is 'postgres' and
-- current_setting('role') is still 'authenticated' -- and both read IDENTICALLY
-- whether the function was called directly by a client or nested inside another
-- definer function. There is no ambient signal distinguishing "a trusted
-- function is delegating to me" from "a browser is calling me directly".
--
-- ── The mechanism ────────────────────────────────────────────────────────────
-- An explicit, transaction-scoped capability flag. Each trusted caller sets
-- app.credit_ledger_internal = 'on' via set_config(..., is_local => true) at
-- function entry; increment_credit_wallet accepts that as authorization.
--
-- is_local ties the setting to the surrounding transaction, so it cannot leak
-- across requests on a pooled connection -- it is discarded at commit/rollback.
--
-- A browser client cannot forge it. PostgREST runs each RPC request as a single
-- statement in its own transaction; the caller has no opportunity to execute
-- set_config first. The flag is only ever set inside function bodies, each of
-- which already enforces its own authorization before doing anything.
--
-- The flag is deliberately NOT cleared after the delegated call: two of these
-- functions call increment_credit_wallet more than once, and clearing between
-- calls would fail the second. Its lifetime is the transaction, which for a
-- PostgREST request is exactly the one operation being authorized.
--
-- Direct callers therefore still need credits.issue or service_role -- which is
-- what the admin console uses -- while the four internal callers are unaffected.
--
-- ── How the four callers are patched ─────────────────────────────────────────
-- Their bodies are NOT retyped here. A DO block reads each function's current
-- definition with pg_get_functiondef(), inserts a single PERFORM set_config
-- line immediately after its first bare BEGIN, and re-executes the result. That
-- keeps every other statement -- locking, balance checks, status transitions,
-- audit writes -- byte-identical, which hand-copying four large bodies into a
-- migration would not guarantee. The block is idempotent: it skips any function
-- already carrying the line.
--
-- Everything else in increment_credit_wallet is preserved exactly: the upsert
-- arithmetic, the negative-balance check_violation translated into
-- 'insufficient_credits', the ledger insert with created_by = auth.uid(), and
-- the (balance, transaction_id) return shape.
--
-- The NULL-safety note from the original body still applies and is kept:
-- auth.role() is NULL for a normal authenticated caller, and `false OR NULL` is
-- NULL rather than false, so every operand stays wrapped in COALESCE.

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
  -- Applies to EVERY p_type, not just 'admin_adjustment'.
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

-- ── Patch the four trusted delegating callers ────────────────────────────────
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

    -- Idempotent: leave an already-patched function alone.
    IF position('app.credit_ledger_internal' in v_def) > 0 THEN
      CONTINUE;
    END IF;

    -- Anchor on the FIRST bare BEGIN line (the body's opening BEGIN). Two of
    -- these functions contain nested BEGIN blocks; only the first is the entry.
    v_pos := position(E'\nBEGIN\n' in v_def);
    IF v_pos = 0 THEN
      v_pos := position(E'\nbegin\n' in v_def);
    END IF;
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'could not locate body BEGIN for public.%', v_name;
    END IF;

    -- +7 = past the newline, the 5 characters of BEGIN, and its trailing newline.
    v_def := left(v_def, v_pos + 6) || v_marker || E'\n' || substr(v_def, v_pos + 7);

    EXECUTE v_def;
    RAISE NOTICE 'patched public.% with credit-ledger delegation flag', v_name;
  END LOOP;
END
$patch$;
