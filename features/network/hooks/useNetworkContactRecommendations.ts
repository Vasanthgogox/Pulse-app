import { useCallback, useEffect, useRef, useState } from "react";
import { loadContactPhonesForNetworkLookup } from "@/lib/contactPhonesForLookup";
import {
  getConnectionInviteesByPhones,
  inviteeProfileIsDriver,
  inviteeSuggestedCompanyName,
  type ConnectionInviteeByPhone,
} from "@/features/connections/services/connectionRequests.service";
import { Platform } from "react-native";

export type NetworkContactRecommendation = {
  normalizedPhone: string;
  contactName: string;
  invitee: ConnectionInviteeByPhone;
  displayName: string;
  /** Driver accounts are surfaced so the viewer can see "this person is
   *  already on Pulse as a driver", but you can't send a B2B connection
   *  request to a driver — the UI renders these with a disabled CTA. */
  isDriver: boolean;
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
  // Ref so the filter step always sees the latest connected-org set without
  // triggering a full contact re-sync when connections change.
  const connectedOrgIdsRef = useRef(connectedOrgIds);
  connectedOrgIdsRef.current = connectedOrgIds;

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
      const { inviteesByPhone, error: lookupError } = await getConnectionInviteesByPhones(phones, orgId);
      if (lookupError && inviteesByPhone.size === 0) {
        setRecommendations([]);
        return;
      }

      const nameByPhone = new Map(entries.map((e) => [e.normalized, e.contactName]));
      const next: NetworkContactRecommendation[] = [];

      for (const [normalizedPhone, invitee] of inviteesByPhone) {
        if (!invitee.organization_id || invitee.organization_id === orgId) continue;
        // Already-connected orgs are skipped so the panel only shows actionable / new matches.
        if (connectedOrgIdsRef.current.has(invitee.organization_id)) continue;

        const isDriver = inviteeProfileIsDriver(invitee.profile_role);
        const company =
          inviteeSuggestedCompanyName(invitee) ||
          invitee.organization_name ||
          invitee.full_name;
        next.push({
          normalizedPhone,
          contactName: nameByPhone.get(normalizedPhone) ?? invitee.full_name,
          invitee,
          displayName: company.trim() || invitee.full_name || invitee.phone,
          isDriver,
        });
      }

      /** Surface drivers *after* org accounts. Drivers can't be invited
       *  to connect, so they're informational; the actionable matches
       *  should land at the top of the horizontal list. */
      next.sort((a, b) => {
        if (a.isDriver !== b.isDriver) return a.isDriver ? 1 : -1;
        return a.displayName.localeCompare(b.displayName);
      });
      setRecommendations(next.slice(0, 24));
    } finally {
      setLoading(false);
      setLoadedOnce(true);
      runningRef.current = false;
    }
  }, [orgId, enabled]);  // connectedOrgIds read via ref — no re-sync on connection changes

  useEffect(() => {
    if (!orgId || !enabled) {
      setRecommendations([]);
      return;
    }
    if (Platform.OS === "web") {
      setUnavailable(true);
      return;
    }
    // Check current permission without showing the OS dialog. If already granted,
    // auto-sync. If denied, surface the "Contacts access needed" UI immediately.
    // If undetermined, let the user trigger the sync (and dialog) manually.
    async function checkPermissionAndSync() {
      try {
        const Contacts = await import("expo-contacts");
        const available = await Contacts.isAvailableAsync();
        if (!available) {
          setUnavailable(true);
          return;
        }
        const { status } = await Contacts.getPermissionsAsync();
        if (status === "denied") {
          setPermissionDenied(true);
          setLoadedOnce(true);
          return;
        }
        if (status === "granted") {
          void syncFromContacts();
        }
        // "undetermined": show "Sync contacts" CTA and wait for user tap.
      } catch {
        void syncFromContacts();
      }
    }
    void checkPermissionAndSync();
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
