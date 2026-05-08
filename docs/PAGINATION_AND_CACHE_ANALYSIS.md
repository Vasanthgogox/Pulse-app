# Q Mobile: Pagination & Cache Analysis for 10x Performance

This document identifies **which pages need pagination**, **which need caching**, and how to prioritize changes to make the app feel **~10x faster**. It complements [PERFORMANCE_AND_RESPONSIVENESS_AUDIT.md](./PERFORMANCE_AND_RESPONSIVENESS_AUDIT.md).

---

## Executive summary

| Area | Current state | Target |
|------|----------------|--------|
| **Pagination** | No list uses `.range()` / `.limit()`; all list APIs fetch full tables | Add cursor/offset pagination (or at least a cap) on every list screen |
| **Cache** | No React Query/SWR; every focus = full refetch | Add TanStack Query (or similar) with `staleTime` + Realtime invalidation |
| **Duplicate fetches** | Finance 9-way fetch on mount + sub-tab change; Trips mount + focus + Realtime | Single source of truth per query key; refetch only when stale or invalidated |

**Highest impact for effort:** (1) Cache layer, (2) Finance dedup, (3) Pagination on heavy lists.

---

## 1. Pages that need PAGINATION

All list screens currently call services that do **full-table selects** with no `limit` or `range`. For large orgs (hundreds of trips/clients/drivers/transactions), first load is slow and memory use is high.

### 1.1 High priority (large datasets, user-facing lists)

| Page / screen | Route / file | Service / API | Current fetch | Recommendation |
|---------------|--------------|---------------|---------------|----------------|
| **Trips list** | `app/(tabs)/trips.tsx` | `getTripsByOrganization`, `getTransactionsByOrganization`, assignment audit | Full trips + full transactions | Paginate trips (e.g. 50 per page, “Load more”); consider paginating or capping transactions for “received by trip” aggregation |
| **Finance Ledger** | Finance tab → Ledger | `getTransactionsByOrganization` | Full transactions | Paginate ledger (e.g. 50–100 per page, infinite scroll or “Load more”) |
| **Customers (Clients)** | `app/(tabs)/clients.tsx` | `getClientsByOrganization` | Full clients | Paginate (e.g. 50 per page) or at least `.limit(100)` with “Load more” |
| **Indents** | `app/(tabs)/indents.tsx` | `getIndentsByOrganization` | Full indents | Paginate (e.g. 50 per page) |
| **Finance entity tabs** | Finance → Customers / Suppliers / Garage / Drivers | Same as Finance entities (clients, suppliers, vehicles, drivers) | 9-way full fetch in `useFinanceEntities` | Reuse cached lists; if shown as long lists, add pagination or virtualized list |
| **Network (ALL / CLIENT / SUPPLIER / DRIVER)** | `app/(tabs)/network.tsx` | `getClientsByOrganization`, `getSuppliersByOrganization`, `getDriversByOrganization` | Three full lists merged | Paginate each list or cap (e.g. 100 per type) with “Load more” per tab |
| **Load Board modal** | `LoadBoardModal` → indents | `getIndentsByOrganization` | Full indents | Same as Indents: paginate or cap |
| **Driver app – Trips** | `app/(driver)/trips.tsx` | `getTripsByDriverIds` | All trips for driver(s) | Paginate (e.g. 30 per page) |
| **Driver app – Requests** | `app/(driver)/requests.tsx` | Trips + driver invites / ledger | Full trips for driver(s) | Paginate trip list |
| **Driver app – Wallet** | `app/(driver)/wallet.tsx` | `getTripsByDriverIds` | Full trips | Paginate |

### 1.2 Medium priority (list on detail or secondary screens)

