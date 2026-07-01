import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
// Admin console uses service role key to bypass RLS — never expose this in a public app
const key = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY must be set');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
