import type { IdentityConfig } from '../config';
import { AuthRepository } from '../repositories/auth.repository';

export function createAuthRepository(config: IdentityConfig): AuthRepository {
  return new AuthRepository({
    url:            config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceKey,
    anonKey:        config.supabaseAnonKey,
  });
}
