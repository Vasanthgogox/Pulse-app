# Operational security

Hardening and operations so the system stays **resilient in production**: monitoring, headers, token settings, RLS audits, backups, and recurring tasks.

---

## 1. Monitoring & detection

### Security logging (Edge Function)

The **ops-agent-chat** function emits structured security events to the console. In Supabase Dashboard → Logs → Edge Function logs, search for:

```
SECURITY_EVENT
```

Event types:

| Type | Meaning |
|------|--------|
| `auth_failure` | Missing/invalid Bearer or JWT verification failed (e.g. token abuse, bot) |
| `rate_limit` | User exceeded 20 requests/minute (possible abuse or misbehaving client) |
| `invalid_request` | Invalid JSON body or missing `contents` array |
| `suspicious_prompt` | Total prompt payload length > 50k chars (possible injection or abuse) |

Each event includes `time`, and where applicable `userId`, `ip` (from `x-forwarded-for` / `x-real-ip`), and `detail`. **No user prompt text or PII is logged.**

Use these to:

- Detect bot attacks (many `auth_failure` from same IP).
- Detect token abuse (repeated `rate_limit` for same user).
- Triage prompt-injection attempts (`suspicious_prompt` or spikes in `invalid_request`).

### Supabase dashboard monitoring

Enable and periodically review:

- **Edge Function logs** — Filter by `SECURITY_EVENT`; set alerts for high volume of auth_failure or rate_limit.
- **Auth logs** — Failed sign-ins, password resets, suspicious sign-in locations.
- **Database logs** — Unusual query volume or errors (if available in your plan).

### Alerts to consider

- Spike in Edge Function 401/429 responses.
- Repeated auth failures from the same IP or for the same endpoint.
- Unusual API traffic (e.g. 10x baseline) in Supabase metrics.

---

## 2. Security headers (web version)

If you add a **web** version of the app (e.g. Next.js or static site behind a server), add these HTTP response headers to reduce clickjacking, script injection, and MIME sniffing:

| Header | Example value | Purpose |
|--------|----------------|--------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'` (tune as needed) | Restrict script/source origins |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforce HTTPS |

Configure these on the **web server or host** (Vercel, Netlify, nginx, etc.), not in the React/Expo app. This repo does not ship a web server; when you do, add headers there.

---

## 3. Token lifetimes

Supabase Auth uses access and refresh tokens. Shorter access token lifetime reduces the window for stolen-token replay.

- **Access token:** e.g. 1 hour (Supabase default is often 1h; verify in Dashboard → Authentication → Settings).
- **Refresh token:** e.g. 7–30 days depending on your UX and risk tolerance.

**Action:** In Supabase Dashboard → Authentication → Settings, confirm JWT expiry and refresh behaviour. Shorten access token if your app can tolerate more frequent refresh.

---

## 4. Database security audit (RLS)

Your main data protection is **Row Level Security (RLS)**. Policies live in **pulse-unified-base** migrations; this app is a client. Audit periodically so no table or policy is misconfigured.

### Checklist (per table used by the app)

- [ ] RLS is **enabled** on the table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- [ ] No policy uses `USING (true)` or equivalent that allows all rows.
- [ ] Policies restrict by identity and org, e.g.:
  - `auth.uid()` (or equivalent) and `organization_id` in a membership table, or
  - `user_id = auth.uid()` where appropriate.
- [ ] No **service_role** usage in the app; only in scripts/CI (e.g. seed).

### How to audit

From **pulse-unified-base** (where migrations live):

```bash
supabase db dump --schema-only
```

Inspect the dump for:

