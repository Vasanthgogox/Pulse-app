# ops-agent-chat

Supabase Edge Function that proxies Ops Agent requests to the Gemini API. The API key stays server-side (never in the app bundle).

## Run locally without deploying (dev)

You can use the Ops Agent with **only** a client-side key while developing:

1. Add to `.env` (or `.env.local`):
   ```bash
   EXPO_PUBLIC_GEMINI_API_KEY=your-gemini-api-key
   ```
   Get a key from [Google AI Studio](https://aistudio.google.com/apikey).

2. Run the app:
   ```bash
   npx expo start
   ```

If the proxy is **not** deployed, the app will try the proxy once (you may see a brief error in logs), then **fall back** to the client key in **development** (`__DEV__`). So Ops Agent works without deploying this function. For production, deploy the function and do **not** put the Gemini key in the app.

## Deploy (production)

Deploy from your **local project terminal** (not the app or Dashboard). Full workflow: **`docs/DEPLOY_EDGE_FUNCTIONS.md`**.

**Quick version** (after `supabase login` and `supabase link` once):

```bash
supabase secrets set GEMINI_API_KEY=your-gemini-api-key
supabase functions deploy ops-agent-chat
```

The app derives the proxy URL from `EXPO_PUBLIC_SUPABASE_URL` + `/functions/v1/ops-agent-chat` and sends the user's session Bearer token. No `EXPO_PUBLIC_GEMINI_API_KEY` in production builds.

## Security (built-in)

- **JWT verification:** The function verifies the Bearer token with Supabase Auth (`getUser(token)`). Only authenticated users can call the proxy.
- **Rate limiting:** 20 requests per minute per user (in-memory). Returns 429 when exceeded.
- **CORS (optional):** Set `CORS_ALLOWED_ORIGIN` in Supabase secrets to restrict to your web origin (e.g. `https://yourapp.com`). If unset, `*` is used. Mobile apps typically don't send Origin; this mainly protects web callers.
- **Security logging:** The function logs structured events to the console for Supabase Logs. Search for `SECURITY_EVENT` in Edge Function logs. Events: `auth_failure`, `rate_limit`, `invalid_request`, `suspicious_prompt` (payload length > 50k chars). See `docs/OPERATIONAL_SECURITY.md` for monitoring and alerts.