| Page / screen | Route / file | Service / API | Recommendation |
|---------------|--------------|---------------|----------------|
| **Resources – Drivers tab** | `features/drivers/components/DriversTab.tsx` | `getDriversByOrganization`, `getTripsByOrganization` | Paginate drivers list (e.g. 50); trips used for assignment counts can stay capped or paginated |
| **Resources – Vehicles** | Vehicles feature (owned vehicles list) | `getVehiclesByOrganization` | Cap or paginate (e.g. 50) |
| **Resources – Suppliers tab** | `features/suppliers/components/SuppliersTab.tsx` | `getSuppliersByOrganization`, `getTripsByOrganization` | Paginate suppliers; cap trips for counts |
| **Home – Customers tab** | `features/clients/components/CustomersTab.tsx` | `getClientsByOrganization`, `getTripsByOrganization` | Same as Customers: paginate clients |
| **Create Indent** | `app/create-indent.tsx` | `getClientsByOrganization` (picker) | Picker: server-side search or paginated client list |
| **Add Trip form** | `features/trips/components/add-trip/AddTripFormFields.tsx` | Clients, drivers, vehicles, trips, suppliers (all full) | Dropdowns: use cached + paginated or search API; avoid 5 full fetches on open |
| **Trip detail – ledger block** | `TripFinanceBlock`, `TripDetailScreen` | `getTransactionsByOrganization` | Often filtered by trip; cap (e.g. 50) or paginate |
| **Client / Supplier / Driver / Vehicle detail** | Various detail screens | Trips + transactions for entity | Paginate “trips for this entity” and “transactions for this entity” |
| **Ledger Sync modal** | `app/(modals)/ledger-sync.tsx` | Clients, suppliers, drivers, vehicles, trips (x2), transactions | Reuse cached entities; paginate or cap any long lists in UI |
| **Connection requests (REQUESTS tab)** | `app/(tabs)/network.tsx` | `getConnectionRequestsReceived`, `getConnectionRequestsSent`, `getDriverInvitesSent` | Typically small; optional cap (e.g. 100) |
| **Driver passbook** | `app/(driver)/passbook/[orgId].tsx`, history | `getTripsByDriver`, ledger | Paginate trips and ledger entries per org |
| **Salary requests** | Finance / drivers | `getSalaryRequestsByOrganization` | Cap (e.g. 50) if ever large |

### 1.3 Services to extend (pagination contract)

Add optional `page`/`limit` or cursor to these service functions so screens can request one page at a time:

| Service | Function | Suggested signature addition |
|---------|----------|------------------------------|
| `features/trips/services/trips.service.ts` | `getTripsByOrganization` | `opts?: { limit?: number; offset?: number }` or cursor |
| `features/finance/services/finance.service.ts` | `getTransactionsByOrganization` | `opts?: { limit?: number; offset?: number }` |
| `features/clients/services/clients.service.ts` | `getClientsByOrganization` | `opts?: { limit?: number; offset?: number }` |
| `features/indents/services/indents.service.ts` | `getIndentsByOrganization` | `opts?: { limit?: number; offset?: number }` |
| `features/drivers/services/drivers.service.ts` | `getDriversByOrganization` | `opts?: { limit?: number; offset?: number }` |
| `features/suppliers/services/suppliers.service.ts` | `getSuppliersByOrganization` | `opts?: { limit?: number; offset?: number }` |
| `features/vehicles/services/vehicles.service.ts` | `getVehiclesByOrganization` | `opts?: { limit?: number; offset?: number }` |
| `services/connectionRequestsService.ts` | `getConnectionRequestsReceived`, `getConnectionRequestsSent` | Optional cap for consistency |

Use Supabase `.range(from, to)` (e.g. `.range(offset, offset + limit - 1)`) and return `{ data, hasMore }` (or total count) so the UI can show “Load more” or infinite scroll.

---

## 2. Pages that need CACHE (and where)

There is **no client cache** today. Every tab focus or return to a screen triggers a full refetch. Adding a cache (e.g. **TanStack Query**) with a short `staleTime` (e.g. 30–60 s) and invalidation on Realtime will make the app feel much faster and reduce redundant requests.

### 2.1 Cache by “query key” (suggested)

Treat each “list per org” and “detail by id” as a query. Example keys:

- `['trips', orgId]`
- `['transactions', orgId]` (and optionally `['transactions', orgId, { partyName }]` for party filter)
- `['clients', orgId]`
- `['suppliers', orgId]`
- `['drivers', orgId]`
- `['vehicles', orgId]`
- `['indents', orgId]`
- `['connection-requests-received', orgId]`, `['connection-requests-sent', orgId]`
- `['driver-invites-sent', orgId]`
- `['trip', tripId]`, `['client', orgId, clientId]`, etc.

**staleTime:** 30–60 s so that refocus within that window does not refetch.  
**Invalidation:** Keep existing Realtime subscriptions; on postgres change, invalidate the matching query (e.g. `queryClient.invalidateQueries({ queryKey: ['trips', orgId] })`) so one refetch happens instead of every focus refetching.

### 2.2 Screens that refetch on focus (would benefit most from cache)

