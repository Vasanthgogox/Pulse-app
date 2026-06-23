# Conventions

## Naming
- Query hooks: `use[Entity]Query.ts` in `lib/queries/`
- Services: `[domain].service.ts` in `features/[domain]/services/`
- Components: PascalCase
- Query keys: always `queryKeys.X.Y(params)` — never inline strings
- Routes: always `ROUTES.*` from `lib/routes.ts` — never hardcode paths
- Feature public API: `features/[domain]/index.ts`

## Folder Structure
```
features/[domain]/
├── services/     # Supabase calls + business logic
├── components/   # Feature UI
├── hooks/        # Feature hooks
├── utils/        # Helpers (must be named *.util.ts)
├── styles/       # StyleSheet objects
├── types/        # Domain types
└── index.ts      # Public exports
```

## ESLint Rules (enforced)
- Service files must be named `*.service.ts`
- Utility files must be named `*.util.ts`

## Query Keys
Always use the factory — never raw strings:
```ts
queryKeys.trips.list(orgId)
queryKeys.transactions.all(orgId)
```

## Supabase / DB
- Client: `lib/supabase.ts` (25s timeout, 1 retry on network error)
- Migrations: `supabase/migrations/` — new incremental files only, never edit existing
- RLS enforced at DB level — no `service_role` key in app

## Commands
```bash
npm run web              # Web dev (port 8081)
npm run db:push          # Supabase DB push
npm run functions:deploy # Deploy Edge Functions
npm run lint             # ESLint
npm test                 # Jest
```
