# Local Supabase for pulse

This project has a local Supabase setup. Use it for development without touching the shared pulse-unified-base project.

## Prerequisites

- **Docker** (Desktop, [OrbStack](https://orbstack.dev/), [colima](https://github.com/abiosoft/colima), or similar)
- **Node.js 20+** (for Supabase CLI via npx)

## 1. Start local Supabase

From the repo root:

```bash
npx supabase start
```

First run downloads images and can take a few minutes. When it finishes, you’ll see something like:

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
```

## 2. Configure the app

Copy the **API URL** and **anon key** into `.env.local`:

```bash
# .env.local (create from .env.example if needed)
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<paste anon key from supabase start output>
```

To see the keys again later:

```bash
npx supabase status
```

### Physical device or Android emulator

On a **physical iPhone/Android** or the **Android emulator**, `127.0.0.1` is the device itself, not your Mac, so the app cannot reach local Supabase. Use your **Mac’s local IP** instead:

1. **Get your Mac’s IP** (Wi‑Fi or Ethernet):
   ```bash
   ipconfig getifaddr en0
   ```
   (Use `en1` or another interface if needed; typical result is like `192.168.1.42`.)

2. **Point the app at that IP** in `.env` (or `.env.local`):
   ```bash
   EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.42:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<same anon key from npx supabase status>
   ```
   Replace `192.168.1.42` with the output of the command above.

3. **Restart the app** so it picks up the new URL:
   ```bash
   npx expo start
   ```

**Note:** There is **no backend server on port 3000** in this repo. The app talks to **Supabase** (local Supabase uses port **54321**). If you have a separate API server on port 3000 (e.g. in another project), use that project’s docs to start it, then call it from the app using your Mac’s IP: `http://<MAC_IP>:3000`.

## 3. Run the app

```bash
npm start
# or: npx expo start
```

The app will use the local Supabase at `http://127.0.0.1:54321`.

## Seed test data

After sign-up (so an organization exists), you can populate test clients, suppliers, drivers, and trucks:

1. Add the **service_role** key to `.env.local` (from `npx supabase status`):
   ```
   SUPABASE_SERVICE_ROLE_KEY=<paste service_role key>
   ```
2. Run:
   ```bash
   npm run seed
   ```
   This creates 3 clients, 3 suppliers, 3 drivers, and 3 trucks for the first organization. The script fetches the organization from the DB (no hardcoded IDs).

## Useful commands

| Command | Description |
|--------|-------------|
| `npx supabase start` | Start local Supabase |
| `npx supabase stop` | Stop (keeps DB data) |
| `npx supabase status` | Show URLs and keys |
| `npx supabase db reset` | Reset DB and re-run migrations |
| `npm run seed` | Seed test data (clients, suppliers, drivers, trucks) |

## Schema and migrations

- **Initial schema** lives in this repo: `supabase/migrations/20250227120000_initial_schema.sql`. It creates organizations (with operating_model: ASSET_BASED / NON_ASSET / HYBRID), organization_members, organization_links (org-to-org as client/supplier), clients and suppliers (optional linked_organization_id), drivers, vehicles, indents, trips, transactions, with RLS so org members see only their data and drivers can read their own row.
- **Sign-up creates all required entries**: the initial schema includes RLS so new users can create their default org. On sign-up the app creates: (1) one **organization** (name: “{Full name}'s organization”, owner = user), (2) one **organization_members** row (owner), (3) if driver one **drivers** row. User sign-up includes business model choice (Asset / Aggregate / Both). Connect two orgs via **organization_links** (link_type: client or supplier).
- After `npx supabase db reset`, migrations run in order; then `supabase/seed.sql` runs if present (e.g. demo org). For parity with **pulse-unified-base**, ensure the same INSERT policies exist there so sign-up works; or run this repo’s migrations against that DB.
- **Studio**: open http://127.0.0.1:54323 to inspect and edit data.

## Preprod seed: "permission denied" fix

If `npm run seed` fails with **permission denied for table organizations** and `.env` has the correct **service_role** key, the preprod database may be missing table grants. In **Supabase Dashboard** → your preprod project → **SQL Editor**, run:

```sql
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
```

Then run `npm run seed` again. (If the role name differs, check **Database** → **Roles** and use that name.)

## Pushing schema to preprod

To apply this repo’s migrations to a **hosted preprod** Supabase project:

1. **Get the preprod project ref**  
   In [Supabase Dashboard](https://supabase.com/dashboard): open the preprod project → **Settings** → **General** → copy **Reference ID** (e.g. `abcdefghijklmnop`).

2. **Log in (if needed)**  
   ```bash
   npx supabase login
   ```

3. **Link this repo to the preprod project**  
   ```bash
   npx supabase link --project-ref <PREPROD_REF>
   ```  
   When prompted, enter the **database password** for that project (Settings → Database → Database password).

4. **Push migrations**  
   ```bash
   npx supabase db push
   ```  
   This runs all files in `supabase/migrations/` (e.g. `20250227120000_initial_schema.sql`) against the preprod database.

5. **Optional: confirm in Dashboard**  
   In the preprod project: **Database** → **Migrations** to see applied migrations.

To switch back to local only, run `npx supabase link` again and choose local, or unlink with `npx supabase unlink` (if you use multiple remotes, refer to [Supabase CLI docs](https://supabase.com/docs/guides/cli)).

## Troubleshooting: "No organization loaded"

If Add Client (or other org-scoped screens) shows "No organization loaded" even though `organization_members` and `organizations` have rows for your user:

1. **"Permission denied for table organization_members"**  
   The `authenticated` role must have table-level grants so RLS can run. The initial migration `20250227120000_initial_schema.sql` includes these grants; if you applied it before they were added, reset the DB and re-run migrations, or run in Supabase SQL Editor:
   ```sql
   GRANT SELECT, INSERT ON public.organization_members TO authenticated;
   GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
   ```

2. **Check __DEV__ logs**  
   In the app, open the dev console. You should see logs like:
   - `[getOrganizationsForUser] user.id (auth.uid): <uuid>`
   - `[getOrganizationsForUser] memberships: <count or error>`
   - `[getOrganizationsForUser] organizations: <count or error>`  
   Confirm `user.id` matches the `user_id` in `organization_members` for your user (e.g. Deepak’s `704a3032-cc86-4390-8f83-fe907785341b`). If memberships is `0` or an error, the next step is RLS or session.

2. **RLS on `organization_members`**  
   The signed-in user must be able to read their own rows. In Supabase SQL Editor (as a user with permission), ensure a policy like:
   ```sql
   CREATE POLICY "Users can read own memberships"
     ON public.organization_members FOR SELECT
     USING (user_id = auth.uid());
   ```
   If RLS is enabled and no policy allows `SELECT` for `user_id = auth.uid()`, the membership query returns no rows.

3. **RLS on `organizations`**  
   The app reads orgs by ids from memberships. A typical policy uses a helper, e.g. `is_org_member(id)`, so users can read orgs they belong to. If the schema uses that, ensure `is_org_member` exists and is granted to `authenticated`.

4. **Optional RPC**  
   If the schema includes `get_organizations_for_user()` (e.g. from pulse-unified-base), the app will call it when the membership-based query returns no orgs (e.g. to backfill owner memberships). If your DB does not have this RPC, the app still works as long as membership + org RLS are correct.

## Stopping

```bash
npx supabase stop
```

Use `npx supabase stop --no-backup` only if you want to remove local data.
