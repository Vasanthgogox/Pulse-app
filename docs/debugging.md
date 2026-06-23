# Debugging & Common Errors

## Supabase Patterns

**RLS blocking a query silently**
- Symptom: query returns `[]` with no error
- Check: is `organization_id` filter present? Does the user's org match?
- RLS never throws — it just returns no rows

**Session missing on web**
- `expo-secure-store` is not available on web — falls back to `AsyncStorage`
- Check `lib/supabase.ts` storage adapter selection
- Never call `getSession()` directly; use `useAuth()` from `contexts/AuthContext.tsx`

**Realtime subscription not firing**
- Check `lib/realtimeRegistry.ts` — duplicate channels are deduplicated
- Subscriptions are per-org per-table; verify the channel name matches
- Cleanup: subscriptions must be removed on unmount or channels accumulate

**Migration conflicts**
- Never edit existing files in `supabase/migrations/`
- Always create a new incremental file
- Run `npm run db:push` after adding

---

## TanStack Query Patterns

**Stale data showing after mutation**
- Invalidate using `queryClient.invalidateQueries(queryKeys.X.all(orgId))`
- Never use raw strings — always `queryKeys.*` factory
- For realtime tables, invalidation happens via `useRealtimeInvalidation`

**Query not firing**
- Check `enabled` flag — most hooks have `enabled: !!orgId`
- If `orgId` is null (org not loaded yet), query is skipped

**Loading flash on tab switch (finance)**
- Do NOT increment `entitiesRefreshKey` on tab change — cache handles staleness
- Only increment on: pull-to-refresh, add-entity completion

**Infinite query pagination**
- Use `useTransactionsInfiniteQuery` (not `useTransactionsQuery`) for paginated views
- Page size constant in `lib/pagination.ts`

---

## Expo Router Pitfalls

**Route not found**
- Route strings must match exactly — use `ROUTES.*` from `lib/routes.ts`
- Never hardcode paths like `router.push('/trips')`

**Screen renders before auth**
- `app/index.tsx` guards on `roleVerified` — wait for it before pushing
- `roleVerified` is server-confirmed; `user` alone is not sufficient

**Web URL patterns in Playwright tests**
- Expo Router on web uses hash routing in some configs
- Check `playwright.config.ts` baseURL — must match `npm run web` port (8081)

---

## React Native / Expo

**Platform-specific component missing**
- Map and PDF use `.native.tsx` / `.web.tsx` splits
- If one platform crashes, check both variants exist
- `features/invoicing/` — native: `react-native-pdf-lib`, web: browser APIs

**SecureStore 2KB limit**
- `expo-secure-store` has a 2KB per-key limit on native
- Don't store large objects; store tokens/IDs only

**Metro bundler OOM on web**
- Web dev output is SPA — use `npm run web` not `npm run build:web` for dev
- See memory: `project_metro_perf_findings.md`

---

## Previously Fixed Issues

**network_messages realtime**
- `network_messages` has no org-scope column
- Use `network_conversations` with `org_a_id`/`org_b_id` filters instead

**Finance tab flicker on tab switch**
- Was caused by `entitiesRefreshKey` incrementing on every tab change
- Fixed: removed the effect in `FinanceScreen.tsx` — cache staleTime handles freshness
