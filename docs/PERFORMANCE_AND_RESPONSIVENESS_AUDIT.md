# Q Mobile: Performance, Responsiveness & Data Loading Audit

Quick assessment of **application speed**, **responsiveness**, **performance**, **data loading speed**, and **cache/update** behavior.

---

## Overall ratings (1–5)

| Area | Rating | Notes |
|------|--------|------|
| **Application speed** | 3/5 | Good network layer; no caching and full refetches slow perceived speed. |
| **Responsiveness** | 4/5 | UI is responsive; `useMemo`/`useCallback` used; some heavy screens (Finance, Ops Agent). |
| **Performance** | 3/5 | No list virtualization beyond `FlatList`; no pagination; large Finance screen. |
| **Data loading speed** | 3/5 | Parallel fetches where used; no cache or stale-while-revalidate; refetch-on-focus adds latency. |
| **Cache / updating** | 2/5 | No client cache layer; Realtime used for invalidation but every refocus = full refetch. |

**Overall: 3/5** — Usable and correct, with clear room to improve perceived speed and reduce redundant work.

---

## What’s working well

1. **Network layer** (`lib/supabase.ts`)
   - Single Supabase client, 25s timeout, one retry for flaky networks.
   - Session persisted via AsyncStorage; auth recovery on token refresh.

2. **Realtime**
   - `useRealtimeTrips` and `useRealtimeTransactions` invalidate and refetch on DB changes — good for freshness.

3. **Render optimization**
   - `useMemo` / `useCallback` used in many list/detail screens (trips, finance, clients, drivers, etc.), reducing unnecessary re-renders.

4. **Focus behavior**
   - Finance tab skips first-focus refetch (`isFirstFinanceFocus` ref) to avoid double load on mount.
   - Pull-to-refresh on list screens for explicit refresh.

5. **Parallel fetches**
   - Trips: `getTripsByOrganization` + `getTransactionsByOrganization` + assignment audit in parallel.
   - Finance: entity load uses `Promise.all` for 8 sources (clients, trips, suppliers, vehicles, drivers, offers, connection requests, trips-as-client).

---

## Gaps and issues

### 1. No caching layer

- **No React Query, SWR, or any TTL cache.** Every screen focus triggers full refetch.
- **Trips tab:** Three separate triggers all call `fetchTrips()` with no deduplication or TTL:
  - **Mount:** `useEffect([fetchTrips])` runs on first load.
  - **Focus:** `useFocusEffect` runs every time the Trips tab gains focus (e.g. switching from Home → Trips or back from a detail screen).
  - **Realtime:** `useRealtimeTrips(orgId, fetchTrips)` invokes `fetchTrips` on postgres changes.
  - Switching to Trips can therefore refetch even when data was just loaded seconds ago.
- **Same pattern elsewhere:** Network tab (`fetchRequests` on focus), Finance (refetch on focus after first load), detail screens (Client, Driver, Vehicle, Supplier, TripLedger), driver requests, and LoadBoard modal all refetch on focus with no stale-time guard.
- **Result:** Slower perceived speed, more network usage, more load on Supabase, and redundant requests when toggling tabs or returning to the app.

### 2. No pagination

- **Services fetch full tables:** e.g. `getTripsByOrganization`, `getClientsByOrganization`, `getDriversByOrganization` use `.select('*')` with no `.range()` or `.limit()`.
- **Impact:** Large orgs (hundreds of trips/clients) get slow first load and heavier memory use. Only AI service uses `.limit(30)`.

### 3. Duplicate initial fetches on Finance

- **Two useEffects** both load clients/trips/suppliers for the same org:
  - One (deps: `canAccess`, `currentOrganization?.id`) sets clients/trips/suppliers for dropdowns.
  - Second (deps: `canAccess`, `currentOrganization?.id`, `entitiesRefreshKey`) does a full entity load (clients, trips, suppliers, vehicles, drivers, offers, etc.).
- **Result:** On mount, clients/trips/suppliers can be requested twice; `entitiesRefreshKey` also triggers the full 8-way fetch on sub-tab change.