| Screen | Trigger | Benefit of cache |
|--------|---------|-------------------|
| **Trips tab** | `useEffect` + `useFocusEffect` + `useRealtimeTrips` / `useRealtimeTransactions` | Avoid double/triple fetch; show cached data immediately, refetch in background if stale or invalidated |
| **Customers (Clients)** | `useEffect` + pull-to-refresh | Instant show on tab switch; refresh only when stale or user pulls |
| **Indents** | `useEffect` + pull-to-refresh | Same |
| **Network** | `useEffect` + `useFocusEffect` (fetchRequests) + pull-to-refresh | Cache nodes and requests; refetch requests only when stale or on focus after long gap |
| **Finance** | `useFinanceEntities` (refreshKey bump on sub-tab) + ledger fetch on focus | One cached 9-way entity load; ledger cached by org; no refetch on every sub-tab or focus |
| **Finance Ledger** | `useFinanceLedger` + focus refetch | Cached transactions; refetch only when invalidated or stale |
| **Driver app – Trips / Requests / Wallet** | Focus + refetch | Cache trips-by-driver; instant when returning to app or tab |
| **Load Board modal** | Open modal → `getIndentsByOrganization` | Cache indents by org; reopen modal shows cache first |
| **Create Indent** | Mount → `getClientsByOrganization` | Cache clients; picker opens with cached list |
| **Add Trip** | Mount → clients, drivers, vehicles, trips, suppliers (5 full fetches) | Cache all; form opens fast and uses cached data |
| **Client / Supplier / Driver / Vehicle detail** | Focus → trips + transactions for entity | Cache entity detail and related lists |
| **Trip detail** | Focus → trip + transactions | Cache trip and its transactions |
| **Ledger Sync modal** | Open → 6+ sources | Reuse cached entities and transactions |
| **Ops Agent (Home)** | Pre-fetched summaries (revenue, vehicles, drivers, etc.) | Cache ops context so opening bot doesn’t re-fetch everything |

### 2.3 Duplicate fetches to remove with cache

- **Finance:** `useFinanceEntities` runs a 9-way `Promise.all` on every `refreshKey` bump (sub-tab change). With cache, use one set of query keys (e.g. `['clients', orgId]`, …); sub-tabs read from cache, no refetch unless invalidated or stale.
- **Trips:** Mount + focus both call `fetchTrips()`; Realtime also calls it. With cache: single query `['trips', orgId]`; Realtime invalidates; focus only refetches if stale.
- **Network:** `fetchNodes` and `fetchRequests` on focus every time. With cache: show cached nodes/requests; refetch in background if stale.

---

## 3. Implementation priority for “10x faster” feel

### Phase 1 – Cache layer (biggest perceived win)

1. Add **TanStack Query** (or SWR) and wrap the app with `QueryClientProvider`.
2. Define query keys for: trips, transactions, clients, suppliers, drivers, vehicles, indents, connection requests, driver invites.
3. Replace “fetch on mount + refetch on focus” with `useQuery` (and optional `useFocusEffect` that only invalidates or refetches when stale). Keep Realtime; on event, call `queryClient.invalidateQueries(...)` instead of calling the same fetch function directly.
4. **Finance:** Use the same queries for `useFinanceEntities` (read from cache); remove duplicate “dropdown-only” fetch so one load serves both dropdowns and entity tabs.
5. **Trips:** Single `useQuery(['trips', orgId])` (and one for transactions if needed); Realtime invalidates; no manual `fetchTrips` on every focus.

**Result:** Tab switching and return-to-app show data immediately when cache is fresh; no redundant full refetches.

### Phase 2 – Pagination (large datasets)

1. Add **pagination** (or at least `.limit(50)` + “Load more”) to:
   - Trips list
   - Finance Ledger (transactions)
   - Customers, Indents, Network (clients/suppliers/drivers)
   - Driver app trips/requests/wallet
   - Load Board indents
2. Add optional `limit`/`offset` (or cursor) to the service functions listed in §1.3.
3. Use cached first page; “Load more” fetches next page and appends (or use infinite query in TanStack Query).

**Result:** First paint much faster for orgs with hundreds of rows; lower memory and network.

### Phase 3 – List and heavy-screen tuning

1. **Virtualization:** Where lists are long, use `FlatList`/`FlashList` with windowing (some screens already use `FlatList`; `ListScreenLayout` uses `ScrollView` — consider FlatList for list body).
2. **Finance / Ops Agent:** Split large components and avoid refetching all entities on every sub-tab change (already addressed by cache in Phase 1).

---

## 4. Quick reference: page → pagination + cache

