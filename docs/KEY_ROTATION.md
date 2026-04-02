# Key rotation and secret hygiene

If **any** real secret was ever committed (e.g. in `.env`, `.env.example`, or `.env.local.example`), treat it as compromised and rotate immediately.

## 1. Supabase keys

| Key | Where it lives | Rotation steps |
|-----|----------------|----------------|
| **Anon (public)** | App / `.env` | Supabase Dashboard → Project Settings → API → Regenerate anon key. Update `.env` and redeploy; existing sessions may need re-login. |
| **Service role** | Scripts / CI only | Dashboard → API → Regenerate service_role. Update CI secrets and local scripts; never use in the app. |
| **JWT secret** | Supabase infra | Rotating changes all issued tokens; do only if required by Supabase support or security incident. |

**Steps (anon key):**

1. Supabase Dashboard → **Project Settings** → **API**.
2. Under **Project API keys**, use **Regenerate** for the anon key (and/or service role if it was exposed).
3. Replace the value in `.env` / `.env.local` and in any CI or hosting env vars.
4. Restart the app / redeploy so the new key is used.
5. Ensure `.env.example` and `.env.local.example` contain **only placeholders** (e.g. `your-anon-key`, `https://your-project.supabase.co`).

## 2. Ops Agent (Gemini)

| Key | Where it should live | Rotation |
|-----|----------------------|----------|
| **GEMINI_API_KEY** | Server only (Edge Function secrets) | Create a new key in [Google AI Studio](https://aistudio.google.com/apikey), set it in Supabase: `supabase secrets set GEMINI_API_KEY=new_key`, redeploy `ops-agent-chat`. |
| **EXPO_PUBLIC_GEMINI_API_KEY** | Dev only (optional) | If it was ever committed, revoke that key in AI Studio and use a new one only in local `.env` (never commit). Prefer using the proxy in production. |

## 3. Verification

- Run **`./scripts/check-env-example-no-secrets.sh`** (or the equivalent CI step) to ensure example env files do not contain JWT-like or other secret patterns.
- Use **TruffleHog** (or similar) in CI to scan commits and PRs for leaked secrets.
- After rotation, confirm sign-in and Ops Agent (if used) work with the new keys.

## 4. Checklist after suspected leak

- [ ] Rotate the exposed key in the provider (Supabase, Google, etc.).
- [ ] Update the key in all env sources (local `.env`, CI, hosting, Supabase secrets).
- [ ] Ensure `.env.example` / `.env.local.example` use placeholders only.
- [ ] Run the no-secrets check and fix any findings.
- [ ] Redeploy app and Edge Functions if applicable.
- [ ] Document the incident and rotation in your internal runbook (optional but recommended).
