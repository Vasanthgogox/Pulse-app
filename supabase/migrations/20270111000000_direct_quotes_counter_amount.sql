-- Counter-offer on live bids: owner proposes a target rate while quote stays pending
-- (award still accepts pending quotes). UI shows COUNTERED when counter_amount IS NOT NULL.

ALTER TABLE public.direct_quotes
  ADD COLUMN IF NOT EXISTS counter_amount numeric(12, 2);

COMMENT ON COLUMN public.direct_quotes.counter_amount IS
  'Owner counter-offer amount (INR). Null = none. Quote status remains pending until award/reject.';

ALTER TABLE public.direct_quotes
  DROP CONSTRAINT IF EXISTS direct_quotes_counter_amount_check;

ALTER TABLE public.direct_quotes
  ADD CONSTRAINT direct_quotes_counter_amount_check
  CHECK (counter_amount IS NULL OR counter_amount > 0);

-- Return type gains counter_amount, so CREATE OR REPLACE fails on an existing
-- function ("cannot change return type of existing function"). Drop first.
DROP FUNCTION IF EXISTS public.get_direct_quotes_with_bidder_names(uuid);

CREATE FUNCTION public.get_direct_quotes_with_bidder_names(p_indent_id uuid)
RETURNS TABLE (
  id uuid,
  indent_id uuid,
  bidder_organization_id uuid,
  amount numeric,
  notes text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  driver_id uuid,
  vehicle_id uuid,
  bidder_organization_name text,
  counter_amount numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dq.id,
    dq.indent_id,
    dq.bidder_organization_id,
    dq.amount,
    dq.notes,
    dq.status,
    dq.created_at,
    dq.updated_at,
    dq.driver_id,
    dq.vehicle_id,
    coalesce(nullif(trim(o.name), ''), 'Supplier') AS bidder_organization_name,
    dq.counter_amount
  FROM public.direct_quotes dq
  LEFT JOIN public.organizations o ON o.id = dq.bidder_organization_id
  WHERE dq.indent_id = p_indent_id
    AND EXISTS (
      SELECT 1 FROM public.indents i
      JOIN public.organization_members om
        ON om.organization_id = i.organization_id AND om.user_id = auth.uid()
      WHERE i.id = dq.indent_id
    )
  ORDER BY dq.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_direct_quotes_with_bidder_names(uuid) IS
  'List direct quotes for an indent with bidder org name + counter_amount. Caller must be member of indent org.';

GRANT EXECUTE ON FUNCTION public.get_direct_quotes_with_bidder_names(uuid) TO authenticated;
