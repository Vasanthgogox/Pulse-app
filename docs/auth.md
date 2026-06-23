# Auth

## Overview
Supabase Auth (email/password + Google OAuth). Session stored in SecureStore (native) or AsyncStorage (web/Expo Go).

**Never modify auth without approval.**

## Key Files
- `contexts/AuthContext.tsx` — exposes `useAuth()`
- `features/auth/services/auth.service.ts` — all auth operations
- `lib/supabase.ts` — client singleton, session persistence

## useAuth()
```ts
{ user, profile, roleVerified, signIn, signOut }
```
- `roleVerified` — server-confirmed role; gates routing in `app/index.tsx`

## Auth Service API
```
signInWithPassword(email, password) → { error }
signUp({ email, password, fullName, role, operatingModel, phone }) → { error }
signOut() → void
getProfile(uid) → AuthProfile | null
onAuthStateChange(cb) → unsubscribe fn
refreshSession() → { user, profile } | null
```

## App Launch Flow
```
1. app/_layout.tsx — mounts all providers
2. AuthContext — getSession() → Supabase session restore
3. If session: verifies profile.role against DB
4. app/index.tsx — reads roleVerified
   driver    → /(driver)
   dispatcher → lastRoute || /(tabs)/trips
   no session → /sign-in
```

## Storage
- Native: `expo-secure-store` (2KB limit)
- Web/Expo Go: `AsyncStorage` fallback
- RLS enforced at DB level — no `service_role` key in app
