/** Pulse Identity DB client — Commerce must NOT use this for Execution writes. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Identity service integration (future). Not used for Execution DB access. */
export function isIdentityDbConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}

export function getIdentityDb(): SupabaseClient | null {
  if (!isIdentityDbConfigured()) return null;
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, storage: localStorage } },
    );
  }
  return client;
}
