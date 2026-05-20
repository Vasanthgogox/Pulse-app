-- Atomic "Add to books": accounting_books + mirrored transactions + trip_messages metadata
-- in one SECURITY DEFINER RPC (reduces round-trips and race conditions).

CREATE TABLE IF NOT EXISTS public.accounting_books (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reference_msg_id  uuid NOT NULL REFERENCES public.trip_messages(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_accounting_books_reference_msg UNIQUE (reference_msg_id)
);

COMMENT ON TABLE public.accounting_books IS
  'One row per chat ledger message booked into org accounting; reference_msg_id is idempotent.';

ALTER TABLE public.accounting_books ENABLE ROW LEVEL SECURITY;

-- No direct authenticated access — reads/writes go through confirm_to_accounting_books only.
CREATE POLICY accounting_books_no_direct_access
  ON public.accounting_books
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.confirm_to_accounting_books(
  p_message_id uuid,
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg record;
  v_trip_id uuid;
  v_conv_id uuid;
  v_meta jsonb;
  v_tx_str text;
  v_tx_id uuid;
  v_amount numeric(12, 2);
  v_is_receiver boolean;
  v_party_name text;
  v_desc text;
  v_new_book_id uuid;
  v_ack timestamptz := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Forbidden: caller is not a member of this organization';
  END IF;

  SELECT
    tm.id,
    tm.conversation_id,
    tm.message_type,
    tm.metadata,
    tc.trip_id
  INTO v_msg
  FROM public.trip_messages tm
  INNER JOIN public.trip_conversations tc ON tc.id = tm.conversation_id
  WHERE tm.id = p_message_id
  FOR UPDATE OF tm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF v_msg.message_type NOT IN ('ledger_event', 'ledger', 'payment', 'ledger_update') THEN
    RAISE EXCEPTION 'Invalid message type for accounting booking';
  END IF;

  v_conv_id := v_msg.conversation_id;
  v_trip_id := v_msg.trip_id;
  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);

  IF NOT (
    btrim(coalesce(v_meta->>'receiver_org_id', '')) = p_org_id::text
    OR btrim(coalesce(v_meta->>'sender_org_id', '')) = p_org_id::text
  ) THEN
    RAISE EXCEPTION 'Privacy Violation: Org not involved in this ledger.';
  END IF;

  v_tx_str := btrim(coalesce(v_meta->>'transaction_id', ''));
  IF v_tx_str = '' THEN
    RAISE EXCEPTION 'Missing transaction_id in ledger metadata';
  END IF;

  BEGIN
    v_tx_id := v_tx_str::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid transaction_id in ledger metadata';
  END;

  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = v_tx_id) THEN
    RAISE EXCEPTION 'Source transaction not found for chat mirror';
  END IF;

  v_amount := (v_meta->>'amount')::numeric;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount in ledger metadata';
  END IF;

  v_is_receiver := btrim(coalesce(v_meta->>'receiver_org_id', '')) = p_org_id::text;

  v_party_name := CASE
    WHEN v_is_receiver THEN nullif(btrim(coalesce(v_meta->>'sender_org_name', '')), '')
    ELSE nullif(btrim(coalesce(v_meta->>'receiver_org_name', '')), '')
  END;
  IF v_party_name IS NULL THEN
    v_party_name := 'Unknown';
  END IF;

  v_desc := concat_ws(
    ' | ',
    nullif(btrim(coalesce(v_meta->>'category', '')), ''),
    'Mode: ' || coalesce(nullif(btrim(coalesce(v_meta->>'payment_mode', '')), ''), 'Cash'),
    CASE
      WHEN nullif(btrim(coalesce(v_meta->>'reference_number', '')), '') IS NOT NULL
        THEN 'UTR: ' || btrim(v_meta->>'reference_number')
    END,
    CASE
      WHEN nullif(btrim(coalesce(v_meta->>'notes', '')), '') IS NOT NULL
        THEN 'Notes: ' || btrim(v_meta->>'notes')
    END,
    'Mirrored from: ' || CASE
      WHEN v_is_receiver THEN coalesce(nullif(btrim(v_meta->>'sender_org_name', ''), ''), 'Partner')
      ELSE coalesce(nullif(btrim(v_meta->>'receiver_org_name', ''), ''), 'Partner')
    END
  );

  INSERT INTO public.accounting_books (trip_id, amount, organization_id, reference_msg_id)
  VALUES (v_trip_id, v_amount, p_org_id, p_message_id)
  ON CONFLICT (reference_msg_id) DO NOTHING
  RETURNING id INTO v_new_book_id;

  IF v_new_book_id IS NULL THEN
    SELECT ab.id INTO v_new_book_id
    FROM public.accounting_books ab
    WHERE ab.reference_msg_id = p_message_id;
  END IF;

  INSERT INTO public.transactions (
    organization_id,
    trip_id,
    party_name,
    description,
    amount_in,
    amount_out,
    transaction_date,
    contact_type,
    contact_id,
    chat_mirror_of_transaction_id
  )
  VALUES (
    p_org_id,
    v_trip_id,
    v_party_name,
    coalesce(v_desc, ''),
    CASE WHEN v_is_receiver THEN v_amount ELSE 0 END,
    CASE WHEN v_is_receiver THEN 0 ELSE v_amount END,
    (v_ack AT TIME ZONE 'UTC')::date,
    NULL,
    NULL,
    v_tx_id
  )
  ON CONFLICT (organization_id, chat_mirror_of_transaction_id)
    WHERE chat_mirror_of_transaction_id IS NOT NULL
  DO NOTHING;

  UPDATE public.trip_messages tm
  SET metadata = jsonb_set(
    jsonb_set(coalesce(tm.metadata, '{}'::jsonb), '{is_booked}', 'true'::jsonb, true),
    '{acknowledged_at}',
    to_jsonb(v_ack),
    true
  )
  WHERE tm.conversation_id = v_conv_id
    AND tm.message_type IN ('ledger_event', 'ledger', 'payment', 'ledger_update')
    AND coalesce(tm.metadata->>'transaction_id', '') = v_tx_str;

  RETURN jsonb_build_object(
    'success', true,
    'book_id', v_new_book_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_to_accounting_books(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_to_accounting_books(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.confirm_to_accounting_books(uuid, uuid) IS
  'Atomically books a ledger chat message: accounting_books row, mirrored transactions row, and is_booked/acknowledged_at on all matching ledger messages in the conversation.';
