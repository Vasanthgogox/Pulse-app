import { Hono } from 'hono';
import { enrichRequestContextFromClaims } from '@pulse/platform-observability';
import type { IdentityConfig, AuthContext } from '../config';
import type { IdentityEnv } from '../hono-env';
import { AuthService } from '../services/auth.service';
import { authenticate } from '../middleware/authenticate';
import { loginSchema } from '../validation/organization.schema';
import { parseBody, respondError, respondSuccess } from '../http/respond';
import { PlatformError, ErrorCodes } from '@pulse/contracts';

export function registerAuthRoutes(app: Hono<IdentityEnv>, config: IdentityConfig) {
  const service = new AuthService(config);

  app.post('/auth/login', async c => {
    try {
      const body = loginSchema.parse(await parseBody(c));
      const result = await service.login(body);
      enrichRequestContextFromClaims(c.get('reqCtx'), {
        tenantId:       result.data.user.tenantId,
        organizationId: result.data.user.organizationId,
        membershipId:   result.data.user.membershipId,
      });
      return respondSuccess(c, result.data);
    } catch (err) {
      return respondError(c, err);
    }
  });

  app.get('/auth/me', authenticate(config), async c => {
    try {
      const auth = c.get('auth') as AuthContext;
      if (!auth.platformClaims) {
        return respondError(c, new PlatformError(ErrorCodes.UNAUTHORIZED, 'Platform JWT required', 401));
      }
      const result = await service.me(auth.platformClaims);
      return respondSuccess(c, result.data);
    } catch (err) {
      return respondError(c, err);
    }
  });
}
