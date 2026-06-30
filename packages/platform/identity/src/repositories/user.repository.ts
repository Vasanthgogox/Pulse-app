import type { IdentitySupabase } from '../db/client';
import { nextCanonicalCode, platformSchema } from '../db/client';

export interface UserRow {
  id:            string;
  code:          string;
  auth_user_id:  string | null;
  email:         string;
  display_name:  string | null;
}

export class UserRepository {
  constructor(private readonly db: IdentitySupabase) {}

  async ensureUser(params: {
    authUserId:  string;
    email:       string;
    displayName?: string;
  }): Promise<{ internalId: string; code: string; email: string; displayName?: string }> {
    const schema = platformSchema(this.db);

    const { data: existing } = await schema
      .from('users')
      .select('id, code, email, display_name')
      .eq('auth_user_id', params.authUserId)
      .is('deleted_at', null)
      .maybeSingle<UserRow>();

    if (existing) {
      return {
        internalId:   existing.id,
        code:         existing.code,
        email:        existing.email,
        displayName:  existing.display_name ?? undefined,
      };
    }

    const code = await nextCanonicalCode(this.db, 'USR');
    const { data, error } = await schema
      .from('users')
      .insert({
        code:          code,
        auth_user_id:  params.authUserId,
        email:         params.email,
        display_name:  params.displayName ?? null,
      })
      .select('id, code, email, display_name')
      .single<UserRow>();
    if (error) throw error;

    return {
      internalId:  data.id,
      code:        data.code,
      email:       data.email,
      displayName: data.display_name ?? undefined,
    };
  }

  async findByAuthUserId(authUserId: string): Promise<UserRow | null> {
    const { data, error } = await platformSchema(this.db)
      .from('users')
      .select('id, code, auth_user_id, email, display_name')
      .eq('auth_user_id', authUserId)
      .is('deleted_at', null)
      .maybeSingle<UserRow>();
    if (error) throw error;
    return data;
  }
}
