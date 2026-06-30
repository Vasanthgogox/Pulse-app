import type { IdentitySupabase } from '../db/client';
import { MembershipRepository } from '../repositories/membership.repository';

export async function assertOrgAdmin(
  db: IdentitySupabase,
  authUserId: string,
  organizationCode: string,
): Promise<void> {
  const membershipRepo = new MembershipRepository(db);
  await membershipRepo.assertOrgAdmin(authUserId, organizationCode);
}
