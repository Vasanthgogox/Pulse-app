# Database migrations

Run these in **Supabase → SQL Editor** (or your migration runner) if you see related errors.

| Error | Fix |
|-------|-----|
| `trips_status_check` when tapping "Reached at drop" | Run `003_trips_status_allow_at_drop.sql` |
| `relation "public.trip_documents" does not exist` or RLS when uploading POD | Run `002_driver_trip_documents_policy.sql` (it creates the table if missing) |

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Copy the contents of the `.sql` file and run it.
