import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export const supabaseAuthConfigError =
  !url || !anonKey
    ? "Missing Supabase anon-key env. Add EXPO_PUBLIC_SUPABASE_ANON_KEY (and EXPO_PUBLIC_SUPABASE_URL) to the repo-root .env, then restart `npm run dev` in analytics/."
    : null;

/**
 * Admin Console login/session client — anon key, persisted session. Separate from `supabase`
 * (lib/supabase.ts, service role, no session): that client stays the data path for every panel,
 * unchanged. This client is used only to authenticate a real admin and resolve their
 * `platform_users` identity (see AdminAuthProvider).
 */
export const supabaseAuth: SupabaseClient = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder",
  {
    auth: { persistSession: true },
  },
);
