# Routing

## Setup
Expo Router 6 — file path = route path. All route strings via `ROUTES.*` from `lib/routes.ts` — never hardcode paths.

## Entry Points
| File | Purpose |
|------|---------|
| `app/index.tsx` | Auth guard → `/(driver)` or `/(tabs)` based on `roleVerified` |
| `app/_layout.tsx` | Root shell: all providers, ErrorBoundary, `<Stack>` nav |
| `app/(tabs)/_layout.tsx` | Dispatcher tab bar (Finance, Trips, Network, Profile) |
| `app/(driver)/_layout.tsx` | Driver tab bar (Control, Documents, Chat, Wallet) |

## Route Groups
- `app/(tabs)/` — dispatcher screens
- `app/(driver)/` — driver screens
- `app/(modals)/` — modal screens
- `app/auth/` — sign-in, sign-up

## Dynamic Routes
- `app/trip/[id].tsx`
- `app/driver/[id].tsx`

## Adding a Screen
1. Create `app/[path].tsx`
2. Add route constant to `lib/routes.ts`
