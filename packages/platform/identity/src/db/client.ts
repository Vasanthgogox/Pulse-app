import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type IdentitySupabase = SupabaseClient;

export interface IdentityDbConfig {
  url:            string;
  serviceRoleKey: string;
  anonKey:        string;
}

export function createServiceDb(config: IdentityDbConfig): IdentitySupabase {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAnonDb(config: IdentityDbConfig): IdentitySupabase {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function platformSchema(client: IdentitySupabase) {
  return client.schema('platform');
}

export async function nextCanonicalCode(
  client: IdentitySupabase,
  prefix: string,
  width = 6,
): Promise<string> {
  const { data, error } = await client.rpc('platform_next_canonical_code', {
    p_prefix: prefix,
    p_width:  width,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error(`Failed to issue ${prefix} code`);
  return data;
}
