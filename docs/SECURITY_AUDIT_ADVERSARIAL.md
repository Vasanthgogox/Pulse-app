# Pulse: Comprehensive Adversarial Security Audit

**Date:** March 2025  
**Scope:** Architecture, infrastructure, backend, frontend, database, data flows  
**Methodology:** Adversarial review of codebase, config, CI, and docs  

**Post-audit fixes applied:** JWT verification in ops-agent-chat (§8.4), production Gemini key stripped in app.config.js (EAS builds), comment in +html.tsx, AsyncStorage fallback note in lib/supabase.ts.

---

## Executive Summary

| Dimension | Score (1–10) | Summary |
|-----------|--------------|---------|
| Application Security | 7 | Strong auth and parameterized access; **Edge Function does not verify JWT** (critical). |
| Data Security | 8 | Good encryption, SecureStore, no PII in prod logs; **Gemini key can leak into bundle** if misconfigured. |
| System & Architecture | 8 | Clear boundaries, RLS, capability-based UI; service role correctly isolated to scripts. |
| Infrastructure & Deployment | 8 | CI gates, Dependabot, env separation; no container/cloud config in repo. |
| Attack Surface | 7 | Supabase + Edge Function + app; **proxy abuse and key exposure** are main risks. |
| Code-Level Security | 8 | No raw SQL, validation layer, URL allowlist; one `dangerouslySetInnerHTML` (static only). |
| Worst-Case Resilience | 6 | RLS limits blast radius; **unverified proxy allows quota abuse and potential prompt abuse**. |

**Overall security score: 7.4 / 10**

**Critical:** 1 (Edge Function JWT not verified)  
**High:** 2 (CORS permissive; Gemini key in bundle when set)  
**Medium:** 4  
**Low:** 3  

---

## 1. Application Security

### 1.1 SQL Injection, XSS, CSRF, Command Injection, SSRF

| Threat | Status | Evidence |
|--------|--------|----------|
| **SQL Injection** | ✅ Mitigated | All data access via Supabase client (`.from()`, `.rpc()` with typed params). No raw SQL or string concatenation in app code. RLS and parameterized queries in DB. |
| **XSS** | ✅ Mitigated | React escapes by default. Single `dangerouslySetInnerHTML` in `app/+html.tsx` uses a **static** string (`responsiveBackground`), not user input. No user-controlled HTML. |
| **CSRF** | ✅ N/A (token-based) | Auth is JWT in `Authorization` header and SecureStore; no cookie-based session. CSRF not applicable for API-style usage. |
| **Command injection** | ✅ N/A | No `exec`, `spawn`, or shell invocation of user input in app or Edge Function. |
| **SSRF** | ✅ Mitigated | No server-side fetch of user-supplied URLs. App uses fixed Supabase URL and proxy URL; `ExternalLink` only opens allowlisted URLs (`constants/AllowedUrls.ts`). |

**Recommendation:** Add a one-line comment in `+html.tsx` next to `dangerouslySetInnerHTML`: `// Static CSS only; no user input.` to prevent future misuse.

### 1.2 Authentication and Authorization

- **Auth:** Supabase Auth only (`features/auth/services/auth.service.ts`). Sign-in/sign-up use `signInWithPassword` / `signUp` with validated email/password. No custom auth or password storage.
- **Session:** Stored in SecureStore when available (iOS Keychain / Android Keystore); fallback to AsyncStorage on web or when Expo SecureStore is unavailable (e.g. Expo Go). Session validated with server via `getUser()` (not only local `getSession()`).
- **Token refresh:** `autoRefreshToken: true`; `onAuthStateChange` clears local session on invalid refresh.
- **Authorization:** RLS is the enforcement layer (pulse-unified-base migrations). App uses anon key only; capability-based UI in `lib/capabilities.ts` (no client-only access control for data—RLS enforced server-side).

**Gap:** **Critical — ops-agent-chat Edge Function does not verify the JWT.** It only checks `Authorization` header starts with `Bearer `. Any caller (including unauthenticated) can send `Bearer dummy` and the function will call Gemini, consuming quota and allowing prompt injection / abuse. See §7 and §8 for fix.

### 1.3 Session Management and Token Security

