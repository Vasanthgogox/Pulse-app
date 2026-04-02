# Q Mobile

Mobile app for Q — same Supabase backend as **Q-unified-base**. Built with **React Native (Expo)** and TypeScript for a runnable, long-running, and scalable mobile experience.

## Stack

- **Expo (SDK 54)** — React Native with TypeScript, Expo Router
- **Supabase** — Same DB and Auth as Q-unified-base (`@supabase/supabase-js` + `AsyncStorage` for session)
- **Capability-based access** — `lib/capabilities.ts` aligned with Q-unified-base

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure Supabase (same as Q-unified-base)**

   Copy `.env.example` to `.env` and set:

   ```bash
   cp .env.example .env
   ```

   Use the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Q-unified-base, but with Expo env names:

   - `EXPO_PUBLIC_SUPABASE_URL` — same value as `VITE_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — same value as `VITE_SUPABASE_ANON_KEY`

3. **Run the app**

   ```bash
   npm start
   ```

   Then press `i` for iOS simulator, `a` for Android emulator, or **scan the QR code** with your phone. The default `npm start` uses `--go`, so the QR uses `exp://` and opens in **Expo Go** when you scan it (have Expo Go installed on the device).

   **“No usable data found” when scanning the QR?**

   - **Using `npm start` (Expo Go):** Make sure **Expo Go** is installed on your phone. The QR uses `exp://`; if no app can open that URL, the system shows “no usable data”. Install [Expo Go](https://expo.dev/go) and scan again.
   - **Using `npm run start:dev-client`:** The QR uses a custom scheme for the **development build**. You must have the dev build installed on the device (`npx expo run:ios` or `npx expo run:android`), then open that app and use “Enter URL manually” or scan the QR with the **dev build app** (not the system camera). This project patches `qrcode-terminal` so the dev-client QR is square and scannable.
   - **Preview (tunnel + Expo Go):** For a QR that works from any network in Expo Go, run:
     ```bash
     npm run preview
     ```
     This runs `expo start --go --tunnel`; first run may ask you to sign in to Expo for the tunnel.

   **“No apps connected” when pressing `r` (reload) in the simulator?** The dev client may not be reaching Metro. Try:

   - **Use the simulator-specific server** so the app connects via localhost:
     ```bash
     npm run start:simulator
     ```
     Then press `i` to open iOS again (or `a` for Android). Reload (`r`) should work.
   - **Node.js:** If you’re on Node 20.0–20.2, upgrade to 20.3+ or use Node 18 LTS; the older 20.x range has a known bug that breaks Metro connections. Check with `node -v`.

4. **iOS native build (`npx expo run:ios`)**

   If you see *"CocoaPods CLI not found"* or *"Failed to install CocoaPods CLI with Gem"*:

   - Install CocoaPods via Homebrew: `brew install cocoapods`
   - Ensure Homebrew is on your PATH (add to `~/.zshrc` if needed):  
     `eval "$(/opt/homebrew/bin/brew shellenv)"`
   - Then run again: `npx expo run:ios`

## Project structure (aligned with Q-unified-base standards)

- **`lib/`** — Shared logic: `supabase.ts`, `capabilities.ts`
- **`services/`** — API/backend: `authService.ts` (Supabase Auth)
- **`contexts/`** — React context: `AuthContext.tsx`
- **`app/`** — Screens and routing (Expo Router): `index` (auth gate), `sign-in`, `(tabs)` (Dashboard, Trips, Settings)

No business logic in screens; pages compose and call `lib/` or `services/`. All config via env (no hardcoded URLs).

## Features (current)

- Sign in with email/password (Supabase Auth)
- Persistent session (AsyncStorage)
- Dashboard placeholder and Settings with Sign out
- Trips tab placeholder for future trip list/create

## Roadmap

- Trips list and create (reuse Q-unified-base services/types where possible)
- Indents, Vehicles, Drivers, Clients (mobile views)
- Capability-based tabs (show Trips/Indents only if user has permission)

## References

- **Q-unified-base** — Web app and standards: `docs/ENTERPRISE_MICROSERVICES_STANDARDS.md`, `.cursor/rules/enterprise-microservices-standards.mdc`
- **Supabase** — [Supabase + React Native](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
