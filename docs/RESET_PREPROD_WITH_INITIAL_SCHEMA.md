# Reset preprod with initial schema migration

Use this to make the **preprod** Supabase database match **only** the migration in `supabase/migrations/20250227120000_initial_schema.sql`.

## Prerequisites

- Supabase CLI installed and logged in: `npx supabase login`
- This repo linked to your **preprod** project: `npx supabase link --project-ref <your-preprod-project-ref>`

## Step 1: Reset the database (required)

The migration uses `CREATE TABLE` (no `IF NOT EXISTS`), so the remote database must be **empty** first.

1. Open your **preprod** project in [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Project Settings** → **General**.
3. Scroll to **Reset database** and click **Reset database**.
4. Confirm (this **destroys all data and schema**).

## Step 2: Repair migration history and push

From the repo root run:

```powershell
cd c:\Driverapp\pulse
.\supabase\scripts\reset-preprod.ps1
```

The script will:

1. Mark all existing remote migration versions as **reverted** (so the CLI treats only `20250227120000` as pending).
2. Run **db push --linked** to apply `supabase/migrations/20250227120000_initial_schema.sql`.

After this, preprod will have only the schema from that migration.

### Manual commands (optional)

If you prefer not to use the script:

```powershell
cd c:\Driverapp\pulse

# 1. Mark remote migration history as reverted (use the full version list from the script)
npx supabase migration repair --status reverted 001 002 003 ... 087 20260216151000 ... 20260225130000

# 2. Apply the initial schema
npx supabase db push --linked --yes
```

## If you haven’t linked preprod yet

```powershell
npx supabase link --project-ref <PREPROD_PROJECT_REF>
```

Get the project ref from Dashboard → Project Settings → General → Reference ID.
