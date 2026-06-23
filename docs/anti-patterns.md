# Anti-Patterns

Things never to do in this codebase.

## Query & Cache
- Never inline query key arrays — always use `queryKeys.*` factory
- Never set `staleTime: 0` — causes refetch storms
- Never poll realtime tables — use Supabase channel subscriptions
- Never create duplicate query hooks for the same data
- Never call `supabase()` directly from a component — always go through a service

## UI & Theme
- Never use raw colors or hex values — always `constants/Theme.ts` tokens
- Never hardcode route strings — always `ROUTES.*` from `lib/routes.ts`
- Never use `FlatList` for long lists — use `@shopify/flash-list`

## Architecture
- Never bypass services to call Supabase directly from screens or hooks
- Never add business logic to components — belongs in services or hooks
- Never add cross-domain imports between `features/` modules — go through `lib/` or the public index
- Never store large objects in SecureStore (2KB native limit)

## Auth
- Never modify auth without approval
- Never use `user` alone to gate features — wait for `roleVerified`
- Never expose `service_role` key in app code

## Database
- Never edit existing migration files — always add new incremental files
- Never filter `network_messages` by org directly — it has no org-scope column

## Investigation
- Never scan the whole repo to answer a local question
- Never spawn Explore subagents for single-file lookups
- Never continue investigating after the root cause is identified
