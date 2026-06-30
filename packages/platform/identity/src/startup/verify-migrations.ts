import { createStructuredLogger } from '@pulse/platform-observability';
import type { IdentityConfig } from '../config';
import { createServiceDb } from '../db/client';
import { MigrationRepository } from '../repositories/migration.repository';

const logger = createStructuredLogger('identity');

export async function verifyMigrationsOnStartup(config: IdentityConfig): Promise<void> {
  const db = createServiceDb({
    url:            config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceKey,
    anonKey:        config.supabaseAnonKey,
  });

  const repo = new MigrationRepository(db);
  const result = await repo.verifyIdentitySchema();

  if (!result.ok) {
    logger.error({
      event:             'startup.migration_verification_failed',
      missingMigrations: result.missingMigrations,
      schemaReachable:   result.schemaReachable,
      error:             result.error,
    });
    throw new Error(result.error ?? 'Identity database schema is incompatible');
  }

  logger.info({
    event:             'startup.migration_verification_passed',
    appliedMigrations: result.appliedMigrations.length,
    schemaReachable:   result.schemaReachable,
  });
}