- Session persisted in SecureStore (or AsyncStorage fallback).
- Sign-out calls `supabase().auth.signOut()` and clears local state.
- Auth errors (e.g. refresh token not found) trigger `clearLocalSessionIfInvalid` and sign-out (scope: local).
- Passwords only in memory and Supabase Auth; `secureTextEntry` on password fields.

**Recommendation:** Document that in Expo Go / web, session falls back to AsyncStorage (less secure); production builds should use native SecureStore.

### 1.4 API Endpoint Protection and Rate Limiting

- **Supabase REST/PostgREST:** Protected by RLS; anon key has no bypass. No app-level rate limiting (Supabase/PostgREST may apply platform limits).
- **Edge Function (ops-agent-chat):** No JWT verification (critical). No rate limiting at function level. In-memory rate limit exists in **app** (`opsAgentService.ts`: 5 creates/min per user) for tool-calling only, not for proxy calls.
- **Sign-in/sign-up:** Handled by Supabase Auth; brute-force protection is on Supabase side (e.g. rate limits, account lockout if configured).

**Recommendation:** Add JWT verification and optional rate limiting (per user or per IP) in ops-agent-chat. See §8.

---

## 2. Data Security

### 2.1 Protection of User Data and Credentials

- User credentials: Supabase Auth only; no plaintext passwords in app or logs.
- Sensitive inputs: Password fields use `secureTextEntry`.
- PII screens: Documented in `docs/PII_AND_SCREEN_POLICY.md`; screenshot/recording disabled on 6 screens via `usePreventScreenCapture` (expo-screen-capture).
- Avatar: Private bucket + signed URLs (`lib/avatarUpload.ts`); path fixed as `{userId}/avatar.jpg` (no user-controlled path).

### 2.2 Encryption (At Rest and in Transit)

- **Transit:** HTTPS for production Supabase URL. Cleartext disabled for Android when URL is `https` (`app.config.js`: `usesCleartextTraffic`).
- **At rest (client):** Session in SecureStore (encrypted by platform). No custom crypto in app; no sensitive data in AsyncStorage in production native builds when SecureStore is used.

### 2.3 Exposure in Logs, APIs, or Client-Side

- **Logs:** `lib/logger.ts` uses `CURRENT_LEVEL = __DEV__ ? 'debug' : 'warn'`; production does not log debug/info. Checklist states no PII in production logs.
- **APIs:** Supabase anon key is public by design; RLS enforces access. No internal error details or stack traces shown to user (generic messages).
- **Client bundle:** **High risk — Gemini API key.** `app.config.js` loads `EXPO_PUBLIC_GEMINI_API_KEY` and puts it in `extra.geminiApiKey`. If this env var is set in a production build (e.g. EAS env), the key is embedded in the app bundle. Checklist says “backend proxy for prod” but the config does not exclude the key from `extra` in production. **Fix:** Do not set `EXPO_PUBLIC_GEMINI_API_KEY` in production EAS/env; or in `app.config.js`, only add `geminiApiKey` to `extra` when building for dev (e.g. detect `__DEV__` or a dedicated env like `EXPO_PUBLIC_USE_CLIENT_GEMINI=1` for local only).

### 2.4 Secrets Management

- `.env` and `.env*.local` in `.gitignore`. Example files use placeholders; `scripts/check-env-example-no-secrets.sh` rejects JWT-like values in example files (CI in `security.yml`).
- Service role key: Used only in `scripts/seed-test-data.ts` (loaded from `.env`); script validates key role is `service_role`. Not used in app (`lib/supabase.ts` comment).
- Edge Function: `GEMINI_API_KEY` from Deno env (Supabase secrets); not in client.
- **Recommendation:** Ensure production builds (EAS) never set `EXPO_PUBLIC_GEMINI_API_KEY`; use only proxy URL.

---

## 3. System & Architecture Security

### 3.1 Overall Architecture Posture

- Single backend: Supabase (Postgres + Auth + Storage + Edge Functions). Same DB as pulse-unified-base; schema/migrations in pulse-unified-base; app is client.
- Trust boundaries: App (anon key) → Supabase API (RLS) → Postgres. Edge Function (ops-agent-chat) holds Gemini key; app sends session token but **function does not verify it** (see §1.2, §8).

