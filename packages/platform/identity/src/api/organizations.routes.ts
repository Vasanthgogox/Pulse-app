import { Hono } from 'hono';
import { Permission } from '@pulse/contracts';
import type { IdentityConfig, AuthContext } from '../config';
import { OrganizationService } from '../services/organization.service';
import { authenticate } from '../middleware/authenticate';
import { authorize, authorizeBootstrap } from '../middleware/authorize';
import { createOrganizationSchema } from '../validation/organization.schema';
import { parseBody, respondError, respondSuccess } from '../http/respond';

import type { IdentityEnv } from '../hono-env';

export function registerOrganizationRoutes(app: Hono<IdentityEnv>, config: IdentityConfig) {
  const service = new OrganizationService(config);

  app.post('/organizations', authenticate(config), authorizeBootstrap(), async c => {
    try {
      const body = createOrganizationSchema.parse(await parseBody(c));
      const auth = c.get('auth') as AuthContext;
      const result = await service.createOrganization(
        body,
        auth.authUserId!,
        auth.email ?? 'unknown@pulse.local',
      );
      return respondSuccess(c, result.data, result.statusCode ?? 201);
    } catch (err) {
      return respondError(c, err);
    }
  });
}
