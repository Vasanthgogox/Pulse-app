# Pulse Platform — Identity

**Status:** Frozen

## Purpose

One authentication system for the entire platform. Every customer logs into one Pulse account, regardless of which product they land in.

## Current State (grounded)

- One Supabase project, one `auth.users` table, shared by the main Expo/React Native app and the separate OMS (Commerce) Vite app.
- `handle_new_user()` (`AFTER INSERT ON auth.users` trigger) provisions the `profiles` row and, for owner onboarding, the organization + membership — already shared, already single-sourced.
- `features/auth/services/auth.service.ts` is already substantially framework-agnostic: plain async functions (`signIn`, `signUp`, `signInWithGoogle`, `applyPendingOAuthMetadata`, etc.) with no React dependency.
- `contexts/AuthContext.tsx` is a thin React (RN) wrapper around that service layer.
- `oms/src/context/AuthProvider.tsx` independently reimplements auth calls against the same Supabase project, rather than sharing the service layer above.

## Target

- `packages/platform/identity/` — plain TypeScript, zero React/React Native/Vite dependency. Contains the logic currently in `auth.service.ts`, generalized so any app can call it.
- Each app wraps it in its own thin, framework-native provider: `contexts/AuthContext.tsx` (RN) and `oms/src/context/AuthProvider.tsx` (Vite) both call the same underlying functions instead of each having their own Supabase call implementations.
- The Identity layer has no knowledge of products. It authenticates; it does not decide what happens next (see `04-products.md`, `08-product-registry.md` for what does).

## Principle

Identity only authenticates. It never decides business logic — no product-specific branching lives inside this layer.
