import { Hono } from 'hono';
import type { IdentityConfig, AuthContext } from '../config';
import { OrganizationService } from '../services/organization.service';
import { authenticate } from '../middleware/authenticate';
import { authorize, authorizeBootstrap } from '../middleware/authorize';
import { Permission, PlatformError, ErrorCodes, roleHasPermission } from '@pulse/contracts';
import { createBusinessUnitSchema } from '../validation/organization.schema';
import { parseBody, respondError, respondSuccess } from '../http/respond';

import type { IdentityEnv } from '../hono-env';

export function registerBusinessUnitRoutes(app: Hono<IdentityEnv>, config: IdentityConfig) {
  const service = new OrganizationService(config);

  app.post('/business-units', authenticate(config), async c => {
    try {
      const auth = c.get('auth') as AuthContext;
      if (auth.platformClaims) {
        if (!roleHasPermission(auth.platformClaims.role, Permission.ORG_WRITE)) {
          return respondError(c, new PlatformError(ErrorCodes.FORBIDDEN, `Missing permission: ${Permission.ORG_WRITE}`, 403));
        }
      } else {
        await authorizeBootstrap()(c, async () => {});
      }
      const body = createBusinessUnitSchema.parse(await parseBody(c));
      const result = await service.createBusinessUnit(
        body,
        auth.platformClaims ? undefined : auth.authUserId,
      );
      return respondSuccess(c, result.data, result.statusCode ?? 201);
    } catch (err) {
      return respondError(c, err);
    }
  });
}
