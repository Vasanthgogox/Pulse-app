import type { DriverInviteSentRow } from '@/features/drivers/services/drivers.service';
import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';

/** Map fleet driver invites sent by the org into Inbound Protocol cards. */
export function mapDriverInvitesSentToProtocolItems(
  invites: DriverInviteSentRow[],
): InboundProtocolInviteItem[] {
  return invites
    .filter((row) => String(row.status ?? '').toLowerCase() === 'pending')
    .map((row) => ({
      id: row.id,
      name: (row.driver_name ?? 'Driver').trim() || 'Driver',
      subtitle: 'Fleet driver invitation',
      type: 'DRIVER',
      kind: 'driver',
      partnerOrgId: row.to_user_id ?? row.id,
      createdAt: row.created_at,
      avatarUri: null,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
