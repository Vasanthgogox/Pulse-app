-- direct_quotes: supplier quotes on indents (Load Hub / Submit Registry Bid).
-- Enables "Publish Bid Node" from Network Hub without schema cache error.
-- Optional: indents.assigned_supplier_id / assigned_supplier_rate for accept-quote flow.

-- Indents: add columns for assigned supplier (used when a direct quote is accepted)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'indents' AND column_name = 'assigned_supplier_id'
  ) THEN
    ALTER TABLE public.indents ADD COLUMN assigned_supplier_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'indents' AND column_name = 'assigned_supplier_rate'
  ) THEN
    ALTER TABLE public.indents ADD COLUMN assigned_supplier_rate numeric(12,2);
  END IF;
END
$$;

-- Table: direct_quotes
CREATE TABLE IF NOT EXISTS public.direct_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_id uuid NOT NULL REFERENCES public.indents(id) ON DELETE CASCADE,
  bidder_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  UNIQUE(indent_id, bidder_organization_id)
);

COMMENT ON TABLE public.direct_quotes IS 'Quotes from suppliers on direct-circulation indents (Load Hub / Find Work).';

CREATE INDEX IF NOT EXISTS idx_direct_quotes_indent ON public.direct_quotes(indent_id);
CREATE INDEX IF NOT EXISTS idx_direct_quotes_bidder ON public.direct_quotes(bidder_organization_id);

-- updated_at trigger
CREATE TRIGGER direct_quotes_updated_at
  BEFORE UPDATE ON public.direct_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- On quote accepted: set indent.assigned_supplier_id and assigned_supplier_rate
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
      updated_at = now()
    WHERE id = new.indent_id;
  END IF;
  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.set_indent_assigned_supplier_on_quote_accepted() IS
  'On direct_quotes.status -> accepted: set indent.assigned_supplier_id and assigned_supplier_rate from quote amount.';

CREATE TRIGGER trg_quote_accepted_set_indent_supplier
  AFTER UPDATE OF status ON public.direct_quotes
  FOR EACH ROW
  WHEN (new.status = 'accepted')
  EXECUTE FUNCTION public.set_indent_assigned_supplier_on_quote_accepted();

-- RPC: list direct quotes for an indent with bidder org names (indent owner only)
CREATE OR REPLACE FUNCTION public.get_direct_quotes_with_bidder_names(p_indent_id uuid)
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
  bidder_organization_name text
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
    coalesce(nullif(trim(o.name), ''), 'Supplier') AS bidder_organization_name
  FROM public.direct_quotes dq
  LEFT JOIN public.organizations o ON o.id = dq.bidder_organization_id
  WHERE dq.indent_id = p_indent_id
    AND EXISTS (
      SELECT 1 FROM public.indents i
      JOIN public.organization_members om ON om.organization_id = i.organization_id AND om.user_id = auth.uid()
      WHERE i.id = dq.indent_id
    )
  ORDER BY dq.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_direct_quotes_with_bidder_names(uuid) IS
  'List direct quotes for an indent with bidder org name. Caller must be member of indent org.';

-- RLS
ALTER TABLE public.direct_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bidders can insert own direct quotes"
  ON public.direct_quotes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = direct_quotes.bidder_organization_id AND om.user_id = auth.uid()
  ));

CREATE POLICY "Bidders can select own direct quotes"
  ON public.direct_quotes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = direct_quotes.bidder_organization_id AND om.user_id = auth.uid()
  ));

CREATE POLICY "Bidders can update own direct quotes"
  ON public.direct_quotes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = direct_quotes.bidder_organization_id AND om.user_id = auth.uid()
  ));

CREATE POLICY "Indent owners can read quotes on their indents"
  ON public.direct_quotes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.indents i
    JOIN public.organization_members om ON om.organization_id = i.organization_id AND om.user_id = auth.uid()
    WHERE i.id = direct_quotes.indent_id
  ));

CREATE POLICY "Indent owners can update quotes on their indents"
  ON public.direct_quotes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.indents i
    JOIN public.organization_members om ON om.organization_id = i.organization_id AND om.user_id = auth.uid()
    WHERE i.id = direct_quotes.indent_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.indents i
    JOIN public.organization_members om ON om.organization_id = i.organization_id AND om.user_id = auth.uid()
    WHERE i.id = direct_quotes.indent_id
  ));

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.direct_quotes TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_direct_quotes_with_bidder_names(uuid) TO authenticated;
