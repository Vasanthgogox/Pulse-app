import { Hono } from 'hono';
import { Permission, PlatformError, ErrorCodes, roleHasPermission } from '@pulse/contracts';
import type { IdentityConfig, AuthContext } from '../config';
import { InvitationService } from '../services/invitation.service';
import { authenticate } from '../middleware/authenticate';
import { authorizeBootstrap } from '../middleware/authorize';
import { inviteUserSchema } from '../validation/invitation.schema';
import { parseBody, respondError, respondSuccess } from '../http/respond';

import type { IdentityEnv } from '../hono-env';

export function registerInvitationRoutes(app: Hono<IdentityEnv>, config: IdentityConfig) {
  const service = new InvitationService(config);

  app.post('/users/invite', authenticate(config), async c => {
    try {
      const auth = c.get('auth') as AuthContext;
      if (auth.platformClaims) {
        if (!roleHasPermission(auth.platformClaims.role, Permission.USERS_INVITE)) {
          return respondError(c, new PlatformError(ErrorCodes.FORBIDDEN, `Missing permission: ${Permission.USERS_INVITE}`, 403));
        }
      } else {
        await authorizeBootstrap()(c, async () => {});
      }
      const body = inviteUserSchema.parse(await parseBody(c));
      const result = await service.inviteUser(
        body,
        auth.authUserId!,
        Boolean(auth.platformClaims),
      );
      return respondSuccess(c, result.data, result.statusCode ?? 201);
    } catch (err) {
      return respondError(c, err);
    }
  });
}
