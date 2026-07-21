import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
// Admin console uses service role to bypass RLS — local/dev only; never ship publicly.
const key =
  (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string | undefined)?.trim() ??
  "";

export const supabaseConfigError =
  !url || !key
    ? "Missing Supabase admin env. Add SUPABASE_SERVICE_ROLE_KEY (and EXPO_PUBLIC_SUPABASE_URL) to the repo-root .env, then restart `npm run dev` in analytics/."
    : null;

export const supabase: SupabaseClient = createClient(
  url || "https://placeholder.supabase.co",
  key || "placeholder",
  {
    auth: { persistSession: false },
  },
);
