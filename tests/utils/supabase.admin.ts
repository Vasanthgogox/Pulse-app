import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Admin Supabase client — uses the service role key which bypasses RLS.
 * ONLY used in test helpers. Never import this in application code.
 *
 * The client is created lazily so unit tests that don't need Supabase
 * don't require the env var to be set.
 */

let _adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _adminClient;
}

// ─── Auth user helpers ────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
}

/**
 * Fetches the Supabase auth user by email.
 * Returns null when the user doesn't exist (not an error).
 */
export async function getUserByEmail(email: string): Promise<AdminUser | null> {
  const admin = getAdminClient();
  // Admin list endpoint — filter client-side (no server-side email filter in listUsers)
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`getUserByEmail failed: ${error.message}`);
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) return null;
  return { id: found.id, email: found.email ?? '', created_at: found.created_at };
}

/**
 * Deletes a Supabase auth user by email.
 * Cascades via DB triggers/FK to profiles, organizations, organization_members.
 * No-ops silently when the user doesn't exist.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  const user = await getUserByEmail(email);
  if (!user) return; // already gone

  const admin = getAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`deleteUserByEmail(${email}) failed: ${error.message}`);
}

// ─── Profile helpers ──────────────────────────────────────────────────────────

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  company_name: string | null;
  phone: string | null;
}

/**
 * Fetches the profiles row for a given email.
 * Returns null when not found yet (caller should poll with retryUntil).
 */
export async function getProfileByEmail(email: string): Promise<ProfileRow | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, full_name, role, company_name, phone')
    .eq('email', email)
    .maybeSingle();
  if (error) throw new Error(`getProfileByEmail(${email}) failed: ${error.message}`);
  return data as ProfileRow | null;
}

// ─── Organization helpers ─────────────────────────────────────────────────────

export interface OrganizationRow {
  id: string;
  name: string;
  operating_model: string;
  address_line: string | null;
  city: string | null;
  state: string | null;
  zone: string | null;
}

/**
 * Fetches the organization created for a given owner user ID.
 * Returns null when not provisioned yet.
 */
export async function getOrgByOwnerId(userId: string): Promise<OrganizationRow | null> {
  const admin = getAdminClient();
  // Join through organization_members to find the org owned by this user.
  const { data, error } = await admin
    .from('organization_members')
    .select('organization_id, organizations(id, name, operating_model, address_line, city, state, zone)')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .maybeSingle();
  if (error) throw new Error(`getOrgByOwnerId(${userId}) failed: ${error.message}`);
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).organizations as OrganizationRow | null;
}

// ─── Membership helpers ───────────────────────────────────────────────────────

export interface MembershipRow {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
}

/**
 * Fetches the organization_members row for a given user ID.
 * Returns null when not provisioned yet.
 */
export async function getMembershipByUserId(userId: string): Promise<MembershipRow | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('organization_members')
    .select('id, user_id, organization_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`getMembershipByUserId(${userId}) failed: ${error.message}`);
  return data as MembershipRow | null;
}
