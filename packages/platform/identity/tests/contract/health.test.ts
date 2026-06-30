import { describe, it, expect } from 'vitest';
import { createIdentityApp } from '../../src/index';
import { loadIntegrationConfig, hasIntegrationEnv } from '../helpers/env';
import { bindIdentityApp } from '../helpers/client';
import {
  assertOperationResponse,
  healthAliveSchema,
  healthReadySchema,
  healthVersionSchema,
} from '@pulse/platform-testing';

describe('Identity health endpoints', () => {
  const config = hasIntegrationEnv
    ? loadIntegrationConfig()
    : {
        supabaseUrl:        'http://localhost:54321',
        supabaseServiceKey: 'test-service-key',
        supabaseAnonKey:    'test-anon-key',
        jwtSecret:          'test-jwt-secret-minimum-32-characters',
        serviceVersion:     '1.0.0',
      };

  const app = createIdentityApp(config);
  const client = bindIdentityApp(app);

  it('GET /health — process alive', async () => {
    const res = await client.health();
    expect(res.status).toBe(200);
    healthAliveSchema.parse(res.body);
    assertOperationResponse('GET /health', res.status, res.body);
  });

  it('GET /version — service metadata', async () => {
    const res = await client.version();
    expect(res.status).toBe(200);
    healthVersionSchema.parse(res.body);
    assertOperationResponse('GET /version', res.status, res.body);
    expect((res.body as { serviceVersion: string }).serviceVersion).toBe('1.0.0');
  });

  it('GET /ready — reports readiness shape', async () => {
    const res = await client.ready();
    expect([200, 503]).toContain(res.status);
    healthReadySchema.parse(res.body);
    assertOperationResponse('GET /ready', res.status, res.body);
  });
});
