-- After INSERT on transactions: post ledger_event to the matching trip conversation (SECURITY DEFINER).
-- Mirrors via send_trip_chat_message like the mobile app — guaranteed even when clients cannot read peer org.rows (RLS).
-- Failures never roll back the transaction row (EXCEPTION → WARNING).

CREATE OR REPLACE FUNCTION public.fn_broadcast_transactions_ledger_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ct            text;
  v_linked_org    uuid;
  v_party_label   text;
  v_sender_name   text;
  v_recv_name     text;
  v_conv_id       uuid;
  v_amount        numeric;
  v_flow          text;
  v_category      text;
  v_mode          text := 'Cash';
  v_meta          jsonb;
  v_content       text;
  v_amount_plain  text;
BEGIN
  v_ct := lower(coalesce(NEW.contact_type, ''));

  IF NEW.trip_id IS NULL OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_ct NOT IN ('client', 'supplier') THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.amount_in, 0) <= 0 AND coalesce(NEW.amount_out, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.trip_messages tm
    WHERE tm.message_type = 'ledger_event'
      AND coalesce(tm.metadata->>'transaction_id', '') = NEW.id::text
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF v_ct = 'client' THEN
      SELECT c.linked_organization_id,
             trim(coalesce(nullif(trim(c.name), ''), ''))
        INTO v_linked_org, v_party_label
      FROM public.clients c
      WHERE c.id = NEW.contact_id
      LIMIT 1;
    ELSE
      SELECT s.linked_organization_id,
             trim(coalesce(
               nullif(trim(s.company_name), ''),
               nullif(trim(s.name), ''),
               ''
             ))
        INTO v_linked_org, v_party_label
      FROM public.suppliers s
      WHERE s.id = NEW.contact_id
      LIMIT 1;
    END IF;

    IF v_linked_org IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT trim(coalesce(o.name, '')) INTO v_sender_name
    FROM public.organizations o
    WHERE o.id = NEW.organization_id
    LIMIT 1;

    SELECT trim(coalesce(o.name, '')) INTO v_recv_name
    FROM public.organizations o
    WHERE o.id = v_linked_org
    LIMIT 1;

    IF v_sender_name = '' THEN
      v_sender_name := NEW.organization_id::text;
    END IF;

    IF v_recv_name = '' THEN
      v_recv_name := coalesce(nullif(v_party_label, ''), v_linked_org::text);
    END IF;

    IF coalesce(NEW.amount_in, 0) > 0 THEN
      v_flow := 'in';
      v_amount := NEW.amount_in;
    ELSE
      v_flow := 'out';
      v_amount := NEW.amount_out;
    END IF;

    v_category := trim(coalesce(nullif(trim(NEW.ledger_category), ''), 'Payment'));

    IF NEW.description ILIKE '%Mode: Cash%' THEN
      v_mode := 'Cash';
    ELSIF NEW.description ILIKE '%Mode: UPI%' THEN
      v_mode := 'UPI';
    ELSIF NEW.description ILIKE '%Mode: Bank Transfer%' THEN
      v_mode := 'Bank Transfer';
    ELSIF NEW.description ILIKE '%Mode: Cheque%' THEN
      v_mode := 'Cheque';
    END IF;

    v_amount_plain := trim(to_char(round(v_amount, 2), 'FM999999999999990999999'));

    IF v_flow = 'in' THEN
      v_content :=
        format('%s received ₹%s · %s', v_sender_name, v_amount_plain, v_category);
    ELSE
      v_content :=
        format('%s paid ₹%s to %s · %s', v_sender_name, v_amount_plain, v_recv_name, v_category);
    END IF;

    v_meta := jsonb_build_object(
      'transaction_id', NEW.id::text,
      'amount', round(v_amount::numeric, 2),
      'flow', v_flow,
      'category', v_category,
      'payment_mode', v_mode,
      'reference_number', NULL,
      'notes', NULL,
      'sender_org_id', NEW.organization_id::text,
      'sender_org_name', v_sender_name,
      'receiver_org_id', v_linked_org::text,
      'receiver_org_name', v_recv_name,
      'acknowledged_at', NULL::text,
      'disputed', false
    );

    IF v_ct = 'client' THEN
      SELECT tc.id INTO v_conv_id
      FROM public.trip_conversations tc
      WHERE tc.organization_id = NEW.organization_id
        AND tc.trip_id = NEW.trip_id
        AND tc.party_type = 'client'
        AND tc.client_id = NEW.contact_id
      LIMIT 1;
    ELSE
      SELECT tc.id INTO v_conv_id
      FROM public.trip_conversations tc
      WHERE tc.organization_id = NEW.organization_id
        AND tc.trip_id = NEW.trip_id
        AND tc.party_type = 'supplier'
        AND tc.supplier_id = NEW.contact_id
      LIMIT 1;
    END IF;

    IF v_conv_id IS NULL THEN
      RAISE WARNING 'ledger_chat: no conversation for trip % party % contact % org %',
        NEW.trip_id, v_ct, NEW.contact_id, NEW.organization_id;
      RETURN NEW;
    END IF;

    PERFORM public.send_trip_chat_message(
      v_conv_id,
      v_content,
      'system',
      'Payment System',
      NULL,
      'ledger_event',
      v_meta
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'ledger_chat trigger failed tx %:%', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_broadcast_transactions_ledger_chat IS
  'Posts ledger_event chat message (+ mirror) after transactions insert when trip + linked client/supplier.';

DROP TRIGGER IF EXISTS trg_transactions_broadcast_ledger_chat ON public.transactions;

CREATE TRIGGER trg_transactions_broadcast_ledger_chat
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_broadcast_transactions_ledger_chat();
