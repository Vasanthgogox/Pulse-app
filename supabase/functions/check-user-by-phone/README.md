# check-user-by-phone

Checks if a phone number is already registered (in `public.profiles`). Used before sign-up so existing users are redirected to sign-in with email prefilled.

- **Auth:** None required (called before sign-up).
- **Rate limit:** 30 requests per IP per minute.
- **Body:** `{ "phone": "9876543210" }` (10 digits or +91 + 10 digits; normalized server-side).
- **Response:** `{ "exists": true, "email": "user@gmail.com", "masked_email": "us***@gmail.com" }` or `{ "exists": false }`.

Deploy: `supabase functions deploy check-user-by-phone`

**Scale:** This function currently loads profiles with non-null phone (up to 10k) and normalizes in JS. For large deployments, add in Q-unified-base an RPC that normalizes phone and returns email (with an index on normalized phone), and switch this function to call that RPC. Also add `UNIQUE(phone)` (or unique on normalized phone) in Q-unified-base so duplicate sign-ups are rejected at the DB.
