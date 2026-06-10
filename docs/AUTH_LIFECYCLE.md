# Authentication lifecycle (Supabase)

This app uses **Supabase Auth** for sign-in, sign-up, session, and token refresh. There is no custom `POST /api/login` or `POST /api/refresh`; Supabase is the sole auth backend.

## Tokens and storage

- **Access token:** JWT issued by Supabase. Expiry is configured in the Supabase Dashboard (JWT settings).
- **Refresh token:** Issued and stored by Supabase. The client uses it to obtain new access tokens when they expire.
- **Client storage:** The Supabase client is configured in [lib/supabase.ts](../lib/supabase.ts) with a custom `auth.storage`:
  - **iOS/Android (native build):** `expo-secure-store` (Keychain / secure storage) for values ≤2KB; larger values use AsyncStorage because of SecureStore size limits.
  - **Web / Expo Go:** AsyncStorage fallback.
- **First launch:** On first launch after install, the app clears local auth storage (see [lib/firstLaunch.ts](../lib/firstLaunch.ts)) to avoid restoring any session that might have persisted in Keychain after a reinstall.

## "Keep me signed in"

The **"Keep me signed in"** checkbox is a **client-only preference**. It is not sent to Supabase and does not change token expiry. It controls:

1. **Cold start:** Whether to restore the session from storage when the app opens. If unchecked, we do not restore; the user sees the sign-in screen.
2. **Background:** If unchecked, when the app goes to background we sign out locally so the next time the app is opened the user sees the sign-in screen.

The preference is stored in AsyncStorage under `@pulse/keep-signed-in` ([lib/keepSignedInPreference.ts](../lib/keepSignedInPreference.ts)).

## App launch flow

1. **App starts** → Root layout renders; [app/index.tsx](../app/index.tsx) shows a loading spinner until auth is resolved.
2. **AuthProvider mounts** ([contexts/AuthContext.tsx](../contexts/AuthContext.tsx)) → A single effect runs on mount.
3. **First launch (optional):** If the first-launch flag is not set, we call `supabase().auth.signOut({ scope: 'local' })` and set the flag, then continue.
4. **Session restore:** We call `authService.getSession()`, which uses `supabase().auth.getUser()`. That reads from storage and, if needed, uses the refresh token to get a valid session. It returns `{ user, profile }` or `null`; on invalid or expired refresh it clears local session and returns `null`.
5. **Decision:**
   - **No session:** We set user/profile to null and loading to false → Index routes to `/sign-in`.
   - **Session exists:** We read `getKeepSignedIn()`. If **false**, we sign out and clear user/profile → Index routes to `/sign-in`. If **true**, we set user/profile from the session → Index routes to the main app (`/(tabs)/finance` or `/(driver)`).
6. **Subscription:** We subscribe to `authService.onAuthStateChange()` so future sign-in, sign-out, and token refresh events update the auth context.

Session verification is **O(1)**: one `getUser()` (which may trigger one refresh) and one `getKeepSignedIn()` read when a session exists.

## Token refresh and 401 handling

- The Supabase client has `autoRefreshToken: true`. When the access token expires, the client refreshes it using the refresh token.
- Every request through `supabase()` uses the current session JWT; the library attaches it and handles refresh.
- In [lib/supabase.ts](../lib/supabase.ts), we register `onAuthStateChange`: on `TOKEN_REFRESHED` with no session (refresh failed), we call `signOut({ scope: 'local' })`, which clears storage and leads to the sign-in screen.
- In [features/auth/services/auth.service.ts](../features/auth/services/auth.service.ts), `getSession()` uses `getUser()` (which triggers refresh if needed). On error it calls `clearLocalSessionIfInvalid()`, so an invalid or expired refresh token clears local state and the user sees sign-in.

No custom HTTP interceptor is required for Supabase API calls; the Supabase client handles 401/invalid-session and serializes refresh. If you add other APIs (e.g. your own backend) that use a different token, you would add an interceptor there and optionally reuse the same token or refresh logic from Supabase.

## Edge cases

| Case | Handling |
|------|----------|
| **Multiple 401s / refresh race** | Supabase client performs refresh internally and serializes; no custom mutex needed for Supabase requests. |
| **Explicit logout** | We call `authService.signOut()` → `supabase().auth.signOut()`, which clears local storage. Supabase can invalidate server-side depending on config. |
| **Password change / revoke** | Supabase can revoke refresh tokens (e.g. via Dashboard or auth hooks). The next `getUser()` or refresh will fail → we clear local session → user sees sign-in. |
| **App reinstall** | On first launch we clear local auth (see First launch above) so we don’t restore a stale Keychain session. |