### 3.2 Trust Boundaries and Service Isolation

- RLS enforces org/user/driver scope on tables. Capability checks in app are for UI only; data access always via Supabase with RLS.
- Seed script uses service role only in script context; not in app bundle.

### 3.3 Database Access and Least Privilege

- App uses anon key only; all writes/reads subject to RLS. No raw SQL; all via client `.from()`, `.rpc()` with parameters.
- Service role used only in `scripts/seed-test-data.ts` for seeding; not exposed to client.

### 3.4 Uploads, Files, and External Integrations

- **Avatar upload:** Image picker → resize (ImageManipulator) → upload to private bucket with fixed path `{userId}/avatar.jpg`, `contentType: 'image/jpeg'`. RLS on bucket. No path traversal.
- **External URLs:** `ExternalLink` and `WebBrowser` only open URLs that pass `isUrlAllowed()` (allowlist in `constants/AllowedUrls.ts`). No user-controlled `href` for external navigation.
- **LedgerReportModal:** `Linking.openURL` used with app-built `whatsapp://send?text=...` (content from app-generated report); not user-supplied URL. Acceptable.

---

## 4. Infrastructure & Deployment

### 4.1 Server Configuration

- No app-owned server in repo; Supabase is managed. Edge Function is minimal (single handler, no extra services).

### 4.2 Environment Separation

- Dev: `.env` / `.env.local`; seed uses `.env` only. Production: Env from EAS/hosting; checklist says production uses proxy for Gemini and no client key.
- **Risk:** Production build with `EXPO_PUBLIC_GEMINI_API_KEY` set would embed key (see §2.3).

### 4.3 Container / Cloud Security

- No Dockerfile or K8s in repo. Supabase runs Edge Functions on Deno Deploy. No container-specific findings.

### 4.4 Dependencies and Supply Chain

- `npm audit --audit-level=high` in CI (`.github/workflows/security.yml`). Lock file committed. Dependabot in `.github/dependabot.yml` for npm and github-actions.
- **Current run:** 0 high/critical vulnerabilities reported.

---

## 5. Attack Surface Analysis

### 5.1 Entry Points

| Entry point | Auth | Risk |
|-------------|------|------|
| Supabase REST/PostgREST | Anon key + RLS | Low if RLS correct; no app-level rate limit. |
| Supabase Auth (sign-in, sign-up) | None (public) | Brute-force on Supabase; no app-level lockout. |
| Edge Function `ops-agent-chat` | Bearer present but **not verified** | **High:** Unauthenticated abuse, quota burn, prompt injection. |
| App UI (forms, deep links) | Session required for data | Validation and RLS; deep links use app-built or allowlisted URLs. |

### 5.2 Data Theft, Privilege Escalation, Lateral Movement

- **Data theft:** RLS limits rows by org/user/driver. Bypass would require RLS misconfiguration (in pulse-unified-base), not in this repo.
- **Privilege escalation:** Capabilities derived from profile (aggregated/asset/role); RLS enforces at DB. No client-side-only privilege grant.
- **Lateral movement:** No secondary services or internal APIs in app; Supabase is the single backend. Edge Function does not access DB with caller identity (only forwards to Gemini)—so no lateral DB access via function, but unverified caller can still abuse Gemini.

### 5.3 Brute Force, Scraping, Bot Abuse

- Sign-in: Supabase rate limits apply; app does not add extra lockout.
- **ops-agent-chat:** No rate limit. Unauthenticated or forged Bearer requests can exhaust Gemini quota and/or abuse prompts. **Fix:** Verify JWT and add rate limiting (per user after verification, or per IP before verification).

---

## 6. Code-Level Review

### 6.1 Insecure Patterns

- **ops-agent-chat:** Accepts any `Bearer <token>`; does not validate JWT (critical). See §8 for exact fix.
- **app.config.js:** Puts `geminiApiKey` into `extra` whenever env is set; production build with that env leaks key (high). Prefer omitting from `extra` in production or when proxy URL is set.

### 6.2 Database Queries