| Page | Pagination | Cache |
|------|------------|--------|
| Trips tab | ✅ Trips + (transactions or cap) | ✅ `['trips', orgId]`, `['transactions', orgId]` |
| Finance Ledger | ✅ Transactions | ✅ `['transactions', orgId]` |
| Finance entities | ✅ If long lists | ✅ Reuse `['clients'|'suppliers'|…]` |
| Customers (Clients) | ✅ Clients | ✅ `['clients', orgId]` |
| Indents | ✅ Indents | ✅ `['indents', orgId]` |
| Network | ✅ Per-type or cap | ✅ Nodes + requests |
| Load Board | ✅ Indents | ✅ `['indents', orgId]` |
| Driver app (trips/requests/wallet) | ✅ Trips | ✅ Trips by driver |
| Resources (Drivers/Suppliers/Vehicles) | ✅ Each list | ✅ Same keys as Finance/Network |
| Add Trip / Create Indent / Ledger Sync | Picker/list cap | ✅ Reuse entity caches |
| Detail screens (trip/client/driver/…) | ✅ Related trips/transactions | ✅ By entity id |
| Ops Agent | Optional | ✅ Ops context cache |

---

## 6. Implementation summary (done)

| Component | Implementation |
|-----------|----------------|
| **TanStack Query** | `@tanstack/react-query`; `QueryClientProvider` in `app/_layout.tsx`; `makeQueryClient()` with `staleTime: 60s`, `gcTime: 5m`. |
| **Query keys** | `lib/queryKeys.ts` — factory for trips, transactions, clients, suppliers, drivers, vehicles, indents, connection requests, driver invites, salary requests, driver offers. |
| **Pagination** | `lib/pagination.ts` — `PageOpts`, `DEFAULT_PAGE_SIZE`, `LEDGER_PAGE_SIZE`, `DRIVER_TRIPS_PAGE_SIZE`. All list services accept optional `opts?: PageOpts` and return `hasMore` when paginating; no `opts` = full list (backward compatible). |
| **Query hooks** | `lib/queries/` — `useTripsQuery`, `useTransactionsQuery`, `useClientsQuery`, `useSuppliersQuery`, `useDriversQuery`, `useVehiclesQuery`, `useIndentsQuery`, `useConnectionRequests*`, `useDriverInvitesSentQuery`, `useTripsWhereOrgIsClientQuery`, `useDriverOffersQuery`, `useSalaryRequestsQuery`, `useAssignmentAuditQuery`, `useRealtimeTripsInvalidation`, `useRealtimeTransactionsInvalidation`. |
| **Trips tab** | Uses `useTripsQuery`, `useTransactionsQuery`, `useAssignmentAuditQuery`; Realtime invalidates; no refetch on focus. |
| **Clients / Indents / Network / Finance / Load Board** | Use cached hooks; Finance entities and ledger read from cache; Load Board uses `useIndentsQuery` when visible. |

---

## 5. Summary

- **Pagination:** Add to every list that can grow large (trips, transactions, clients, suppliers, drivers, vehicles, indents, connection requests). Start with high-priority list screens and Finance Ledger, then detail screens and pickers.
- **Cache:** Introduce a single cache layer (e.g. TanStack Query) for all list and detail data; use `staleTime` and Realtime-driven invalidation so that refocus and tab switch show data instantly and refetch only when needed.
- **Deduplication:** Remove duplicate Finance entity load and redundant Trips/Network focus refetches by relying on the cache.

These changes align with the existing [PERFORMANCE_AND_RESPONSIVENESS_AUDIT.md](./PERFORMANCE_AND_RESPONSIVENESS_AUDIT.md) and will get the largest gain toward a “10x faster” experience.

---

## 7. Delta Caching Rollout (2026 Update)

The app now includes a two-layer cache strategy:

- **Client layer:** TanStack Query persisted cache keyed by domain + org.
- **Service layer:** domain-level cursor metadata and delta merge helpers in `lib/cache/*`.

### Delta contract

- Cursor: `updated_at` watermark (`DeltaCursor`).
- Envelope: `{ changed, deletedIds, nextCursor, fullSyncRequired? }`.
- Merge: id-based upsert + delete (`mergeDeltaRows`).

### Implemented building blocks

- `lib/cache/deltaTypes.ts`
- `lib/cache/cacheKeys.ts`
- `lib/cache/cacheMetadataStore.ts`
- `lib/cache/domainSync.ts`
- `lib/cache/mergeDelta.ts`
- `lib/cache/singleflight.ts`
- `lib/cache/cacheMetrics.ts`

### Hook and service integration

- Query keys now separate finite/infinite list variants to avoid cache-shape collisions.
- Domain sync wrappers added in core services (trips, transactions, clients, suppliers, drivers, vehicles, indents, chat/network, invoicing, POD reconciliation, log-pods, shared-ledger notifications).
- Query hooks for core domains now use sync wrappers and preserve existing hook signatures.

### Backend RPC blueprint

- Additive SQL blueprint for `*_delta` RPCs is provided in:
  - `scripts/sql/delta_rpc_blueprint_safe.sql`
- Apply in Q-unified-base Supabase project, then enable domain-by-domain delta reads without removing legacy full-fetch paths.
