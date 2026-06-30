import type { ApiErrorResponse, ApiSuccessResponse } from '@pulse/contracts';

export interface ApiRequestOptions {
  method?:  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?:     unknown;
  token?:    string;
  headers?:  Record<string, string>;
}

export interface ApiCallResult<T = unknown> {
  status: number;
  body:   T;
  headers: Headers;
}

export type IdentityRequestFn = (
  path: string,
  options?: ApiRequestOptions,
) => Promise<ApiCallResult>;

export function createIdentityClient(request: IdentityRequestFn) {
  return {
    health: () => request('/health'),

    ready: () => request('/ready'),

    version: () => request('/version'),

    login: (body: { email: string; password: string; membershipId?: string }) =>
      request('/auth/login', { method: 'POST', body }),

    me: (token: string) =>
      request('/auth/me', { method: 'GET', token }),

    createOrganization: (body: { name: string; legalName?: string }, token: string) =>
      request('/organizations', { method: 'POST', body, token }),

    createBusinessUnit: (
      body: { organizationId: string; name: string; code: string },
      token: string,
    ) => request('/business-units', { method: 'POST', body, token }),

    createWarehouse: (
      body: {
        organizationId: string;
        businessUnitId?: string;
        name: string;
        code: string;
        address?: Record<string, unknown>;
      },
      token: string,
    ) => request('/warehouses', { method: 'POST', body, token }),

    inviteUser: (
      body: { organizationId: string; email: string; role: string; businessUnitId?: string },
      token: string,
    ) => request('/users/invite', { method: 'POST', body, token }),
  };
}

export function assertSuccessEnvelope<T>(body: unknown): asserts body is ApiSuccessResponse<T> {
  if (!body || typeof body !== 'object' || (body as ApiSuccessResponse<T>).success !== true) {
    throw new Error(`Expected success envelope, got ${JSON.stringify(body)}`);
  }
}

export function assertErrorEnvelope(body: unknown, expectedCode?: string): asserts body is ApiErrorResponse {
  if (!body || typeof body !== 'object' || (body as ApiErrorResponse).success !== false) {
    throw new Error(`Expected error envelope, got ${JSON.stringify(body)}`);
  }
  const errBody = body as ApiErrorResponse;
  if (expectedCode && errBody.error.code !== expectedCode) {
    throw new Error(`Expected error code ${expectedCode}, got ${errBody.error.code}`);
  }
}
