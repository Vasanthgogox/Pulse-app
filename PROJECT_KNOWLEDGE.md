# Project Knowledge: Pulse Mobile (q-web)

This document is an AI-generated synthesis of the `q-web` project architecture, tech stack, and structure. It serves as context for AI assistants to understand the codebase rules and boundaries.

## 1. Project Overview
**Pulse** is a React Native mobile application built with **Expo (SDK 54)**. It shares the same **Supabase** backend and authentication system as the main web platform (`pulse-unified-base`). It is built using TypeScript for a scalable, long-running mobile experience.

## 2. Tech Stack
- **Framework**: React Native with Expo (SDK 54) & Expo Router (`app/` directory).
- **Backend/BaaS**: Supabase (`@supabase/supabase-js`). Session management via `@react-native-async-storage/async-storage`.
- **State Management**: React Query (`@tanstack/react-query`) with persistent offline cache. Global contexts in `contexts/`.
- **UI Components**: `@gorhom/bottom-sheet`, `@shopify/flash-list`, `@expo/vector-icons`, Lottie animations.
- **Maps**: MapLibre React Native (`@maplibre/maplibre-react-native`).
- **Styling**: Likely standard React Native StyleSheets / Design tokens defined in `constants/`.
- **Testing/Linting**: ESLint (custom boundary rules), Jest, Playwright, Detox (E2E).

## 3. Architecture & Strict Boundaries (CRITICAL)
The project enforces strict domain boundaries via `eslint-plugin-boundaries` and CI checks. Any AI modifying this codebase **must** adhere to the following 6 rules:

1. **`lib/` is pure infrastructure:** Contains NO domain logic. If a file name contains a domain noun (e.g., driver, trip, fleet), it belongs in `features/`.
2. **`lib/` never imports from `features/`:** Data flows `app/ → features/ → lib/`. Do not create circular dependencies.
3. **`components/` are shared and "dumb":** Used by 3+ feature domains. They receive data via props and **never** import from `features/`.
4. **Cross-feature imports are services-only:** Feature A can import `features/B/services/` to read data, but NEVER `features/B/components/` or `hooks/`.
5. **Services live with their primary DB table:** e.g., `sharedLedgerService` goes in `features/finance/services/`. Cross-domain utils go in `lib/`.
6. **No Re-export Facades:** Do not create dummy service files just to export another. Use barrel `index.ts` files inside the feature.

## 4. Directory Structure
- **`app/`**: Expo Router screens and routing layouts (No business logic here).
- **`features/`**: The core of the app. Domain-driven modules containing their own components, hooks, services, and types.
  - *Key Domains:* `auth`, `chat`, `clients`, `drivers`, `finance`, `fleet`, `identity`, `indents`, `invoicing`, `ledger`, `network`, `operations`, `organization`, `tracking`, `trips`, `vehicles`, etc.
- **`components/`**: App-wide, generic UI primitives.
- **`lib/`**: Generic utilities (routing, auth engine, crash reporting, capabilities, formatting).
- **`contexts/`**: Global React Context providers.
- **`constants/`**: App-wide constants (themes, design tokens).
- **`supabase/`**: Edge functions, migrations, and database configuration.
- **`types/`**: TypeScript `.d.ts` declaration files. *(Note: Standard `.ts` types live inside their respective feature folders, while global ones live here).*

## 5. Current State & Known Technical Debt
- **Unused Supabase Types**: `lib/database.types.ts` is massive (~14k lines) but is currently **unused** across the codebase. The `createClient` in `lib/supabase.ts` is untyped.
- **Recent Remediation (`ACTION_PLAN.md`)**: The app recently underwent a major refactor to fix a Supabase connection/transaction exhaustion incident. Key fixes included implementing exponential backoff for client retries, bounding concurrency in edge functions and batch loops, and stopping background polling when the app is inactive.

## 6. Environment Configuration
Requires `.env` with:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
*(These map 1:1 to the `VITE_` equivalents used in `pulse-unified-base`).*