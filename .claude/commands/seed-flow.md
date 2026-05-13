# Seed Indent → Bid → Award → Trip Flow

Supabase project id: `nafxpivddesgsrthmosv`

## Known org/user reference

| Name | org_id | owner_user_id |
|------|--------|---------------|
| aiman logs | c481a15d-c488-4e26-aa03-d77681fb5835 | bf5aa635-26d3-44af-921c-87386b668e5e |
| Deepak Org | b177c614-f146-4d1c-ae80-bcf7aca3f9cd | (query organization_members if needed) |

## Steps — run each SQL via execute_sql, use the returned id for the next step

### Step 1 — Determine next indent number for aiman logs
```sql
SELECT COALESCE(
  'IND' || LPAD(
    (MAX(SUBSTRING(indent_number FROM 4)::int) + 1)::text,
    3, '0'
  ),
  'IND001'
) AS next_number
FROM public.indents
WHERE organization_id = 'c481a15d-c488-4e26-aa03-d77681fb5835'
  AND indent_number ~ '^IND[0-9]+$';
```

### Step 2 — Create indent (use $ARGUMENTS for pickup/drop/price if provided, else sensible defaults)
Defaults: pickup=Delhi NCR, drop=Mumbai Maharashtra, client=MK logistics and transports, client_price=25000, supplier_target=23000, load_type=FTL, pickup_date=CURRENT_DATE
```sql
INSERT INTO public.indents (
  organization_id, indent_number, pickup_area, drop_location,
  client_name, client_price, supplier_target, status,
  pickup_date, load_type, owner_user_id, created_by_user_id
) VALUES (
  'c481a15d-c488-4e26-aa03-d77681fb5835',
  '<next_number from step 1>',
  '<pickup>', '<drop>',
  '<client_name>', <client_price>, <supplier_target>, 'open',
  CURRENT_DATE, '<load_type>',
  'bf5aa635-26d3-44af-921c-87386b668e5e',
  'bf5aa635-26d3-44af-921c-87386b668e5e'
) RETURNING id, indent_number;
```

### Step 3 — Get Deepak Org owner user id (if not known)
```sql
SELECT user_id, role FROM public.organization_members
WHERE organization_id = 'b177c614-f146-4d1c-ae80-bcf7aca3f9cd'
ORDER BY role LIMIT 1;
```

### Step 4 — Create direct_quote (bid) from Deepak Org on that indent
amount should be <= supplier_target from step 2
```sql
INSERT INTO public.direct_quotes (
  indent_id, bidder_organization_id, bidder_user_id,
  amount, status
) VALUES (
  '<indent_id from step 2>',
  'b177c614-f146-4d1c-ae80-bcf7aca3f9cd',
  <amount e.g. 22000>,
  'pending'
) RETURNING id, amount, status;
-- Note: direct_quotes has no bidder_user_id column
```

### Step 5 — Accept the quote (aiman logs accepts Deepak's bid)
```sql
UPDATE public.direct_quotes
SET status = 'accepted', updated_at = now()
WHERE id = '<quote_id from step 4>'
RETURNING id, status;
```

### Step 6 — Create trip from the accepted quote
RPC requires auth.uid() — use manual insert instead when running as service role:
```sql
-- Find or create suppliers row linking bidder org in shipper's org
WITH upserted AS (
  INSERT INTO public.suppliers (organization_id, linked_organization_id, name, is_active, is_verified)
  SELECT '<shipper_org_id>', '<bidder_org_id>',
         COALESCE(NULLIF(TRIM(o.name),''), 'Supplier'), true, false
  FROM public.organizations o WHERE o.id = '<bidder_org_id>'
  ON CONFLICT DO NOTHING RETURNING id
)
SELECT id FROM upserted
UNION ALL
SELECT id FROM public.suppliers
WHERE organization_id = '<shipper_org_id>' AND linked_organization_id = '<bidder_org_id>'
LIMIT 1;

-- Then insert trip using supplier_id from above + data from indent/quote
INSERT INTO public.trips (organization_id, owner_user_id, created_by_user_id,
  trip_number, indent_id, source, pickup_area, drop_location, client_name,
  client_price, supplier_rate, supplier_id, status, pickup_date, load_type,
  platform_fee, driver_commission, payment_status, amount_paid)
VALUES ('<shipper_org_id>', '<owner_user_id>', '<owner_user_id>',
  '', '<indent_id>', 'direct_quote', '<pickup>', '<drop>', '<client_name>',
  <client_price>, <quote_amount>, '<supplier_id from above>',
  'assigned', CURRENT_DATE, '<load_type>', 0, 0, 'pending', 0)
RETURNING id, trip_number, supplier_id;
```

### Step 7 — Verify the trip
```sql
SELECT id, trip_number, status, supplier_id, driver_id,
       pickup_area, drop_location, client_price, supplier_rate
FROM public.trips
WHERE indent_id = '<indent_id from step 2>';
```

## Argument parsing

If `$ARGUMENTS` is provided, parse it as key=value pairs or natural language.
Examples:
- `pickup="Chennai" drop="Pune" price=30000 target=28000`
- `from Deepak at 21000`
- `with driver` → also assign a driver from Deepak org's drivers table

## Future enhancements (add steps when asked)

- **Assign driver**: after step 6, UPDATE trips SET driver_id = (SELECT id FROM drivers WHERE organization_id = 'b177c614...' LIMIT 1)
- **Broadcast indent**: UPDATE indents SET status = 'broadcast', shared_at = now() before step 4
- **Multiple bids**: run step 4 multiple times with different orgs/amounts, then accept the best
- **Trip status progression**: UPDATE trips SET status = 'started' / 'completed'
