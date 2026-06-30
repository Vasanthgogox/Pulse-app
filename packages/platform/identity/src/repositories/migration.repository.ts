import type { IdentitySupabase } from '../db/client';
import { platformSchema } from '../db/client';
import { IDENTITY_REQUIRED_MIGRATIONS } from '../migrations/constants';

export interface MigrationVerificationResult {
  ok:                boolean;
  appliedMigrations: string[];
  missingMigrations: string[];
  schemaReachable:   boolean;
  error?:            string;
}

export class MigrationRepository {
  constructor(private readonly db: IdentitySupabase) {}

  async verifyIdentitySchema(): Promise<MigrationVerificationResult> {
    let appliedMigrations: string[] = [];
    let migrationReadError: string | undefined;

    try {
      appliedMigrations = await this.listAppliedMigrations();
    } catch (err) {
      migrationReadError = err instanceof Error ? err.message : String(err);
    }

    const missingMigrations = IDENTITY_REQUIRED_MIGRATIONS.filter(
      v => !appliedMigrations.includes(v),
    );
    const schemaReachable = migrationReadError ? false : await this.pingPlatformSchema();

    const ok = !migrationReadError && missingMigrations.length === 0 && schemaReachable;
    return {
      ok,
      appliedMigrations,
      missingMigrations: [...missingMigrations],
      schemaReachable,
      error: ok
        ? undefined
        : migrationReadError
          ?? (missingMigrations.length > 0
            ? `Missing migrations: ${missingMigrations.join(', ')}`
            : 'Platform schema unreachable'),
    };
  }

  private async listAppliedMigrations(): Promise<string[]> {
    const { data, error } = await this.db
      .schema('supabase_migrations')
      .from('schema_migrations')
      .select('version');

    if (error) {
      throw new Error(`Failed to read schema_migrations: ${error.message}`);
    }

    return (data ?? []).map(row => String((row as { version: string }).version));
  }

  private async pingPlatformSchema(): Promise<boolean> {
    const { error } = await platformSchema(this.db)
      .from('roles')
      .select('id')
      .limit(1);

    return !error;
  }
}
