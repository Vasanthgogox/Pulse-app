# Performance Audit — Home Tab Ecosystem & Detail Screens

**Date:** 2026-05-28  
**Scope:** Bottom tabs (Trips / Finance / Network), nested finance sub-tabs, trip detail, hub lists, contexts, React Query.

---

## 1. Executive summary

The app already has **Slack-like bottom-tab persistence on native** (`freezeOnBlur`, no detach). The largest remaining costs are:

| Tier | Issue | Impact |
|------|--------|--------|
| **P0** | Trips hub renders all rows in `ScrollView` (no virtualization) | O(n) layout on every parent render |
| **P0** | `TripDetailScreen` ~12.7k lines; `useTripDetail` ~2.7k lines | Slow parse, broad rerender surface |
| **P0** | Hub cards lacked memo + stable navigation props | Full list repaint on filter/query refresh |
| **P1** | Finance sub-tabs remounted on every switch | Lost scroll + list state |
| **P1** | Trip detail tabs remounted on switch | Lost finance/expense/vault scroll |
| **P1** | `AuthContext` / `NetworkContext` new value object every render | Broad consumer rerenders |
| **P2** | `useWindowDimensions()` per hub card (grid) | N subscriptions × card count |
| **P2** | Full org `useTransactionsQuery` on hub + detail | Over-fetch for large ledgers |
| **P2** | `HubIconPulse` Reanimated loop per card | JS/UI thread work × row count |

**Implemented in this pass:** context memoization, persistent finance + trip-detail tabs, memoized hub cards, stable trip navigation + detail chunk preload, removed per-card dimension subscription (grid).

---

## 2. Bottleneck categories

### Navigation & mounting
- **Native:** Finance | Trips | Network stay mounted ✅ (`app/(tabs)/_layout.tsx`)
- **Mobile web:** `detachInactiveScreens: true` — inactive tabs unmount ⚠️
- **Finance sub-tabs:** Were remounting → **fixed** with `PersistentTabPanel`
- **Trip detail tabs:** Were remounting → **fixed** with `PersistentTabPanel`
- **Trip detail route:** `React.lazy` + Suspense — **preload** added on navigation helper

### React render
- Unmemoized `TripsHubTripCard` / `TripsHubMobileTripCard` → **memo + custom equality**
- Inline `onPress={() => router.push(...)}` per row → **`useOpenTripDetail` + `onOpenTrip`**
- `useTripDetail()` returns new object every run → **documented; Phase 2**

### Lists
- Trips hub: `ScrollView` + `.map()` — **Phase 2: FlashList migration**
- Trip detail: timeline/finance rows in ScrollView — acceptable at trip scope
- Indents tab: FlatList via `ListScreenLayout` ✅ (reference pattern)

### Data fetching
- TanStack Query defaults: 10m stale, no focus refetch ✅
- Realtime trip UPDATE merges cache ✅ (`useRealtimeInvalidation`)
- Trip detail bundle query disabled — legacy waterfall remains ⚠️
- Hub mounts 10+ parallel queries on Trips tab — mitigated by cache, not deduped

### Animation
- `HubIconPulse` + route arrow loops on every hub card — **Phase 2: visibility-gated or static on lists**
- Tab transitions: `animation: 'none'` on bottom tabs ✅

---

## 3. Changes shipped (this PR)

| File | Change |
|------|--------|
| `contexts/AuthContext.tsx` | `useMemo` on provider value |
| `contexts/NetworkContext.tsx` | `useMemo` on provider value |
| `components/PersistentTabPanel.tsx` | **New** — mount-once, hide inactive tabs |
| `features/finance/components/FinanceTabBody.tsx` | All finance sub-tabs persist after first visit |
| `features/trips/components/TripsHubViews.tsx` | `TripsHubTripCard` memo + `onOpenTrip` + `layoutCompact` |
| `features/trips/components/TripsHubMobileTripCard.tsx` | `React.memo` |
| `lib/navigation/useOpenTripDetail.ts` | **New** — stable navigation + preload |
| `lib/preloadRoutes.ts` | `preloadTripDetailScreen()` |
| `app/(tabs)/_trips-screen.tsx` | Stable `handleOpenTripDetails`, `onOpenTrip` on cards |
| `features/trips/components/trip-detail/TripDetailScreen.tsx` | Persistent Journey / Finance / Expense / Vault panels |

---

## 4. Before / after (expected)

