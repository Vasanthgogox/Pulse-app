import { serve } from '@hono/node-server';
import { createIdentityApp, loadIdentityConfig } from './index';
import { verifyMigrationsOnStartup } from './startup/verify-migrations';

const port = Number(process.env.PORT ?? process.env.IDENTITY_PORT ?? 3101);

async function main() {
  const config = loadIdentityConfig();
  await verifyMigrationsOnStartup(config);

  const app = createIdentityApp(config);
  serve({ fetch: app.fetch, port }, () => {
    console.log(JSON.stringify({
      level:     'info',
      event:     'startup.server_listening',
      service:   'identity',
      timestamp: new Date().toISOString(),
      port,
    }));
  });
}

main().catch(err => {
  console.error(JSON.stringify({
    level:     'error',
    event:     'startup.failed',
    service:   'identity',
    timestamp: new Date().toISOString(),
    message:   err instanceof Error ? err.message : String(err),
  }));
  process.exit(1);
});
