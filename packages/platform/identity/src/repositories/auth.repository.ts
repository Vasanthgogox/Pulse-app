import type { IdentitySupabase } from '../db/client';
import { createAnonDb, type IdentityDbConfig } from '../db/client';

export class AuthRepository {
  private readonly anonDb: IdentitySupabase;

  constructor(config: IdentityDbConfig) {
    this.anonDb = createAnonDb(config);
  }

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await this.anonDb.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  }

  async getUserFromAccessToken(accessToken: string) {
    const { data, error } = await this.anonDb.auth.getUser(accessToken);
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  }
}
