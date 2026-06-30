import type { IdentityConfig } from '../config';
import { IDENTITY_DB_SCHEMA_VERSION } from '../migrations/constants';
import { createServiceDb } from '../db/client';
import { MigrationRepository, type MigrationVerificationResult } from '../repositories/migration.repository';

export interface HealthAliveResponse {
  status:  'ok';
  service: 'identity';
}

export interface HealthReadyResponse {
  status:            'ready' | 'not_ready';
  service:           'identity';
  schemaReachable:   boolean;
  missingMigrations: string[];
}

export interface HealthVersionResponse {
  service:          'identity';
  serviceVersion:   string;
  schemaVersion:    string;
  apiSchemaVersion: string;
  gitCommit?:       string;
}

export class HealthService {
  private readonly migrationRepo: MigrationRepository;

  constructor(private readonly config: IdentityConfig & { serviceVersion: string; gitCommit?: string }) {
    const db = createServiceDb({
      url:            config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceKey,
      anonKey:        config.supabaseAnonKey,
    });
    this.migrationRepo = new MigrationRepository(db);
  }

  alive(): HealthAliveResponse {
    return { status: 'ok', service: 'identity' };
  }

  async ready(): Promise<HealthReadyResponse> {
    const verification = await this.migrationRepo.verifyIdentitySchema();
    return {
      status:            verification.ok ? 'ready' : 'not_ready',
      service:           'identity',
      schemaReachable:   verification.schemaReachable,
      missingMigrations: verification.missingMigrations,
    };
  }

  version(): HealthVersionResponse {
    return {
      service:          'identity',
      serviceVersion:   this.config.serviceVersion,
      schemaVersion:    IDENTITY_DB_SCHEMA_VERSION,
      apiSchemaVersion: 'v1',
      gitCommit:        this.config.gitCommit,
    };
  }

  async verifyStartup(): Promise<MigrationVerificationResult> {
    return this.migrationRepo.verifyIdentitySchema();
  }
}