- All queries via Supabase client; no raw SQL, no string interpolation in query text. RPCs use object parameters (e.g. `get_invitee_by_phone`, `get_trips_where_org_is_client`). Safe.

### 6.3 Validation, Sanitization, Error Handling

- **Validation:** `lib/validation.ts`, `lib/emailValidation.ts`, `lib/phoneValidation.ts` used in auth and services (e.g. clients, suppliers, drivers, trips). Single pass before Supabase calls.
- **Error handling:** Auth errors mapped to generic messages; `isSessionExpiredError` used to clear session without leaking details. No stack traces to user.
- **URLs:** External links only via allowlist. No `dangerouslySetInnerHTML` with user data.

---

## 7. Worst-Case Scenario Analysis

### 7.1 If the Edge Function Is Abused (Current State)

- **Unverified JWT:** Attacker can call `POST /functions/v1/ops-agent-chat` with `Authorization: Bearer x` and arbitrary body. Result: Gemini API is called; quota/cost impact; attacker could send prompts that trigger tool calls—but tool calls are executed **in the app** with the **app’s** Supabase client (session). So the Edge Function itself does not execute tool calls; it only returns Gemini’s response (text + function calls). The app would need to be the one calling the proxy with a valid session to perform creates. So direct unauthenticated call to the function: **quota/cost abuse and prompt injection to Gemini**, not direct DB or app actions. If an attacker also obtained a valid user JWT (e.g. phishing), they could use the proxy to run tool-calling flows as that user. **Mitigation:** Verify JWT in the Edge Function so only authenticated users can use the proxy; add rate limiting to limit quota abuse.

### 7.2 If RLS Is Bypassed (e.g. Misconfiguration in pulse-unified-base)

- Blast radius: All data under affected tables (clients, trips, drivers, etc.). App uses anon key only; RLS is the sole enforcement. Recommendation: Periodic RLS audit (e.g. `supabase db dump --schema-only` and review policies) as in checklist.

### 7.3 If Gemini Key Is in Client Bundle

- Attacker with app binary could extract key and use Gemini API directly. Mitigation: Never set `EXPO_PUBLIC_GEMINI_API_KEY` in production; use proxy only; optionally strip from `extra` in production build.

### 7.4 Data Exposure and System Takeover

- No single “system takeover” from app alone; Supabase and DB are separate. Worst case: compromised user session (e.g. stolen refresh token) → access to that user’s org data per RLS. SecureStore and token refresh handling limit exposure. Incident response in `docs/INCIDENT_RESPONSE.md`; key rotation in `docs/KEY_ROTATION.md`.

---

## 8. Mandatory Output

### 8.1 Security Score: **7.4 / 10**

- Strong: Auth design, RLS, no SQL injection, validation, URL allowlist, SecureStore, CI (audit + secrets), PII/screenshot policy.
- Critical gap: Edge Function does not verify JWT.
- High gaps: CORS `*` on function; Gemini key can be embedded if env is set in prod.

### 8.2 Critical Vulnerabilities

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| 1 | **Edge Function does not verify JWT** | `supabase/functions/ops-agent-chat/index.ts` | **FIXED.** JWT is now verified via `supabase.auth.getUser(token)`; only authenticated users can call the proxy. |

### 8.3 High / Medium / Low Risk Findings

**High**

| # | Finding | Location |
|---|---------|----------|
| H1 | **CORS `Access-Control-Allow-Origin: *`** on ops-agent-chat | `supabase/functions/ops-agent-chat/index.ts` |
| H2 | **Gemini API key in client bundle** when `EXPO_PUBLIC_GEMINI_API_KEY` is set in production build | `app.config.js` → `extra.geminiApiKey` — **MITIGATED:** `extra.geminiApiKey` is set to `undefined` when `EAS_BUILD === 'true'`. |

**Medium**

| # | Finding | Location |
|---|---------|----------|
| M1 | No rate limiting on Edge Function | ops-agent-chat |
| M2 | Session fallback to AsyncStorage (Expo Go/web) not prominently documented for security | `lib/supabase.ts` |
| M3 | Password policy is length-only (6–128 chars); no complexity | `lib/validation.ts` |
| M4 | Error message from Supabase Auth sometimes returned to user (e.g. “Invalid login credentials”) | auth.service.ts / sign-in UI |

