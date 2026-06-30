import type { PlatformRequestContext } from '@pulse/platform-observability';
import type { AuthContext } from './config';

export type IdentityEnv = {
  Variables: {
    auth:   AuthContext;
    reqCtx: PlatformRequestContext;
  };
};
