import { createClient } from '@supabase/supabase-js';
import type { IdentityConfig } from '../../src/config';
import { buildTestAuthUser, type TestAuthUser } from '@pulse/platform-testing';

export async function createSupabaseAuthUser(
  config: IdentityConfig,
  label = 'integration',
): Promise<TestAuthUser & { authUserId: string; accessToken: string }> {
  const creds = buildTestAuthUser(label);
  const admin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email:         creds.email,
    password:      creds.password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Failed to create auth user');

  const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
    email:    creds.email,
    password: creds.password,
  });
  if (signInErr || !session.session?.access_token) {
    throw signInErr ?? new Error('Failed to sign in test user');
  }

  return {
    ...creds,
    authUserId:   data.user.id,
    accessToken:  session.session.access_token,
  };
}

export async function deleteSupabaseAuthUser(config: IdentityConfig, authUserId: string): Promise<void> {
  const admin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.auth.admin.deleteUser(authUserId);
}