**Low**

| # | Finding | Location |
|---|---------|----------|
| L1 | `dangerouslySetInnerHTML` with static CSS; add comment to prevent future misuse | `app/+html.tsx` |
| L2 | LOCAL_SUPABASE.md shows truncated JWT example (`eyJ...`); ensure no full secret ever committed | `docs/LOCAL_SUPABASE.md` |
| L3 | Dependabot runs weekly; consider grouping or auto-merge for patch/minor | `.github/dependabot.yml` |

### 8.4 Exact Fixes and Architectural Improvements

**Critical: Verify JWT in ops-agent-chat**

Supabase Edge Functions no longer verify JWT by default. Verify the Bearer token and reject invalid/missing auth.

Option A — Supabase `getUser` (recommended):

```ts
// supabase/functions/ops-agent-chat/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!; // or use SB_PUBLISHABLE_KEY if set

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Continue with existing body parsing and Gemini call...
});
```

Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or publishable key) are available in the Edge Function environment (Supabase injects these for deployed functions). If not, add them as secrets.

**High H1: Restrict CORS (after JWT verification)**

- Keep `*` only if you need any origin (e.g. web app on unknown domain). Otherwise restrict to your app’s origins, e.g. `https://your-app-domain.com` and custom scheme for native (e.g. `pulse://`). Example: `Access-Control-Allow-Origin: req.headers.get('Origin') || '*'` with an allowlist check.

**High H2: Do not embed Gemini key in production**

- In `app.config.js`, only add `geminiApiKey` to `extra` when intentionally building for dev/local with client-side Gemini, for example:
  - Omit `geminiApiKey` from `extra` when `process.env.EAS_BUILD === 'true'` (EAS production builds), or
  - Only set `extra.geminiApiKey` when `process.env.EXPO_PUBLIC_USE_CLIENT_GEMINI === '1'` and not in production.
- In EAS and production env, never set `EXPO_PUBLIC_GEMINI_API_KEY`. Use only proxy URL.

**Medium M1: Rate limiting in Edge Function**

- After JWT verification, add per-user rate limiting (e.g. in-memory Map of userId → request timestamps, or use Supabase/Upstash/KV). Limit e.g. 20 requests per minute per user; return 429 when exceeded.

**Medium M2:** Add a short note in `lib/supabase.ts` or `docs/SECURITY_CHECKLIST.md`: “On web or when SecureStore is unavailable (e.g. Expo Go), session falls back to AsyncStorage, which is less secure; production native builds should use SecureStore.”

**Medium M3 / M4:** Optional: strengthen password validation (e.g. complexity) and normalize auth error messages to a single generic “Sign-in failed” in UI while logging details only in __DEV__.

**Low L1:** In `app/+html.tsx`, add comment: `{/* Static CSS only; no user input — safe for dangerouslySetInnerHTML */}`.

### 8.5 Production-Grade Hardening Recommendations

1. **Implement JWT verification in ops-agent-chat** (critical) and deploy; then tighten CORS and add rate limiting.
2. **Ensure production builds never embed Gemini key:** Config change + EAS/env discipline; document in KEY_ROTATION and SECURITY_CHECKLIST.
3. **RLS audit:** Periodically review RLS policies (e.g. in pulse-unified-base) for tables used by the app; document in checklist.
4. **Optional:** Certificate pinning for Supabase URL (high-assurance); session idle lock (re-auth after N minutes inactive).
5. **Optional:** Stricter password policy and generic sign-in error message in UI.
6. Keep current controls: npm audit + TruffleHog in CI, Dependabot, pre-release script, incident response and key rotation docs, PII/screenshot policy, URL allowlist.

---

## References

- `docs/SECURITY_CHECKLIST.md` — Master table and phase checks
- `docs/INCIDENT_RESPONSE.md` — Reporting and containment
- `docs/KEY_ROTATION.md` — Key rotation
- `docs/PII_AND_SCREEN_POLICY.md` — PII screens and screenshot policy
- Supabase Edge Functions auth: https://supabase.com/docs/guides/functions/auth
- OWASP Mobile Top 10 — M1–M10 mapping in SECURITY_CHECKLIST
