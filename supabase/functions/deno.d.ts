/**
 * Type declarations for Supabase Edge Functions (Deno runtime).
 * Deno resolves npm: specifiers at deploy time; this file satisfies the IDE/TypeScript checker.
 */
declare module 'npm:@supabase/supabase-js@2' {
  export { createClient } from '@supabase/supabase-js';
  export type { SupabaseClient } from '@supabase/supabase-js';
}

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Promise<Response>) => void;
};
