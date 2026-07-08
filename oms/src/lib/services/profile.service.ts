import { getIdentityDb } from '@/lib/supabase';

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  company_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
};

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const db = getIdentityDb();
  if (!db) return null;

  const { data, error } = await db
    .from('profiles')
    .select('id, email, full_name, phone, role, company_name, avatar_url, avatar_seed')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserProfile;
}
