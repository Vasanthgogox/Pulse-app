import { Hono } from 'hono';
import { Permission, PlatformError, ErrorCodes, roleHasPermission } from '@pulse/contracts';
import type { IdentityConfig, AuthContext } from '../config';
import { WarehouseService } from '../services/warehouse.service';
import { authenticate } from '../middleware/authenticate';
import { authorizeBootstrap } from '../middleware/authorize';
import { createWarehouseSchema } from '../validation/warehouse.schema';
import { parseBody, respondError, respondSuccess } from '../http/respond';

import type { IdentityEnv } from '../hono-env';

export function registerWarehouseRoutes(app: Hono<IdentityEnv>, config: IdentityConfig) {
  const service = new WarehouseService(config);

  app.post('/warehouses', authenticate(config), async c => {
    try {
      const auth = c.get('auth') as AuthContext;
      if (auth.platformClaims) {
        if (!roleHasPermission(auth.platformClaims.role, Permission.WAREHOUSES_WRITE)) {
          return respondError(c, new PlatformError(ErrorCodes.FORBIDDEN, `Missing permission: ${Permission.WAREHOUSES_WRITE}`, 403));
        }
      } else {
        await authorizeBootstrap()(c, async () => {});
      }
      const body = createWarehouseSchema.parse(await parseBody(c));
      const result = await service.createWarehouse(
        body,
        auth.platformClaims ? undefined : auth.authUserId,
      );
      return respondSuccess(c, result.data, result.statusCode ?? 201);
    } catch (err) {
      return respondError(c, err);
    }
  });
}
