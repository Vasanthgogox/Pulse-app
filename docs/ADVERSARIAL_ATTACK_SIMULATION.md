# How Attackers Would Actually Target This App

**Purpose:** Step-by-step simulation of real attack paths so you see exactly what fails (good) and what would need to be fixed. Use this for penetration-test thinking and to explain security to your team.

---

## 1. Direct API / Database Attack

### What the attacker does

- Gets your **anon key** (it’s in every app binary and in browser devtools if you have a web build).
- Calls PostgREST directly:

```bash
curl -X GET "https://YOUR_PROJECT.supabase.co/rest/v1/clients?select=*" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer ANY_JWT_OR_NONE"
```

### Outcome

- **RLS runs on every row.** Queries return only rows the policy allows for that identity.
- With no valid JWT or with a random token: no (or empty) data, or 401 from Auth.
- With a stolen user JWT: only that user’s org data (by design). No cross-org dump.

**Conclusion:** Direct DB/API access does **not** bypass RLS. Attacker cannot dump all clients/trips/drivers.

---

## 2. RLS Bypass Attempts

### 2.1 Wrong org_id

- Attacker has a valid JWT for user A (org X). They try to read org Y’s data by guessing client UUIDs or by setting `organization_id=org_y` in filters.
- **Outcome:** RLS policies filter by `auth.jwt() ->> 'sub'` and org membership. RLS ignores client-supplied `organization_id` for policy checks (policies use `organization_id` from the row and require membership). So they get no rows for org Y.

### 2.2 SQL injection via REST

- Attacker sends: `?order=name;DROP TABLE clients--` or similar in query params.
- **Outcome:** PostgREST does not concatenate that into raw SQL. It uses parameterized queries. No injection.

### 2.3 Escalation to “admin”

- Attacker tries to call a privileged RPC or to update `organization_members.role` to gain more capabilities.
- **Outcome:** Only RPCs and tables that exist and are allowed to anon/authenticated are exposed. RLS and function `SECURITY DEFINER` logic enforce who can do what. No “superuser” from the anon key.

**Conclusion:** RLS is the main protection. Bypass would require a bug in **policies or RPCs** (in Q-unified-base), not in this app.

---

## 3. Token / Session Attacks

### 3.1 Forged JWT

- Attacker crafts a JWT with `sub: victim-user-id` and signs it with a **wrong** secret (or none).
- **Outcome:** Supabase Auth uses asymmetric signing. Verification fails; request is treated as unauthenticated or invalid. No access to victim’s data.

### 3.2 Stolen refresh token

- Attacker gets the refresh token from a compromised device or backup.
- **Outcome:** They can get a new access token and act as that user until token rotation or revoke. **Mitigation:** SecureStore (Keychain/Keystore), short-lived access tokens, and revoking on sign-out / password change. No way to “unsteal” after the fact except revoke and re-auth.

### 3.3 Replay of old access token

- Attacker captures a valid access token and replays it after it’s expired.
- **Outcome:** Supabase validates expiry. Expired token → 401. No replay benefit beyond the token’s lifetime.

**Conclusion:** Real risk is **token theft** (device/phishing). Architecture (JWT + RLS + SecureStore) is sound; focus on device security and revoke flows.

---

## 4. Gemini Proxy Abuse (Before vs After Fixes)

### 4.1 Before JWT verification (historical)

- Attacker sends:

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/ops-agent-chat" \
  -H "Authorization: Bearer fake" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hi"}]}]}'