### 4. Refetch-on-focus without cache

- **`useRefetchOnFocus(refetch)`** runs `refetch()` on every focus. With no cache, that’s a full network round-trip every time the user switches tabs or returns to the app.
- **Result:** Noticeable loading state and delay even when data was just viewed.

### 5. List rendering

- **FlatList** is used (trips, create-indent, add-trip picker); **FlashList** is not. For very long lists, virtualization could be better (minor unless lists are huge).
- **ListScreenLayout** uses **ScrollView** for list content — all children mount at once. For long lists, this can hurt scroll performance.

### 6. Heavy screens

- **Finance** (~2.6k lines): Large component with many useState/useEffect and 8-way entity fetch; sub-tab change bumps `entitiesRefreshKey` and refetches everything.
- **OpsAgentScreen** (~2.8k lines): Large single component; AI and UI logic in one place — can contribute to slower first paint or interaction lag if not split.

### 7. Cache “update” behavior

- **Realtime** correctly triggers refetch when data changes.
- **No stale-while-revalidate:** Users always wait for loading then full data; no showing last cached data while refreshing in background.
- **No request deduplication:** Same org + same screen can trigger overlapping identical requests (e.g. two focus effects or mount + focus).

---

## Recommendations (priority order)

1. **Introduce a cache layer (e.g. React Query / TanStack Query)**
   - Cache by query key (e.g. `['trips', orgId]`, `['clients', orgId]`).
   - Use `staleTime` (e.g. 30–60 s) so refocus doesn’t refetch if data is fresh.
   - Keep Realtime to invalidate queries on postgres changes; one refetch per change instead of refetch on every focus.
   - **Impact:** Faster perceived speed, fewer redundant requests, better cache “update” behavior.

2. **Deduplicate Finance initial load**
   - Single source of truth for “entity data”: one effect or one React Query usage that loads clients/trips/suppliers/vehicles/drivers/offers/connections/trips-as-client.
   - Use that data for both dropdowns and entity lists; remove the separate effect that only sets clients/trips/suppliers for dropdowns.
   - **Impact:** Fewer duplicate requests on Finance mount and tab switch.

3. **Add pagination (or at least limits) to list APIs**
   - In services, add `.range(0, pageSize - 1)` or `.limit(pageSize)` with a sensible default (e.g. 50–100), and optional “load more”.
   - **Impact:** Faster first load and lower memory for large orgs.

4. **Soften refetch-on-focus**
   - With a cache (e.g. React Query), prefer `refetchOnWindowFocus` with `staleTime` instead of unconditional refetch in `useFocusEffect`.
   - If keeping manual refetch, at least skip refetch if data was fetched in the last N seconds (simple time-based guard).
   - **Impact:** Less redundant loading when switching tabs.

5. **Optional: FlashList for long lists**
   - Replace `FlatList` with `@shopify/flash-list` where lists can be large (e.g. trips, drivers).
   - **Impact:** Smoother scroll and lower memory for long lists.

6. **Optional: Split Finance and Ops Agent**
   - Break Finance into smaller components/hooks (e.g. one hook for “entity data”, one for ledger, one for selected entity).
   - Split Ops Agent into smaller presentational and data layers.
   - **Impact:** Easier to optimize and avoid unnecessary re-renders; better long-term performance.

---

## Summary

- **Speed / data loading:** Good network and parallel fetches; held back by no cache, full refetch on focus, and no pagination.
- **Responsiveness:** Generally good; some very large components and ScrollView-based lists could be tuned.
- **Cache / updating:** Realtime keeps data fresh but there is no client cache; “cache update” is effectively “refetch everything on focus,” which rates poorly. Adding a cache (e.g. React Query) with invalidation on Realtime would significantly improve both perceived performance and cache behavior.

Implementing **recommendations 1 (cache layer)** and **2 (Finance dedup)** would give the largest improvement for effort; **3 (pagination)** matters most for orgs with large datasets.
