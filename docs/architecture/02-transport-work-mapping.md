# Transport Work — Mapping Matrix

Maps `01-transport-work-v1.md` concepts onto current implementation reality. This is the migration guide — it changes frequently as implementation evolves, unlike the frozen constitution it maps against.

| Future Concept | Current Reality |
|---|---|
| Transport Work | No single record. Spans `indents` (pending→quoted→awarded) **or** `posts`+`bids`+`direct_quotes` (marketplace), stitched to `trips` only via FK chains (`post.source_indent_id → indent → trip`) |
| Request + Planning | Lives on `indents` for the direct-supplier path, but on `posts` for the marketplace path — two separate tables today, not one, even before Capacity branches |
| Capacity | `indents.assigned_supplier_id` (direct assignment) **or** `bids`/`direct_quotes.status` (marketplace) — two separate mechanisms, no shared abstraction |
| Dispatch | `allocationWizardSteps.ts` (trip path) **or** `indentAllocationWizardSteps.ts` (indent path) — duplicated wizards, three separately-defined allocation-result shapes |
| Execution | `trips.status = 'started'` |
| Delivery | POD is a column (`pod_image_url`) on the `transactions` ledger row — not its own record |
| Settlement | `invoices` + `supplier_bills` + `transactions` |

See `03-transport-work-gap-analysis.md` for what this mapping implies is already good, duplicated, or missing.
