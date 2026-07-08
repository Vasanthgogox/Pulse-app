/** Pulse Identity DB client — Commerce must NOT use this for Execution writes. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function readEnv(key: 'url' | 'anon'): string {
  if (key === 'url') {
    return (
      import.meta.env.VITE_SUPABASE_URL?.trim() ||
      import.meta.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
      ''
    );
  }
  return (
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ''
  );
}

/** Identity service integration. Uses the same Supabase project as Pulse Core. */
export function isIdentityDbConfigured(): boolean {
  return Boolean(readEnv('url') && readEnv('anon'));
}

/**
 * Web auth storage aligned with Expo web (`AsyncStorage` → `localStorage`).
 * Both apps must read the same `sb-*-auth-token` keys on one origin.
 */
const sharedWebAuthStorage = {
  getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key: string, value: string) => {
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

export function getIdentityDb(): SupabaseClient | null {
  if (!isIdentityDbConfigured()) return null;
  if (!client) {
    client = createClient(readEnv('url'), readEnv('anon'), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: sharedWebAuthStorage,
      },
    });
  }
  return client;
}