| Metric | Before | After (expected) |
|--------|--------|------------------|
| Finance sub-tab switch | Full remount + scroll reset | Instant, scroll preserved |
| Trip detail tab switch | Remount finance/expense/vault | Preserved state |
| Trips hub parent rerender | All cards rerender | Only changed trips (memo equality) |
| Auth profile unrelated update | All `useAuth()` consumers | Same reference if fields unchanged |
| Trip detail navigation | Cold lazy chunk | Preload on shared helper |

---

## 5. Architecture recommendations

### Persistent screens (target)
```
Bottom tabs (native): always mounted + freezeOnBlur
Finance sub-tabs: PersistentTabPanel (done)
Trip detail tabs: PersistentTabPanel (done)
Mobile web tabs: consider detachInactiveScreens: false for Trips/Finance only
```

### State
- Memoize `useTripDetail` return or split `TripDetailDataContext`
- Selector hooks: `useAuthProfile()`, `useAuthUser()` to narrow subscriptions
- Normalize hub maps (party meta, ledger by trip id) — already Map-based ✅

### Lists (Phase 2)
- Replace trips hub `ScrollView` body with `@shopify/flash-list`
- `estimatedItemSize` from card height constants in `hubGridCardLayout`
- `getItemLayout` if card height fixed in mobile layout

### Trip detail (Phase 2–3)
- Enable `useTripDetailBundleQuery` when bundle RPC stable
- Split screen: `TripDetailJourneyTab`, `TripDetailFinanceTab`, lazy import
- Single `TripMap` instance; hide vs unmount by tab
- Gate tracking hooks on `activeTab === 'trip'`

---

## 6. Reanimated migration opportunities

| Current | Recommendation |
|---------|----------------|
| `HubIconPulse` on every list card | Run only for visible rows (FlashList `onViewableItemsChanged`) or first 3 rows |
| Tab bar scroll hide | Already on UI-friendly path in `DemoTabBarScrollContext` |
| Modal transitions | Prefer Reanimated 3 shared values for map/tracking modals |

---

## 7. Memory

- Avoid preloading all tab chunks (already guarded in `preloadRoutes.ts`) ✅
- Finance persistent tabs: +4 mounted panel trees — acceptable vs remount cost
- FlashList (future) reduces mounted native views for off-screen rows

---

## 8. Anti-patterns found

1. **12k-line screen file** — blocks code-splitting and memo boundaries
2. **Per-row inline objects** in `_trips-screen` (`kindPillMeta`, `hubCostContext`) — memo equality ignores these; still allocated each render (Phase 2: row component owns derivation)
3. **`useWindowDimensions` in list items** — fixed for grid via `layoutCompact` prop
4. **Full org ledger query** for per-trip filtering — use trip-scoped query or bundle RPC
5. **Double data path** in `useTripDetail` (manual load + React Query)

---

## 9. Profiling setup

```bash
# React Native
npx react-native start --experimental-debugger
# Flipper: React DevTools Profiler + Hermes sampling

# Web / Expo
npm run web
# Chrome Performance + React Profiler

# React Query
# Query devtools or log queryCache.getQueryCache().getAll().length on tab switch
```

**Scenarios to profile:**  
1. Switch Trips → Finance → Trips (native)  
2. Scroll 50+ trips, pull refresh  
3. Trip detail: Journey → Finance → Expenses → back  
4. Finance: Cash → Customers → Suppliers → back to Cash  

---

## 10. Remaining technical debt (prioritized)

1. FlashList for `_trips-screen` card/table body  
2. Memoize `useTripDetail` return object  
3. Enable trip detail bundle query; remove duplicate fetches  
4. Split `TripDetailScreen` into tab modules  
5. Trip-scoped ledger query  
6. Gate `HubIconPulse` on visibility  
7. Persist `financeSubTab` in AsyncStorage  
8. Mobile web: optional keep-mounted for primary tabs  

---

## 11. Production readiness

| Area | Status |
|------|--------|
| Native tab persistence | ✅ Production-ready |
| Context rerenders | ✅ Improved |
| Hub list at scale (100+ trips) | ⚠️ Needs FlashList |
| Trip detail at scale | ⚠️ Needs split + bundle query |
| Mid-range Android | ⚠️ Profile after FlashList; reduce pulse animations |

**Verdict:** This pass delivers meaningful **navigation permanence** and **list rerender reduction** without risky monolith surgery. Next sprint should target **virtualization** and **trip detail decomposition** for executive-grade performance at fleet scale.
