/**
 * Inbound Protocol — bootstrap-backed invite lists (no per-open DB polls).
 */
import { useMemo } from 'react';
import { mapPendingInviteItems } from '@/lib/globalSync/inboundProtocol.util';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';

export function useInboundProtocolInvites(orgId: string | null) {
  const connectionRequestsReceived = useGlobalSyncStore(
    (s) => s.connectionRequestsReceived,
  );
  const connectionRequestsSent = useGlobalSyncStore((s) => s.connectionRequestsSent);
  const partnerDisplayByOrgId = useGlobalSyncStore((s) => s.partnerDisplayByOrgId);
  const partnerAvatarUriByOrgId = useGlobalSyncStore((s) => s.partnerAvatarUriByOrgId);
  const partnerOwnerIdByOrgId = useGlobalSyncStore((s) => s.partnerOwnerIdByOrgId);
  const refreshInboundProtocol = useGlobalSyncStore((s) => s.refreshInboundProtocol);

  const receivedItems = useMemo(
    () =>
      mapPendingInviteItems(
        connectionRequestsReceived,
        'received',
        partnerDisplayByOrgId,
        partnerAvatarUriByOrgId,
        partnerOwnerIdByOrgId,
      ),
    [
      connectionRequestsReceived,
      partnerDisplayByOrgId,
      partnerAvatarUriByOrgId,
      partnerOwnerIdByOrgId,
    ],
  );

  const sentItems = useMemo(
    () =>
      mapPendingInviteItems(
        connectionRequestsSent,
        'sent',
        partnerDisplayByOrgId,
        partnerAvatarUriByOrgId,
        partnerOwnerIdByOrgId,
      ),
    [
      connectionRequestsSent,
      partnerDisplayByOrgId,
      partnerAvatarUriByOrgId,
      partnerOwnerIdByOrgId,
    ],
  );

  const pendingCount = receivedItems.length;

  const patchAfterAction = (requestId: string, linkedRequestIds?: string[]) => {
    const drop = new Set([requestId, ...(linkedRequestIds ?? [])]);
    useGlobalSyncStore.setState((s) => ({
      connectionRequestsReceived: s.connectionRequestsReceived.filter(
        (r) => !drop.has(r.id),
      ),
      connectionRequestsSent: s.connectionRequestsSent.filter(
        (r) => !drop.has(r.id),
      ),
    }));
  };

  return {
    receivedItems,
    sentItems,
    pendingCount,
    refreshInboundProtocol: () => {
      if (!orgId) return Promise.resolve();
      return refreshInboundProtocol(orgId);
    },
    patchAfterAction,
  };
}
