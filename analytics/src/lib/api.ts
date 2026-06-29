import type { Organization, OrgUser, AppStatus, FeatureFlag } from '@/types/admin';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE  = import.meta.env.VITE_API_URL  ?? '';
const API_TOKEN = import.meta.env.VITE_ADMIN_TOKEN ?? '';

// ─── Sentinel error — thrown when VITE_API_URL is not configured ──────────────

export class ApiNotConfiguredError extends Error {
  constructor() {
    super('VITE_API_URL is not set — running in mock mode');
    this.name = 'ApiNotConfiguredError';
  }
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE) throw new ApiNotConfiguredError();

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status} — ${res.statusText}`);
  }

  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── API surface ──────────────────────────────────────────────────────────────

export const adminApi = {
  /**
   * GET /admin/organizations
   * Fetch the full organization list, optionally filtered.
   */
  getOrganizations(filters?: { status?: string; search?: string }): Promise<Organization[]> {
    const qs = filters
      ? '?' + new URLSearchParams(filters as Record<string, string>).toString()
      : '';
    return request<Organization[]>(`/admin/organizations${qs}`);
  },

  /**
   * PATCH /admin/organizations/:id/status
   * Approve, reject, or escalate a KYC application.
   */
  updateOrgStatus(
    orgId:    string,
    status:   AppStatus,
    payload?: { reason?: string; notes?: string },
  ): Promise<Organization> {
    return request<Organization>(`/admin/organizations/${orgId}/status`, {
      method: 'PATCH',
      body:   JSON.stringify({ status, ...payload }),
    });
  },

  /**
   * PATCH /admin/organizations/:orgId/users/:userId
   * Suspend, restore, or update an individual user.
   */
  updateUserStatus(
    orgId:   string,
    userId:  string,
    updates: Partial<OrgUser>,
  ): Promise<OrgUser> {
    return request<OrgUser>(`/admin/organizations/${orgId}/users/${userId}`, {
      method: 'PATCH',
      body:   JSON.stringify(updates),
    });
  },

  /**
   * POST /admin/organizations/:orgId/flags/:flagId/toggle
   * Flip a feature flag for an organisation.
   */
  toggleFeatureFlag(orgId: string, flagId: string): Promise<FeatureFlag> {
    return request<FeatureFlag>(`/admin/organizations/${orgId}/flags/${flagId}/toggle`, {
      method: 'POST',
    });
  },

  /**
   * POST /admin/organizations/:orgId/users/:userId/reset-2fa
   * Revoke and re-issue a TOTP secret for the given user.
   */
  resetUser2FA(orgId: string, userId: string): Promise<void> {
    return request<void>(`/admin/organizations/${orgId}/users/${userId}/reset-2fa`, {
      method: 'POST',
    });
  },
};
