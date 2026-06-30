import type { CommandResult, CreateWarehouseRequest, WarehouseDto } from '@pulse/contracts';
import type { IdentityConfig } from '../config';
import { createServiceDb } from '../db/client';
import { WarehouseRepository } from '../repositories/warehouse.repository';
import { assertOrgAdmin } from './permissions.helper';

export class WarehouseService {
  private readonly db;

  constructor(config: IdentityConfig) {
    this.db = createServiceDb({
      url:            config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceKey,
      anonKey:        config.supabaseAnonKey,
    });
  }

  async createWarehouse(
    body: CreateWarehouseRequest,
    authUserId?: string,
  ): Promise<CommandResult<WarehouseDto>> {
    if (authUserId) await assertOrgAdmin(this.db, authUserId, body.organizationId);
    const repo = new WarehouseRepository(this.db);
    const wh = await repo.createWarehouse({
      organizationCode: body.organizationId,
      businessUnitCode: body.businessUnitId,
      name:             body.name,
      whCode:           body.code,
      address:          body.address as Record<string, unknown> | undefined,
    });
    return { data: wh, statusCode: 201 };
  }
}
