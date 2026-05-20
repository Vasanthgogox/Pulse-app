import { useCallback, useEffect, useRef, useState } from "react";
import { loadContactPhonesForNetworkLookup } from "@/lib/contactPhonesForLookup";
import {
  getConnectionInviteesByPhones,
  inviteeProfileIsDriver,
  inviteeSuggestedCompanyName,
  type ConnectionInviteeByPhone,
} from "@/services/connectionRequestsService";

export type NetworkContactRecommendation = {
  normalizedPhone: string;
  contactName: string;
  invitee: ConnectionInviteeByPhone;
  displayName: string;
};

type UseNetworkContactRecommendationsOptions = {
  orgId: string | null;
  connectedOrgIds: ReadonlySet<string>;
  /** Skip contact sync while user is searching by phone. */
  enabled?: boolean;
};

export function useNetworkContactRecommendations({
  orgId,
  connectedOrgIds,
  enabled = true,
}: UseNetworkContactRecommendationsOptions) {
  const [recommendations, setRecommendations] = useState<NetworkContactRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const runningRef = useRef(false);

  const syncFromContacts = useCallback(async () => {
    if (!orgId || !enabled || runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setPermissionDenied(false);
    setUnavailable(false);

    try {
      const { entries, error: contactError } = await loadContactPhonesForNetworkLookup();
      if (contactError === "permission_denied") {
        setPermissionDenied(true);
        setRecommendations([]);
        return;
      }
      if (contactError === "unavailable" || entries.length === 0) {
        if (contactError === "unavailable") setUnavailable(true);
        setRecommendations([]);
        return;
      }

      const phones = entries.map((e) => e.normalized);
      const { inviteesByPhone, error: lookupError } = await getConnectionInviteesByPhones(phones);
      if (lookupError && inviteesByPhone.size === 0) {
        setRecommendations([]);
        return;
      }

      const nameByPhone = new Map(entries.map((e) => [e.normalized, e.contactName]));
      const next: NetworkContactRecommendation[] = [];

      for (const [normalizedPhone, invitee] of inviteesByPhone) {
        if (!invitee.organization_id || invitee.organization_id === orgId) continue;
        if (inviteeProfileIsDriver(invitee.profile_role)) continue;
        if (connectedOrgIds.has(invitee.organization_id)) continue;

        const company =
          inviteeSuggestedCompanyName(invitee) ||
          invitee.organization_name ||
          invitee.full_name;
        next.push({
          normalizedPhone,
          contactName: nameByPhone.get(normalizedPhone) ?? invitee.full_name,
          invitee,
          displayName: company.trim() || invitee.full_name || invitee.phone,
        });
      }

      next.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setRecommendations(next.slice(0, 12));
    } finally {
      setLoading(false);
      setLoadedOnce(true);
      runningRef.current = false;
    }
  }, [orgId, enabled, connectedOrgIds]);

  useEffect(() => {
    if (!orgId || !enabled) {
      setRecommendations([]);
      return;
    }
    void syncFromContacts();
  }, [orgId, enabled, syncFromContacts]);

  return {
    recommendations,
    loading,
    permissionDenied,
    unavailable,
    loadedOnce,
    refresh: syncFromContacts,
  };
}
