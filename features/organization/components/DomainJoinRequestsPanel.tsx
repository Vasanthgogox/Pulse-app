/**
 * Team → Action needed: signups whose email domain matched this org (e.g.
 * vasanthraj@gogox.com signing up after nihas.n@gogox.com already owns the
 * gogox.com workspace) wait here for owner/admin approval instead of getting
 * a duplicate org.
 */
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, X } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import {
  approveOrgDomainJoinRequest,
  declineOrgDomainJoinRequest,
  getOrgDomainJoinRequests,
} from "@/features/organization/services/members.service";
import { useInvalidateOrgMembers } from "@/lib/queries/useOrgMembersQuery";
import { confirmDialog } from "@/lib/confirmDialog";

export function DomainJoinRequestsPanel({
  orgId,
  canManage,
}: {
  orgId: string;
  canManage: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const invalidateMembers = useInvalidateOrgMembers(orgId);

  const query = useQuery({
    queryKey: queryKeys.orgDomainJoinRequests.all(orgId),
    queryFn: async () => {
      const res = await getOrgDomainJoinRequests(orgId);
      if (res.error) throw res.error;
      return res.requests;
    },
    enabled: !!orgId && canManage,
    staleTime: STALE.moderate,
  });

  if (!canManage) return null;
  const requests = query.data ?? [];
  if (requests.length === 0) return null;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.orgDomainJoinRequests.all(orgId) });

  const handleApprove = async (requestId: string, name: string) => {
    const confirmed = await confirmDialog({
      title: "Approve join request?",
      message: `${name} will join with restricted access. You can change their permissions afterward.`,
      confirmLabel: "Approve",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    setBusyId(requestId);
    try {
      const { error } = await approveOrgDomainJoinRequest(requestId);
      if (error) {
        Alert.alert("Could not approve", error.message);
        return;
      }
      invalidateMembers();
      await invalidate();
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (requestId: string, name: string) => {
    const confirmed = await confirmDialog({
      title: "Decline join request?",
      message: `${name} will not be added to this organization.`,
      confirmLabel: "Decline",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    setBusyId(requestId);
    try {
      const { error } = await declineOrgDomainJoinRequest(requestId);
      if (error) {
        Alert.alert("Could not decline", error.message);
        return;
      }
      await invalidate();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <AlertTriangle size={14} color={Theme.warning} strokeWidth={2.4} />
        <Text style={styles.headerText}>Action needed</Text>
      </View>
      {requests.map((r) => {
        const name = r.requester_name?.trim() || r.email;
        const busy = busyId === r.id;
        return (
          <View key={r.id} style={styles.card}>
            <PartyAvatar name={name} initialsColorSeed={r.user_id} size={36} shape="circle" />
            <View style={styles.cardBody}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {r.email} · wants to join this workspace
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={[styles.actionBtn, styles.declineBtn]}
                disabled={busy}
                onPress={() => handleDecline(r.id, name)}
                hitSlop={6}
              >
                {busy ? (
                  <LoadingIndicator size="small" color={Theme.textMuted} />
                ) : (
                  <X size={16} color={Theme.textMuted} strokeWidth={2.4} />
                )}
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.approveBtn]}
                disabled={busy}
                onPress={() => handleApprove(r.id, name)}
                hitSlop={6}
              >
                {busy ? (
                  <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
                ) : (
                  <Check size={16} color={Theme.buttonPrimaryText} strokeWidth={2.6} />
                )}
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 16,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.warning,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  sub: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  declineBtn: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  approveBtn: {
    backgroundColor: Theme.buttonPrimary,
  },
});