- `CREATE POLICY` and `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- Any table missing RLS that holds user/org data.
- Policies that reference `auth.uid()` or proper org membership.

Run this **at least monthly** (see §10) and after any new table or RLS change.

---

## 5. Backup strategy

Security also means **availability and recoverability**.

### Database backups

- **Supabase:** Enable automatic backups in Dashboard → Project Settings → Database (plan-dependent). Verify retention and restore process.
- **Restore test:** Periodically run a restore in a staging/preprod project and verify data and app behaviour. Document the steps (e.g. “restore from backup → run migrations if needed → smoke test”).

### Storage backups

- **Avatar bucket:** Supabase Storage (avatars) should be included in your backup or disaster-recovery plan if you rely on it for critical data. Use Supabase’s backup/restore or a separate backup job if required.

---

## 6. Abuse protection (beyond rate limiting)

- **Rate limiting:** Already in place in ops-agent-chat (20 requests/min per user). See `supabase/functions/ops-agent-chat/README.md`.
- **IP blocking:** For repeated abuse (e.g. many `auth_failure` from one IP), you can add logic to temporarily block an IP using Redis, Supabase KV, or an in-memory map in the Edge Function. Not implemented by default; add if you see abuse patterns.
- **Bot detection:** If you add public web traffic, consider Cloudflare or similar for bot protection. Not required for mobile-only.

---

## 7. Incident response readiness

- **Playbook:** `docs/INCIDENT_RESPONSE.md` — reporting, triage, contain, fix, release, post-mortem.
- **Emergency steps:** Rotate keys, disable Edge Function if needed, force logout users, audit logs. See “Emergency playbook” in that doc.
- **Test once:** Run through the emergency playbook in a non-production environment so the team knows how to rotate keys and where to find logs.

---

## 8. Penetration testing (periodic)

Use these scenarios to verify controls. See also `docs/ADVERSARIAL_ATTACK_SIMULATION.md`.

| Test | How | Expected |
|------|-----|----------|
| **SQL injection** | Send `' OR 1=1--` in input fields (e.g. search, name). | No injection; parameterized queries; no extra rows. |
| **Token forgery** | Call Edge Function with `Authorization: Bearer fake_token`. | 401 Unauthorized; no Gemini call. |
| **Rate limit** | Send 25+ requests in 1 minute with valid JWT. | 429 Too Many Requests after 20. |
| **RLS bypass** | With a valid user token, query another org’s resource (e.g. different `organization_id`). | Empty result or 403; no cross-org data. |

Run **at least quarterly** (see §10); document results and fix any finding.

---

## 9. Optional (elite) security

- **Certificate pinning (mobile):** Reduces MITM risk on compromised networks; requires native config (e.g. OkHttp / NSURLSession pinning). Consider for high-assurance deployments.
- **Device integrity:** Detect rooted/jailbroken devices if your compliance or risk model requires it; often not needed for typical B2B logistics.
- **Audit trail:** Log sensitive actions (e.g. “user created trip”, “user deleted client”, “user changed financial entry”) in an audit table for forensics and compliance. Can be added incrementally.

---

## 10. Recurring schedule

| Frequency | Task | Where |
|-----------|------|--------|
| **Weekly** | `npm audit` (CI already runs on PR; run locally before release) | `npm audit --audit-level=high` |
| **Monthly** | RLS review (dump schema, review policies) | pulse-unified-base; §4 above |
| **Monthly** | Dependency updates (Dependabot + manual review) | GitHub; `npm update` / upgrade |
| **Quarterly** | Penetration test (SQLi, token, rate limit, RLS) | §8; ADVERSARIAL_ATTACK_SIMULATION.md |
| **Yearly** | Full security audit (code + infra + ops) | e.g. SECURITY_AUDIT_ADVERSARIAL.md style |

---

## References

- Security audit: `docs/SECURITY_AUDIT_ADVERSARIAL.md`
- Adversarial simulation: `docs/ADVERSARIAL_ATTACK_SIMULATION.md`
- Incident response: `docs/INCIDENT_RESPONSE.md`
- Key rotation: `docs/KEY_ROTATION.md`
- Security checklist: `docs/SECURITY_CHECKLIST.md`
- Deploy Edge Functions (CLI workflow): `docs/DEPLOY_EDGE_FUNCTIONS.md`
