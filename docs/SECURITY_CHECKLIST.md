# Q Mobile: Enterprise Security Checklist

System-level security audit for the React Native/Expo logistics app. Organized by **phase**, with **priority** (P1 critical, P2 high), **automation status**, and **evidence** for stakeholder audits. Aligned with OWASP Mobile Top 10 and enterprise release gates. **Rating:** see [How we rate our security measures](#how-we-rate-our-security-measures) for self-assessment and grade (current: **A**).

---

## Phases Overview

| Phase | Focus | When |
|-------|--------|------|
| **Pre-Development** | Standards, keys, env, compliance mapping | Before feature work / onboarding |
| **Development** | Auth, storage, network, RLS, validation, dependencies | During implementation |
| **Pre-Release** | Automated gates, manual verification, evidence | Before each release / PR merge |
| **Post-Release** | Monitoring, logs, pentests, compliance | After deploy |

---

## Master Table (Auditable)

| Category | Check | Priority | Status | Automation | Evidence | Notes |
|----------|-------|----------|--------|------------|----------|-------|
| **Secrets** | No hardcoded secrets in app code | P1 | ✅ | Linter / Manual | `app.config.js` → `extra` from env | Supabase URL/anon from env only |
| **Secrets** | `.env` and `.env*.local` in `.gitignore` | P1 | ✅ | CI | `.gitignore` | |
| **Secrets** | Example env uses placeholders only | P1 | ✅ | Manual | `.env.local.example` | Placeholders only; rotate keys if real keys were ever committed |
| **Secrets** | Service role key never in app bundle | P1 | ✅ | Manual | `lib/supabase.ts` comment; anon only | Service role only in `scripts/seed-test-data.ts` |
| **Secrets** | Backend proxy for Gemini API key | P1 | ✅ | Manual | `supabase/functions/ops-agent-chat`; app calls proxy when session + URL | OWASP M2; deploy with GEMINI_API_KEY secret |
| **Auth** | Auth via Supabase Auth only | P1 | ✅ | Manual | `features/auth/services/auth.service.ts` | No custom auth |
| **Auth** | Passwords never logged or stored plain text | P1 | ✅ | Manual | `secureTextEntry`; signInWithPassword only | |
| **Auth** | Session in SecureStore (iOS Keychain / Android Keystore) | P1 | ✅ | Manual | `lib/supabase.ts` | Migrated from AsyncStorage |
| **Auth** | Token refresh and expiry handling | P1 | ✅ | Manual | `autoRefreshToken`; onAuthStateChange | |
| **Auth** | Sign-out clears local session | P1 | ✅ | Manual | signOut / signOut({ scope: 'local' }) | |
| **Auth** | Session validated with server | P1 | ✅ | Manual | getSession → getUser() | |
| **Data** | Sensitive inputs use secure entry | P1 | ✅ | Manual | Password fields `secureTextEntry` | |
| **Data** | No PII in production logs | P1 | ✅ | Manual | `lib/logger.ts` __DEV__ gating | |
| **Data** | Avatar: private bucket + signed URLs | P1 | ✅ | Manual | `lib/avatarUpload.ts`; RLS | |
| **Network** | HTTPS for production API | P1 | ✅ | Manual | Supabase URL https | |
| **Network** | Cleartext disabled for production Android | P1 | ✅ | CI / Config | `app.config.js` env-based | OWASP M1: usesCleartextTraffic false when URL is https |
| **Network** | Request timeout and retry | P2 | ✅ | Manual | `lib/supabase.ts` fetchWithTimeoutAndRetry | |
| **AuthZ** | RLS as enforcement layer | P1 | ✅ | Manual | Q-unified-base migrations; anon only | |
| **AuthZ** | Capability-based UI permissions | P2 | ✅ | Manual | `lib/capabilities.ts` | |
| **Dependencies** | No high/critical npm vulnerabilities | P1 | ✅ | CI | `npm audit --audit-level=high` | `.github/workflows/security.yml` |
| **Dependencies** | Lock file committed | P1 | ✅ | CI | `package-lock.json` | |
| **Secrets (repo)** | No secrets in repo history | P1 | ✅ | CI | TruffleHog in workflow | `scripts/pre-release-security-check.sh` |
| **Errors** | No stack traces or internal errors to user | P2 | ✅ | Manual | Generic user messages | |
| **Compliance** | PII screens documented; screenshot policy | P2 | ✅ | Manual | `docs/PII_AND_SCREEN_POLICY.md`; `usePreventScreenCapture` on 6 screens | expo-screen-capture |
| **Compliance** | GDPR checklist (consent, export) if fleet/HR | P2 | ✅ | Manual | `docs/GDPR_CHECKLIST.md` | For regulated data |
| **URLs** | ExternalLink / WebBrowser use allowlisted URLs only | P2 | ✅ | Code | `constants/AllowedUrls.ts`; `components/ExternalLink.tsx` only opens if `isUrlAllowed(href)` | No user-controlled href |
| **Build** | Release builds signed; no unsigned builds in production | P1 | ✅ | Manual | EAS/Expo; store distribution | M8 Code Tampering |
| **Extraneous** | No debug menus or test-only backdoors in production | P2 | ✅ | Manual | __DEV__ gates; no dev-only routes in prod bundle | M10 |
| **Data** | No weak crypto; sensitive data only in SecureStore | P1 | ✅ | Manual | `lib/supabase.ts`; no custom crypto in app | M5 |
| **Post-Release** | Incident response: contact + playbook | P2 | ✅ | Manual | `docs/INCIDENT_RESPONSE.md` | Report, contain, fix, release |

---

## How we rate our security measures

Use this to self-assess and to communicate posture to auditors or stakeholders. Re-run when checks or phases change.

### Rating method

| Dimension | What we measure | Weight | How to score |
|-----------|------------------|--------|--------------|
| **P1 coverage** | All P1 (critical) checks in Master Table + §2 must pass | 50% | % of P1 checks with ✅ (target 100%) |
| **P2 coverage** | P2 (high) checks in Master Table + §2 + §7 | 25% | % of P2 checks with ✅ (target ≥90%) |
| **Phase completion** | All four phases (Pre-Dev, Development, Pre-Release, Post-Release) satisfied | 15% | 25% per phase if pass, else 0% |
| **Automation** | Critical gates automated (audit, secrets, env check) | 10% | CI + script evidence; manual-only = partial |

**Overall grade:** Average of the four dimensions (each 0–100%), then map to:

| Score (0–100%) | Grade | Meaning |
|----------------|--------|--------|
| 90–100 | **A** | Strong; P1 complete, phases and automation in place; suitable for enterprise/regulated use |
| 75–89 | **B** | Good; minor P2 or automation gaps; document and plan remediation |
| 60–74 | **C** | Adequate; some P1 or phase gaps; fix before high-risk rollout |
| Under 60 | **D/F** | Gaps; do not treat as production-ready until P1 and phases are addressed |

### Current self-rating (as of checklist date)

| Dimension | Calculation | Score |
|-----------|-------------|--------|
| P1 coverage | All Master Table + §2 P1 checks ✅ (secrets, auth, data, network, AuthZ, deps, build, M5) | **100%** |
| P2 coverage | P2 checks ✅ (timeout/retry, capabilities, errors, compliance, URLs, build/extraneous, §7 implemented items); optional: cert pinning, idle lock | **~95%** |
| Phase completion | Pre-Dev, Development, Pre-Release, Post-Release all ✅ | **100%** |
| Automation | npm audit + TruffleHog + env script in CI; pre-release script; Dependabot | **100%** |

**Overall: ~99% → Grade A.** P1 and phases complete; automation in place; optional items (certificate pinning, session idle) left for higher-assurance needs.

### How to recalculate

1. Count P1 rows in Master Table and §2 with ✅ → divide by total P1 checks.
2. Count P2 rows (Master + §2 + §7) with ✅ → divide by total P2 checks.
3. Mark each phase pass/fail from §6; 4/4 = 100%.
4. Automation: 100% if CI runs audit + secret scan + env check and pre-release script is run; reduce if any missing.
5. Average the four percentages and apply the grade table above.

---

## 1. Pre-Development

| Check | Priority | Status | Automation | Evidence | OWASP / Standard |
|-------|----------|--------|------------|----------|------------------|
| Verify example env (no real keys); rotate if ever committed | P1 | ✅ | CI / Script | `./scripts/check-env-example-no-secrets.sh`; `docs/KEY_ROTATION.md` | CI runs script; rotate keys only if git history had real keys |
| Backend proxy for Gemini (no EXPO_PUBLIC key in prod) | P1 | ✅ | Manual | `supabase/functions/ops-agent-chat`; set GEMINI_API_KEY secret | M2 Insecure Data Storage |
| `.env.example` / `.env.local.example` placeholders only | P1 | ✅ | Manual | File review | Done; rotate if ever had real keys |
| Map controls to OWASP Mobile Top 10 / ISO 27001 / SOC 2 | P2 | ✅ | Manual | This checklist | M1–M10 mapping below |

**OWASP Mobile Top 10 (reference)**  
- **M1** Improper Platform Usage — cleartext traffic, intents.  
- **M2** Insecure Data Storage — keys in client, session in plain storage.  
- **M3** Insecure Communication — HTTPS, certificate pinning.  
- **M4** Insecure Authentication — auth flow, session.  
- **M5** Insufficient Cryptography — algorithms, key management.  
- **M6** Insecure Authorization — RLS, capability checks.  
- **M7** Client Code Quality — injection, XSS.  
- **M8** Code Tampering — integrity.  
- **M9** Reverse Engineering — obfuscation.  
- **M10** Extraneous Functionality — debug, backdoors.

---

## 2. Development

### 2.1 Authentication & session

| Check | Priority | Status | Automation | Evidence | OWASP ID |
|-------|----------|--------|------------|----------|----------|
| Auth via Supabase Auth only | P1 | ✅ | Manual | auth.service.ts | M4 |
| Passwords never logged or stored plain text | P1 | ✅ | Manual | secureTextEntry; signInWithPassword | M2, M4 |
| Session in SecureStore (Keychain/Keystore) | P1 | ✅ | Manual | lib/supabase.ts custom storage | M2 |
| Token refresh and expiry handling | P1 | ✅ | Manual | autoRefreshToken; onAuthStateChange | M4 |
| Sign-out clears local session | P1 | ✅ | Manual | signOut / scope: 'local' | M4 |
| Session validated with server | P1 | ✅ | Manual | getSession → getUser() | M4 |
| Password validation (client-side) | P2 | ✅ | Manual | lib/validation.ts validatePassword | M4 |

**Recommendation:** Stronger password rules (complexity) and/or server-side policy if required by compliance.

### 2.2 Secrets & configuration

| Check | Priority | Status | Automation | Evidence | OWASP ID |
|-------|----------|--------|------------|----------|----------|
| No hardcoded secrets in app code | P1 | ✅ | Linter/Manual | app.config.js extra from .env | M2 |
| .gitignore includes .env, .env*.local | P1 | ✅ | CI | .gitignore | — |
| Example env placeholders only | P1 | ✅ | Manual | .env.local.example; .env.example | Placeholders only; rotate if real keys ever committed |
| Service role key never in app bundle | P1 | ✅ | Manual | lib/supabase.ts; seed script only | M2 |
| Gemini API key via backend proxy (prod) | P1 | ✅ | Manual | Deploy ops-agent-chat; app uses proxy when session present | M2 |

### 2.3 Data protection

| Check | Priority | Status | Automation | Evidence | OWASP ID |
|-------|----------|--------|------------|----------|----------|
| Sensitive inputs use secure entry | P1 | ✅ | Manual | secureTextEntry on passwords | M2 |
| Session/tokens in SecureStore | P1 | ✅ | Manual | lib/supabase.ts | M2 |
| No PII in logs (production) | P1 | ✅ | Manual | lib/logger.ts __DEV__ | M2 |
| Avatar: private bucket + signed URLs | P1 | ✅ | Manual | lib/avatarUpload.ts; RLS | M2, M3 |
| File upload validation | P1 | ✅ | Manual | Image picker; contentType; path fixed | M7 |

**Recommendation:** For high-sensitivity PII, document screenshot/recording policy; consider `expo-screen-capture` for finance/sensitive screens.

### 2.4 Network & API

| Check | Priority | Status | Automation | Evidence | OWASP ID |
|-------|----------|--------|------------|----------|----------|
| HTTPS for production API | P1 | ✅ | Manual | Supabase URL https | M3 |
| Cleartext disabled for production Android | P1 | ✅ | Config | app.config.js (usesCleartextTraffic by env) | M1 |
| Request timeout and retry | P2 | ✅ | Manual | fetchWithTimeoutAndRetry | — |
| Single backend client | P1 | ✅ | Manual | lib/supabase.ts; no arbitrary URLs | M3 |

### 2.5 Authorization

| Check | Priority | Status | Automation | Evidence | OWASP ID |
|-------|----------|--------|------------|----------|----------|
| RLS as enforcement layer | P1 | ✅ | Manual | Q-unified-base migrations; anon key | M6 |
| Capability-based UI permissions | P2 | ✅ | Manual | lib/capabilities.ts | M6 |
| No client-side–only access control | P1 | ✅ | Manual | All access via Supabase; RLS | M6 |
| Sensitive operations require auth | P1 | ✅ | Manual | supabase() session; RLS/RPC | M6 |

### 2.6 Input validation & injection

| Check | Priority | Status | Automation | Evidence | OWASP ID |
|-------|----------|--------|------------|----------|----------|
| Client-side validation before submit | P1 | ✅ | Manual | lib/validation.ts | M7 |
| Email/phone/full name validated | P1 | ✅ | Manual | validateEmail, validatePhone, etc. | M7 |
| Numeric/amount bounds | P2 | ✅ | Manual | VALIDATION.AMOUNT_MAX, numberInRange | M7 |
| No SQL injection | P1 | ✅ | Manual | Parameterized Supabase client; no raw SQL | M7 |
| No user-controlled HTML / XSS | P1 | ✅ | Manual | No dangerouslySetInnerHTML with user data | M7 |
| Deep links / open redirect | P2 | ✅ | Manual | Linking.openURL / WebBrowser; app-built URLs | M7 |

### 2.7 Dependencies & build

| Check | Priority | Status | Automation | Evidence | OWASP ID |
|-------|----------|--------|------------|----------|----------|
| npm audit (high/critical) in CI | P1 | ✅ | CI | .github/workflows/security.yml | — |
| Lock file committed | P1 | ✅ | CI | package-lock.json | — |
| No arbitrary remote code execution | P2 | ✅ | Manual | Standard Expo/RN stack | M8, M9 |

**Tools:** `npm audit` in CI; consider Snyk/Dependabot for ongoing updates.

### 2.8 Error handling & information disclosure

| Check | Priority | Status | Automation | Evidence | OWASP ID |
|-------|----------|--------|------------|----------|----------|
| No stack traces or internal errors to user | P2 | ✅ | Manual | Generic messages | M10 |
| Auth errors without leaking details | P1 | ✅ | Manual | isSessionExpiredError; "Please sign in again" | M4 |
| Logger level in production | P1 | ✅ | Manual | CURRENT_LEVEL = 'warn' in prod | M10 |

---

## 3. Pre-Release

### 3.1 Automated gates (CI)

| Gate | Priority | Automation | Evidence |
|------|----------|------------|----------|
| `npm audit --audit-level=high` | P1 | CI | `.github/workflows/security.yml` |
| TruffleHog (or equivalent) secret scan | P1 | CI | Same workflow |
| Run pre-release script before release | P1 | Script | `scripts/pre-release-security-check.sh` |

**Run locally:** `./scripts/pre-release-security-check.sh`

### 3.2 Manual verification (before each release)

1. **Secrets:** No real keys in repo; `.env.example` placeholders only; production env from CI/hosting.
2. **HTTPS:** Production Supabase URL is `https://`; production Android has cleartext disabled (env-based).
3. **Auth:** Test sign-in, sign-out, token expiry (e.g. revoke refresh in Dashboard; confirm sign-in prompt).
4. **Permissions:** Test driver-only and org-member accounts; confirm RLS restricts data.
5. **npm audit:** Fix high/critical (CI fails on high).
6. **Logs:** Search `console.log`/`console.info` in production paths; remove or guard with __DEV__.

### 3.3 RLS audit (logistics)

- **Script:** In Q-unified-base, verify policies: `supabase db dump --schema-only` and review RLS policies on tables used by the app.
- **Evidence:** Document which tables have RLS and org/driver scope.

---

## 4. Post-Release

| Activity | Priority | Automation | Evidence |
|----------|----------|------------|----------|
| Supabase logs dashboard | P2 | Manual | Dashboard URL; periodic review |
| Sentry (or equivalent) for crashes | P2 | Manual | Project link; no PII in events |
| Periodic pentests | P2 | Manual | Report dates; findings tracked |
| GDPR: consent, data export (if applicable) | P2 | Manual | Checklist; DPA if needed |
| Incident response | P2 | Manual | `docs/INCIDENT_RESPONSE.md` — security contact, triage, contain, fix, release |

---

## 5. Pro tips (logistics apps)

- **RLS audit:** Use `supabase db dump --schema-only` (in Q-unified-base) to verify and document RLS policies.
- **PII flows:** Mark screens with regulated data (e.g. driver docs, finance); consider disabling screenshots via `expo-screen-capture` for sensitive screens.
- **Compliance:** For fleet/HR data, add a GDPR checklist (consent, data export, retention).

---

## 6. Checklist summary by phase

| Phase | Pass | Warnings / actions |
|-------|------|---------------------|
| Pre-Development | ✅ | Example env verified by script; rotate keys only if history had real keys. Proxy deployed for prod. |
| Development | ✅ | Optional: stronger password policy. |
| Pre-Release | ✅ | Run `./scripts/pre-release-security-check.sh`; CI gates on audit + secrets. |
| Post-Release | ✅ | Supabase logs; Sentry; periodic pentests; GDPR if applicable. |
| **Additional (optional)** | — | See §7; certificate pinning and session idle remain optional. |
| **Security rating** | **A** | Self-rating method and current score: see [How we rate our security measures](#how-we-rate-our-security-measures). |

---

## 7. Additional checks (to gain coverage / optional)

Items below help close gaps and strengthen audits. Implemented items have evidence; others are optional.

| Category | Check | Priority | Status | Automation | Evidence / notes |
|----------|-------|----------|--------|------------|------------------|
| **M3 Communication** | Certificate pinning for API | P2 | — | Manual | Not implemented; consider for high-assurance. Supabase + HTTPS is standard. |
| **M5 Cryptography** | No weak crypto; local sensitive data only in SecureStore | P1 | ✅ | Manual | Master Table + §2.3; `lib/supabase.ts`. |
| **Clipboard** | Clear clipboard after copy of chat content | P2 | ✅ | Code | `useOpsAgentChat.ts`: clear after 60s + cleanup on unmount; avoids long-lived sensitive content. |
| **Session / idle** | App backgrounding or idle timeout | P2 | — | Manual | Optional: lock or re-auth after idle. Supabase session remains valid until expiry. |
| **Backup** | No sensitive data in Android backup if any | P2 | ✅ | Config | Expo/SecureStore not in backup by default. If adding local DB, ensure not in allowBackup. |
| **M8 / M9** | Release obfuscation / minification | P2 | ✅ | Build | Expo production: Hermes + minification. |
| **Incident response** | Security contact and incident playbook | P2 | ✅ | Manual | `docs/INCIDENT_RESPONSE.md`. |
| **Dependency alerts** | Dependabot or Snyk for ongoing alerts | P2 | ✅ | CI | `.github/dependabot.yml` (weekly npm + github-actions). |
| **URL allowlist** | ExternalLink href from allowlist only | P2 | ✅ | Code | `constants/AllowedUrls.ts`; `ExternalLink` opens only if `isUrlAllowed(href)`. |

---

## References

- Supabase Auth: https://supabase.com/docs/guides/auth
- RLS: `docs/LOCAL_SUPABASE.md`, Q-unified-base `supabase/migrations/`
- Avatar storage: `docs/AVATAR_STORAGE_RLS.md`
- Capabilities: `lib/capabilities.ts`, `.cursor/rules/q-mobile-standards.mdc`
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/
- Security workflow: `.github/workflows/security.yml`
- Pre-release script: `scripts/pre-release-security-check.sh`
- Key rotation: `docs/KEY_ROTATION.md`
- PII/screenshot policy: `docs/PII_AND_SCREEN_POLICY.md`
- GDPR: `docs/GDPR_CHECKLIST.md`
- Ops Agent proxy: `supabase/functions/ops-agent-chat` (deploy with `GEMINI_API_KEY` secret)
- Incident response: `docs/INCIDENT_RESPONSE.md`
- Allowed URLs: `constants/AllowedUrls.ts`
- Dependabot: `.github/dependabot.yml`
- Security rating: § “How we rate our security measures” in this doc
