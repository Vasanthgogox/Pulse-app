import { useCallback, useState } from "react";
import { cancelDriverInvite } from "@/features/drivers/services/drivers.service";
import { clearDiscoveryCache } from "@/features/network/lib/discoveryCache";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import { useInboundProtocolInvites } from "@/lib/globalSync/useInboundProtocolInvites";
import { useDriverInvitesSentQuery } from "@/lib/queries/useNetworkQueries";
import { queryKeys } from "@/lib/queryKeys";
import {
  approveConnectionRequest,
  cancelConnectionRequest,
  cancelPendingConnectionRequestsForPartnerOwner,
  rejectConnectionRequest,
} from "@/features/connections/services/connectionRequests.service";
import { useQueryClient } from "@tanstack/react-query";

import { isIgnorableSupabaseAuthLockError } from "@/lib/supabaseAuthLock.util";

export function useInboundProtocolInviteActions(orgId: string | null) {
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const driverInvitesSentQ = useDriverInvitesSentQuery(orgId, { bootDeferMs: 0 });
  const { patchAfterAction, refreshInboundProtocol } =
    useInboundProtocolInvites(orgId);
  const qc = useQueryClient();

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
        if (!error) {
          clearDiscoveryCache(orgId);
          // DB trigger created client/supplier rows synchronously — invalidate
          // everything so "Your connections" reflects the new connection immediately.
          qc.invalidateQueries({ queryKey: queryKeys.clients.all(orgId) });
          qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(orgId) });
          qc.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
          qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.received(orgId) });
          qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.sent(orgId) });
        }
      } else if (action === "reject") {
        patchAfterAction(item.id, item.linkedRequestIds);
        const res = await rejectConnectionRequest(item.id, orgId);
        error = res.error;
        if (!error) clearDiscoveryCache(orgId);
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
        await driverInvitesSentQ.refetch();
        return;
      }
      // Optimistic patch already updated global sync; defer refetch so home modals
      // do not flash while the dismiss animation completes.
      const refetchNetworkLists = () =>
        Promise.all([refreshInboundProtocol(), driverInvitesSentQ.refetch()]);
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          void refetchNetworkLists().catch((refetchError) => {
            if (!isIgnorableSupabaseAuthLockError(refetchError)) {
              console.warn("[InboundProtocolInviteActions] deferred refetch failed", refetchError);
            }
          });
        });
      } else {
        setTimeout(() => {
          void refetchNetworkLists().catch((refetchError) => {
            if (!isIgnorableSupabaseAuthLockError(refetchError)) {
              console.warn(
                "[InboundProtocolInviteActions] deferred refetch failed",
                refetchError,
              );
            }
          });
        }, 0);
      }
    },
    [
      orgId,
      qc,
      patchAfterAction,
      refreshInboundProtocol,
      driverInvitesSentQ,
    ],
  );

  return { inviteActionId, handleInviteAction };
}
