# Performance

## Expensive Queries

**network_messages realtime**
Use Supabase channel subscriptions — never poll.
`network_messages` has no org-scope column; filter via `network_conversations` (`org_a_id`/`org_b_id`).

**Finance entities (5 parallel queries on mount)**
clients + trips + suppliers + vehicles + drivers all fire simultaneously.
Cash tab renders immediately — does not block on entity queries.
Party tabs show spinner only while `entitiesLoading` is true.

## Known Bottlenecks

**Finance tab flicker**
Was caused by `entitiesRefreshKey` incrementing on every tab switch → `entitiesLoading` flashed true.
Fixed: removed the effect in `FinanceScreen.tsx`. Cache staleTime (5min) handles freshness.

**useFinanceLedger heavy memos**
Deep `useMemo` chain: period filter → trip count map → source filter → category filter → display sort → trip details map.
Do not add more client-side computation here — push to service layer instead.

**trips.service.ts (67 KB)**
Largest service. Cross-org visibility logic is complex — read carefully before modifying.

## Rendering

- Use `@shopify/flash-list` for all long lists — not `FlatList`
- Memoize heavy list row components with `React.memo`
- Avoid `useEffect` loops that trigger state updates on every render

## Query Rules

- `staleTime` >= 60s unless the table has a realtime subscription
- `STALE.realtime` = 5min (realtime invalidates; this is just the fallback)
- Never set `staleTime: 0` — causes refetch on every focus
- UPDATE events merge in-place; INSERT/DELETE fully invalidate the list
