-- Mirror posted vehicle_ledger_entries into public.transactions for Cash Flow / vehicle P&L.
-- Idempotent via [[VOPS:source_type:source_id]] marker in description.

INSERT INTO public.transactions (
  organization_id,
  trip_id,
  party_name,
  description,
  amount_in,
  amount_out,
  transaction_date,
  contact_id,
  contact_type,
  ledger_entity_type,
  ledger_flow_type,
  ledger_category
)
SELECT
  vle.organization_id,
  vle.trip_id,
  CASE vle.source_type
    WHEN 'fuel' THEN 'Fuel'
    WHEN 'toll' THEN 'Toll'
    WHEN 'manual_adjustment' THEN COALESCE(
      NULLIF(initcap(replace(COALESCE(vle.metadata ->> 'expense_category', 'misc'), '_', ' ')), ''),
      'Other'
    )
    ELSE initcap(replace(vle.source_type, '_', ' '))
  END AS party_name,
  CASE vle.source_type
    WHEN 'fuel' THEN 'FUEL'
    WHEN 'toll' THEN 'TOLL'
    WHEN 'manual_adjustment' THEN
      CASE COALESCE(lower(vle.metadata ->> 'expense_category'), 'misc')
        WHEN 'maintenance' THEN 'MAINTENANCE'
        WHEN 'fastag' THEN 'TOLL'
        ELSE 'OTHER'
      END
    ELSE upper(vle.source_type)
  END
  || ' [[VOPS:' || vle.source_type || ':' || vle.source_id || ']]' AS description,
  0 AS amount_in,
  GREATEST(0, COALESCE(vle.amount, 0)) AS amount_out,
  COALESCE(vle.posted_at::date, CURRENT_DATE) AS transaction_date,
  NULL::uuid AS contact_id,
  NULL::text AS contact_type,
  'vehicle' AS ledger_entity_type,
  'expense' AS ledger_flow_type,
  CASE vle.source_type
    WHEN 'fuel' THEN 'FUEL'
    WHEN 'toll' THEN 'TOLL'
    WHEN 'manual_adjustment' THEN
      CASE COALESCE(lower(vle.metadata ->> 'expense_category'), 'misc')
        WHEN 'maintenance' THEN 'MAINTENANCE'
        WHEN 'fastag' THEN 'TOLL'
        ELSE 'OTHER'
      END
    ELSE 'OTHER'
  END AS ledger_category
FROM public.vehicle_ledger_entries vle
WHERE vle.source_type IN ('fuel', 'toll', 'manual_adjustment')
  AND vle.trip_id IS NOT NULL
  AND COALESCE(vle.amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.transactions tx
    WHERE tx.organization_id = vle.organization_id
      AND tx.trip_id = vle.trip_id
      AND tx.description ILIKE '%[[VOPS:' || vle.source_type || ':' || vle.source_id || ']]%'
  );
