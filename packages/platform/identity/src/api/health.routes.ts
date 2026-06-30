import type { Hono } from 'hono';
import type { IdentityConfig } from '../config';
import type { IdentityEnv } from '../hono-env';
import { HealthService } from '../services/health.service';

export function registerHealthRoutes(
  app: Hono<IdentityEnv>,
  config: IdentityConfig & { serviceVersion: string; gitCommit?: string },
) {
  const service = new HealthService(config);

  app.get('/health', c => c.json(service.alive()));

  app.get('/ready', async c => {
    const ready = await service.ready();
    return c.json(ready, ready.status === 'ready' ? 200 : 503);
  });

  app.get('/version', c => c.json(service.version()));
}
