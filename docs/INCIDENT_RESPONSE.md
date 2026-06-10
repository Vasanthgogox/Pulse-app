# Security incident response

Minimal playbook for reporting and handling security issues in Pulse and related services.

## Reporting a vulnerability

- **Contact:** Report security issues to the team lead or via your organization’s designated security contact (e.g. security@ or engineering lead). Do not open public issues for security vulnerabilities.
- **What to include:** Description of the issue, steps to reproduce (if possible), impact, and environment (app version, OS).

## Steps (on receipt of a report)

1. **Triage:** Confirm the report is valid and scope (Pulse app, Supabase/Edge Functions, pulse-unified-base, etc.).
2. **Contain:** If active abuse is suspected, revoke affected tokens/keys, rotate secrets per `docs/KEY_ROTATION.md`, disable affected features if necessary.
3. **Fix:** Implement a fix in a private branch; do not commit sensitive details in commit messages or PRs.
4. **Release:** Ship fix via normal release process; consider out-of-band release for critical issues.
5. **Communicate:** Notify affected users or stakeholders if required by policy or regulation.
6. **Post-mortem:** Document cause and preventive controls; update `docs/SECURITY_CHECKLIST.md` if new checks are needed.

---

## Emergency playbook (if compromised)

When you have evidence of active compromise (e.g. stolen token, abused Edge Function, credential leak), run through these steps. **Test this playbook once** in a non-emergency so the team knows the steps.

### 1. Rotate keys

- **Supabase:** Dashboard → Project Settings → API → Regenerate `anon` and/or `service_role` if the anon key was abused or service role leaked. Update app env (EAS, hosting) with new anon key; update CI and local `.env` for service role if used in scripts.
- **Gemini:** Create a new API key in Google AI Studio; set in Supabase: `supabase secrets set GEMINI_API_KEY=new_key`; redeploy `ops-agent-chat`.
- See `docs/KEY_ROTATION.md` for full key list and rotation steps.

### 2. Disable Edge Function (if proxy is being abused)

- **Option A:** Redeploy the function with a no-op or maintenance response so the endpoint returns 503 without calling Gemini.
- **Option B:** In Supabase Dashboard, pause or remove the function if the UI allows it.
- Restore normal deployment after rotating `GEMINI_API_KEY` and (if needed) tightening rate limit or CORS.

### 3. Force logout users (invalidate sessions)

- Supabase Dashboard → Authentication → Users: revoke sessions for specific users if you know which accounts are compromised.
- For a full reset: consider rotating the JWT secret (Supabase Auth settings) so **all** existing sessions are invalidated; all users must sign in again. Use only when necessary (e.g. broad token leak).

### 4. Audit logs

- **Supabase:** Logs → Edge Function logs; filter for `SECURITY_EVENT` to see auth failures, rate limits, invalid requests, suspicious prompts.
- **Auth:** Authentication → Logs (if available) for failed sign-ins and suspicious activity.
- **Database:** Use Postgres logs or Supabase database logs for unusual query patterns or bulk access.
- Preserve logs for post-mortem and (if required) legal or compliance.

### 5. After containment

- Fix root cause (patch, config, or rotation).
- Deploy fix; re-enable Edge Function if it was disabled.
- Communicate to affected users if their data or account was impacted.
- Schedule post-mortem and update `docs/SECURITY_CHECKLIST.md` or `docs/OPERATIONAL_SECURITY.md` with new detection or controls.

---

## References

- Key rotation: `docs/KEY_ROTATION.md`
- Security checklist: `docs/SECURITY_CHECKLIST.md`
- Operational security (monitoring, RLS, backups): `docs/OPERATIONAL_SECURITY.md`
- Pre-release security script: `scripts/pre-release-security-check.sh`
