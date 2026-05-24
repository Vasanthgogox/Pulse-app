import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import { mapDriverInvitesSentToProtocolItems } from '@/lib/globalSync/driverInviteProtocol.util';
import { useInboundProtocolInvites } from '@/lib/globalSync/useInboundProtocolInvites';
import { useDriverInvitesSentQuery } from '@/lib/queries/useNetworkQueries';
import { useMemo } from 'react';

/** Connection protocol invites plus pending fleet driver invitations (sent tab). */
export function useProtocolInvitesWithDriverSent(orgId: string | null) {
  const protocol = useInboundProtocolInvites(orgId);
  const driverInvitesSentQ = useDriverInvitesSentQuery(orgId);

  const driverSentItems = useMemo(
    () => mapDriverInvitesSentToProtocolItems(driverInvitesSentQ.data ?? []),
    [driverInvitesSentQ.data],
  );

  const sentItems = useMemo((): InboundProtocolInviteItem[] => {
    const merged = [...protocol.sentItems, ...driverSentItems];
    return merged.sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    );
  }, [protocol.sentItems, driverSentItems]);

  return {
    ...protocol,
    sentItems,
    driverSentItems,
    refetchDriverInvitesSent: () => driverInvitesSentQ.refetch(),
  };
}
