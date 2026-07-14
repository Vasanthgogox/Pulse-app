# check-user-by-phone

Checks if a phone number is already registered (in `public.profiles`). Used before sign-up so existing users are redirected to sign-in with email prefilled.

- **Auth:** None required (called before sign-up / driver sign-in).
- **Rate limit:** 30 requests per IP per minute (`exists_check`); 10/min for `driver_signin`.
- **Body:** `{ "phone": "9876543210" }` or `{ "phone": "9876543210", "intent": "driver_signin" }`.
- **Response (exists check):** `{ "exists": true, "email": "user@gmail.com", "masked_email": "us***@gmail.com" }` or `{ "exists": false }`.
- **Response (driver sign-in):** `{ "email": "user@gmail.com", "session": { "access_token": "...", "refresh_token": "..." } }` (magic link exchanged server-side).

Deploy: `supabase functions deploy check-user-by-phone`

Driver sign-in uses `intent: "driver_signin"` on this function (already deployed) instead of the separate `driver-phone-signin-unverified` function.
