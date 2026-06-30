import type { Hono } from 'hono';
import type { IdentityEnv } from '../../src/hono-env';
import {
  createIdentityClient,
  type ApiRequestOptions,
  type ApiCallResult,
} from '@pulse/platform-testing';

export function bindIdentityApp(app: Hono<IdentityEnv>) {
  const request = async (path: string, options: ApiRequestOptions = {}): Promise<ApiCallResult> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    const res = await app.request(path, {
      method:  options.method ?? 'GET',
      headers,
      body:    options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return { status: res.status, body, headers: res.headers };
  };

  return createIdentityClient(request);
}
