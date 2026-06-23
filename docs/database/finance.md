# Database — Finance / Ledger

## transactions table
Double-entry ledger.
```
id, organization_id, trip_id, contact_id, contact_type
party_name, description, amount_in, amount_out
transaction_date, created_by
pod_image_url
```

## Finance Service API
```
getLedgerTransactions(orgId, opts?) → { error, transactions: LedgerRow[] }
getDoubleEntryFromLedgerRow(row) → { debit_account, credit_account, amount }
getProfileImageBatch(driverIds) → { [driverId]: avatarUrl }
```
File: `features/finance/services/finance.service.ts`

## Ledger Flow
```
1. useTransactionsQuery(orgId) fetches ledger rows
2. useFinanceLedger.ts aggregates:
   - Filter by period, category, party, direction
   - Join with trips + drivers for display enrichment
   - Compute totals (amount_in, amount_out, net)
3. LedgerRow displayed in FlashList
4. Add: AddTransactionModal → createTransaction() → DB insert → invalidate
```

## Warning
`useFinanceLedger.ts` has heavy client-side useMemo chains (filtering, sorting, trip detail maps).
Avoid adding more computation here — push to service layer instead.