```

- **Outcome (old):** Function only checked “Bearer present”. Request was accepted; Gemini was called. Result: quota/cost abuse and prompt injection **to Gemini**, not to your DB.

### 4.2 After JWT verification (current)

- Same request with `Bearer fake`.
- **Outcome:** Function calls `supabase.auth.getUser(token)`. Invalid token → **401 Unauthorized**. Gemini is never called. No quota burn, no cost.

### 4.3 After rate limiting (current)

- Attacker has a valid stolen JWT and sends 100 requests in one minute.
- **Outcome:** After 20 requests, function returns **429 Too Many Requests**. Abuse is capped per user.

### 4.4 Prompt injection (still possible in principle)

- Attacker (with valid account) sends prompts designed to make the model ignore instructions or leak data from the conversation.
- **Outcome:** This is a **model/UX** risk, not a backend bypass. Tool calls (create client, trip, etc.) are executed **in the app** with the **app’s** Supabase client (the same user’s session). So they cannot create data in another org. They can only abuse their own quota and try to confuse the assistant. **Mitigation:** Rate limit (done), monitoring, and optional content filters.

**Conclusion:** Proxy is now protected by **identity (JWT)** and **rate limit**. Worst case is a compromised account abusing their own quota, not open internet abuse.

---

## 5. Data Exfiltration via the App

### 5.1 Attacker is a normal user

- They use the app and try to see another org’s data by changing IDs in the UI or by calling APIs with different `organization_id` / resource IDs.
- **Outcome:** All API calls go through Supabase with their JWT. RLS restricts rows to their org(s). They only see their own data. No exfil beyond what they’re allowed to see.

### 5.2 Attacker has one compromised org account

- They export or screenshot everything they can see in the app.
- **Outcome:** They get that org’s data only. RLS prevents access to other orgs. Limit damage by revoking that user’s session and rotating credentials.

**Conclusion:** Exfiltration is bounded by **RLS and org membership**. No “one query returns entire DB.”

---

## 6. Client-Side / Mobile Specifics

### 6.1 Extract Gemini key from APK/IPA

- **Before fix:** If `EXPO_PUBLIC_GEMINI_API_KEY` was in the production build, attacker could decompress the bundle and search for the key, then call Gemini directly.
- **After fix:** Production EAS builds do not embed the key (`EAS_BUILD=true` → `extra.geminiApiKey` omitted). Key is only in the Edge Function. So even if they extract env/extra from the app, there is no Gemini key.

### 6.2 Extract anon key

- Attacker can always get the anon key from the app. That’s expected: anon key is public; **RLS** is the real control. No extra exposure from this.

### 6.3 XSS / open redirect

- **XSS:** React escapes output; no `dangerouslySetInnerHTML` with user input. No classic XSS vector in the audited code.
- **Open redirect:** External links go through `ExternalLink` and an allowlist. User-controlled URLs are not opened. No open redirect to arbitrary sites.

**Conclusion:** Hardening (no Gemini key in prod, allowlist, React defaults) matches the intended threat model.

---

## 7. Summary: What Attackers Can and Cannot Do

| Attack | Can do? | Why |
|--------|--------|-----|
| Dump DB via API | No | RLS; anon key has no bypass |
| Bypass RLS with SQLi | No | Parameterized queries |
| Use forged JWT | No | Signature verification |
| Abuse Gemini proxy (no account) | No | JWT verification on proxy |
| Abuse Gemini proxy (with account) | Limited | Rate limit 20/min per user |
| Steal Gemini key from app | No (prod) | Key not in production bundle |
| Exfiltrate other orgs’ data | No | RLS and org membership |
| Steal session from device | Yes (device compromise) | Mitigate with SecureStore, revoke, re-auth |

---

## 8. Suggested Next Steps (Operational)

1. **Periodic RLS audit** (in Q-unified-base): Review policies for tables used by the app; ensure no missing or over-permissive policies.
2. **Monitor proxy usage:** Log 401/429 and high request counts per user in the Edge Function or in Supabase logs to spot abuse or stolen tokens.
3. **Incident playbook:** Keep `docs/INCIDENT_RESPONSE.md` and key rotation (`docs/KEY_ROTATION.md`) up to date; practice revoking a user and rotating secrets once.
4. **Optional:** Stricter password policy and generic sign-in error message to reduce account takeover and enumeration.

This document reflects the **current** state after JWT verification, rate limiting, and Gemini key stripping in production builds.
