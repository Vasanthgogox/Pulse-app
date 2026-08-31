/**
 * S3b — Admin Console membership management. All mutations go through `supabaseAuth` (the real
 * authenticated session added in S3a), so they're enforced by the caller's real permission
 * (platform_admin.manage) via can_manage_platform_admins(), not merely a UI hide.
 *
 * Invitation is the one exception that can't be a plain RPC: creating an auth.users account
 * requires the Auth Admin API, which requires the service-role key. That key must never be used
 * for this from the browser -- analytics/'s existing service-role client is an accepted risk for
 * ordinary read/write data access, but handing it the ability to create arbitrary auth.users
 * accounts is a materially bigger exposure if the bundle is ever extracted. invitePlatformAdmin()
 * below calls a server-side Edge Function (supabase/functions/invite-platform-admin) instead --
 * the service-role key lives there, never in this bundle, for this specific operation.
 */
import { FunctionsHttpError } from '@supabase/functions-js';
import { supabaseAuth } from '@/lib/supabaseAuth';

export type PlatformAdminStatus = 'invited' | 'active' | 'suspended';

export interface PlatformAdminRow {
  platform_user_id: string;
  user_id: string;
  email: string;
  status: PlatformAdminStatus;
  role_id: string | null;
  role_name: string | null;
  last_sign_in_at: string | null;
  created_at: string;
}

export interface PlatformRoleRow {
  id: string;
  name: string;
  description: string | null;
}

export async function fetchPlatformAdmins(): Promise<{ rows: PlatformAdminRow[]; error: string | null }> {
  const { data, error } = await supabaseAuth.rpc('list_platform_admins');
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as PlatformAdminRow[], error: null };
}

export async function fetchPlatformRoles(): Promise<PlatformRoleRow[]> {
  const { data, error } = await supabaseAuth.from('platform_roles').select('id, name, description');
  if (error || !data) return [];
  return data as PlatformRoleRow[];
}

/**
 * Invite an admin by email. Calls the invite-platform-admin Edge Function, which holds the
 * service-role key server-side, creates/reuses the auth.users account via the Auth Admin API (no
 * password is ever created or seen here), and grants the chosen role. `supabaseAuth.functions
 * .invoke` automatically forwards this browser's own session token, which the function verifies
 * and re-checks server-side before doing anything -- the browser never sees or holds the
 * service-role key for this operation.
 */
export async function invitePlatformAdmin(
  email: string,
  roleId: string,
  redirectTo: string,
): Promise<{ error: string | null }> {
  const trimmed = email.trim();
  if (!trimmed) return { error: 'Enter an email address.' };

  const { data, error } = await supabaseAuth.functions.invoke<{
    platformUserId?: string;
    error?: string;
  }>('invite-platform-admin', {
    body: { email: trimmed, roleId, redirectTo },
  });
  if (error) {
    // Any non-2xx response from the function surfaces here as a FunctionsHttpError with only a
    // generic "Edge Function returned a non-2xx status code" message -- the actual JSON body
    // (the specific reason: unauthorized, invalid email, invite already registered, role grant
    // failed, ...) is on error.context, the raw Response, and has to be read explicitly.
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (typeof body?.error === 'string' && body.error) return { error: body.error };
      } catch {
        // Response body wasn't JSON (or already consumed) -- fall through to the generic message.
      }
    }
    return { error: error.message };
  }
  if (data?.error) return { error: data.error };
  return { error: null };
}

export async function changePlatformAdminRole(
  platformUserId: string,
  newRoleId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabaseAuth.rpc('change_platform_role', {
    p_platform_user_id: platformUserId,
    p_new_role_id: newRoleId,
  });
  return { error: error?.message ?? null };
}

export async function setPlatformAdminStatus(
  platformUserId: string,
  status: 'active' | 'suspended',
): Promise<{ error: string | null }> {
  const { error } = await supabaseAuth.rpc('set_platform_user_status', {
    p_platform_user_id: platformUserId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

export async function removePlatformAdmin(platformUserId: string): Promise<{ error: string | null }> {
  const { error } = await supabaseAuth.rpc('remove_platform_admin', {
    p_platform_user_id: platformUserId,
  });
  return { error: error?.message ?? null };
}
