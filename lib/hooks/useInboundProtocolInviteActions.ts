import { useCallback, useState } from "react";
import { cancelDriverInvite } from "@/features/drivers/services/drivers.service";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import { useInboundProtocolInvites } from "@/lib/globalSync/useInboundProtocolInvites";
import {
  useConnectionRequestsReceivedQuery,
  useConnectionRequestsSentQuery,
  useDriverInvitesSentQuery,
} from "@/lib/queries/useNetworkQueries";
import {
  approveConnectionRequest,
  cancelConnectionRequest,
  cancelPendingConnectionRequestsForPartnerOwner,
  rejectConnectionRequest,
} from "@/features/connections/services/connectionRequests.service";

export function useInboundProtocolInviteActions(orgId: string | null) {
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const driverInvitesSentQ = useDriverInvitesSentQuery(orgId);
  const { patchAfterAction, refreshInboundProtocol } =
    useInboundProtocolInvites(orgId);

  const handleInviteAction = useCallback(
    async (
      item: InboundProtocolInviteItem,
      action: "approve" | "reject" | "cancel",
    ) => {
      if (!orgId) return;
      setInviteActionId(item.id);
      let error: Error | null = null;
      if (action === "approve") {
        patchAfterAction(item.id, item.linkedRequestIds);
        const res = await approveConnectionRequest(item.id, orgId);
        error = res.error;
      } else if (action === "reject") {
        patchAfterAction(item.id, item.linkedRequestIds);
        const res = await rejectConnectionRequest(item.id, orgId);
        error = res.error;
      } else if (action === "cancel" && item.kind === "driver") {
        const res = await cancelDriverInvite(item.id);
        error = res.error;
      } else if (item.partnerOwnerId) {
        const res = await cancelPendingConnectionRequestsForPartnerOwner(
          orgId,
          item.partnerOwnerId,
        );
        error = res.error;
        if (!error) {
          patchAfterAction(
            item.id,
            res.deletedIds.length > 0 ? res.deletedIds : item.linkedRequestIds,
          );
        }
      } else {
        patchAfterAction(item.id, item.linkedRequestIds);
        const ids = item.linkedRequestIds?.length
          ? item.linkedRequestIds
          : [item.id];
        for (const id of ids) {
          const res = await cancelConnectionRequest(id);
          if (res.error) {
            error = res.error;
            break;
          }
        }
      }
      setInviteActionId(null);
      if (error) {
        await refreshInboundProtocol();
        await Promise.all([
          receivedQ.refetch(),
          sentQ.refetch(),
          driverInvitesSentQ.refetch(),
        ]);
        return;
      }
      // Optimistic patch already updated global sync; defer refetch so home modals
      // do not flash while the dismiss animation completes.
      const refetchNetworkLists = () =>
        Promise.all([
          receivedQ.refetch(),
          sentQ.refetch(),
          driverInvitesSentQ.refetch(),
        ]);
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          void refetchNetworkLists();
        });
      } else {
        setTimeout(() => void refetchNetworkLists(), 0);
      }
    },
    [
      orgId,
      patchAfterAction,
      refreshInboundProtocol,
      receivedQ,
      sentQ,
      driverInvitesSentQ,
    ],
  );

  return { inviteActionId, handleInviteAction };
}
