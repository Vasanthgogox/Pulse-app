# Deploy Supabase Edge Functions from your terminal

You deploy Edge Functions from your **local project terminal**, not from inside the app or the Supabase Dashboard. This doc is the exact workflow.

---

## 1. Open your project folder in Terminal

Navigate to the repo root (where `supabase/` lives):

```bash
cd /path/to/pulse
```

You should see:

```
supabase/
  functions/
    ops-agent-chat/
      index.ts
```

---

## 2. Make sure Supabase CLI is installed

Check:

```bash
supabase --version
```

If not installed:

```bash
npm install -g supabase
```

or (macOS):

```bash
brew install supabase/tap/supabase
```

---

## 3. Log in to Supabase

Run:

```bash
supabase login
```

A browser window opens to authenticate the CLI.

---

## 4. Link your project (first time only)

If this machine has never linked to your Supabase project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

**Where to get the project ref:** Supabase Dashboard → Project Settings → General → **Reference ID**.  
Or from your project URL: `https://YOUR_PROJECT_REF.supabase.co` → the ref is `YOUR_PROJECT_REF`.

Example:

```bash
supabase link --project-ref abcd1234efgh
```

---

## 5. Deploy the Edge Function

From the **project root**:

```bash
supabase functions deploy ops-agent-chat
```

Example output:

```
Deploying function: ops-agent-chat
Deployed functions on project abcd1234
```

Takes about **5–10 seconds**.

---

## 6. Verify deployment

**Option A — curl (expect 401 without a valid Bearer token):**

```bash
curl -s -o /dev/null -w "%{http_code}" https://YOUR_PROJECT_REF.supabase.co/functions/v1/ops-agent-chat
```

You should see `401` (Missing or invalid Authorization). That confirms the function is live and enforcing auth.

**Option B — Dashboard:**

Supabase Dashboard → **Edge Functions** → `ops-agent-chat` (status and logs).

---

## How to test after deployment

Replace `YOUR_PROJECT_REF` with your project ref (e.g. from `https://YOUR_PROJECT_REF.supabase.co`).

### Test 1: No auth → 401

```bash
curl -s -w "\nHTTP %{http_code}\n" https://YOUR_PROJECT_REF.supabase.co/functions/v1/ops-agent-chat
```

Expected: JSON error body and **HTTP 401**.

### Test 2: Wrong method or invalid body → 405 / 400

```bash
# No body → 400 when POST with invalid JSON
curl -s -w "\nHTTP %{http_code}\n" -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/ops-agent-chat \
  -H "Authorization: Bearer fake" \
  -H "Content-Type: application/json"
```

Expected: **HTTP 401** (invalid token). To see 400, send a valid JWT but body without `contents` (see Test 3 for getting a token).

### Test 3: With a valid token (real request to Gemini)

**Option A — Test in the app (easiest)**

1. Open the app and sign in.
2. Go to the **Ops Agent** (or AI/chat) screen.
3. Send a message (e.g. “Hello”).
4. You should get a reply. That proves: app → Edge Function → Gemini works.

**Option B — Test with curl using a token**

1. Get an access token: sign in via the app, or use Supabase Auth API:

   ```bash
   curl -s -X POST "https://YOUR_PROJECT_REF.supabase.co/auth/v1/token?grant_type=password" \
     -H "apikey: YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"email":"your@email.com","password":"yourpassword"}' | jq -r '.access_token'
   ```

2. Call the function with that token:

   ```bash
   export TOKEN="paste_access_token_here"
   curl -s -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/ops-agent-chat" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"contents":[{"role":"user","parts":[{"text":"Say hello in one word"}]}]}'
   ```

   Expected: JSON with `text` (Gemini’s reply) and **HTTP 200**.

### Test 4: Rate limit (optional)

Send 21+ requests in under a minute with the same valid token. After 20, you should get **HTTP 429** and `"Too many requests. Limit 20 per minute."`.

---

## 7. Set environment secrets (required for Ops Agent)

Secrets are **only available to the Edge Function**, not to the app or browser.

**Gemini API key (required for ops-agent-chat):**

```bash
supabase secrets set GEMINI_API_KEY=your_actual_gemini_key
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey).

**Optional — restrict CORS to your web app origin:**

```bash
supabase secrets set CORS_ALLOWED_ORIGIN=https://yourapp.com
```

After changing secrets, **redeploy** so the function picks them up:

```bash
supabase functions deploy ops-agent-chat
```

---

## 8. Deploy again after code changes

Any time you edit `supabase/functions/ops-agent-chat/index.ts` (or other function code):

```bash
supabase functions deploy ops-agent-chat
```

No need to set secrets again unless you changed them.

---

## 9. Local testing (optional)

Run the function **locally** before deploying:

```bash
supabase functions serve ops-agent-chat
```

Then call:

```
http://localhost:54321/functions/v1/ops-agent-chat
```

Use an env file for local secrets (see [Supabase docs](https://supabase.com/docs/guides/functions/secrets#local-secrets)), e.g. `supabase/functions/.env` with `GEMINI_API_KEY=...`. Do not commit that file.

---

## Architecture after deployment

```
Mobile App (Expo)
       │
       │  POST + Authorization: Bearer <session_jwt>
       ▼
Supabase Edge Function (ops-agent-chat)
       │  JWT verified, rate limited, then:
       ▼
Gemini API
```

The function runs in **Supabase cloud**, not on the device.

---

## Short answer (daily use)

From project root, after you’ve already run `supabase login` and `supabase link` once:

```bash
supabase functions deploy ops-agent-chat
```

---

## See also

- Function details and security: `supabase/functions/ops-agent-chat/README.md`
- Operational security and monitoring: `docs/OPERATIONAL_SECURITY.md`
- Key rotation: `docs/KEY_ROTATION.md`
