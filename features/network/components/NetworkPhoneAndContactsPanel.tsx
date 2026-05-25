/**
 * Network discover helpers: debounced phone lookup + contacts-on-app recommendations.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  ConnectionRoleModal,
  type ConnectionInviteRole,
} from "@/features/network/components/ConnectionRoleModal";
import { NetworkPartyDiscoverListCard } from "@/features/network/components/NetworkPartyDiscoverListCard";
import { NETWORK_HUB_GRID_ROW_PADDING_H } from "@/features/network/constants/networkHubGrid";
import { useNetworkContactRecommendations } from "@/features/network/hooks/useNetworkContactRecommendations";
import { useNetworkPhoneLookup } from "@/features/network/hooks/useNetworkPhoneLookup";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  pickContactForNameAndPhone,
  requestContactsPermission,
} from "@/lib/contactPicker";
import { isPhoneLikeNetworkSearch } from "@/lib/networkPhoneSearch";
import { queryKeys } from "@/lib/queryKeys";
import { showAppAlert } from "@/lib/appAlert";
import {
  cancelPendingConnectionRequestByOrgPair,
  CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
  CONNECTION_REQUEST_DAILY_LIMIT_TITLE,
  createConnectionRequest,
  DAILY_CONNECTION_INVITE_LIMIT,
  inviteeProfileIsDriver,
  inviteeSuggestedCompanyName,
  looksLikeConnectionRateLimitError,
  type ConnectionRequestRow,
} from "@/features/connections/services/connectionRequests.service";
import {
  useConnectionRequestsSentQuery,
  useInvalidateNetwork,
} from "@/lib/queries/useNetworkQueries";
import { todayPendingInviteCountFromSent } from "@/lib/todayPendingInviteCount";
import { BookUser, Phone, RefreshCw, Smartphone } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

type NetworkPhoneAndContactsPanelProps = {
  orgId: string;
  search: string;
  connectedOrgIds: ReadonlySet<string>;
  inviteDailyCapReached?: boolean;
  onSearchChange?: (value: string) => void;
  onOpenProfile?: (org: {
    id: string;
    name: string;
    connection_status?: string | null;
  }) => void;
};

function connectionStatusForOrg(
  orgId: string,
  connectedOrgIds: ReadonlySet<string>,
  sent: ConnectionRequestRow[],
): string {
  if (connectedOrgIds.has(orgId)) return "approved";
  const pending = sent.find(
    (r) => r.to_organization_id === orgId && r.status === "pending",
  );
  if (pending) return "pending";
  return "none";
}

function pendingRoleForOrg(
  orgId: string,
  sent: ConnectionRequestRow[],
): ConnectionInviteRole | null {
  const pending = sent.find(
    (r) => r.to_organization_id === orgId && r.status === "pending",
  );
  if (!pending) return null;
  if (pending.request_shipper_client) return "client";
  if (pending.request_carrier_supplier) return "supplier";
  return null;
}

function SectionIconBadge({
  children,
}: {
  children: React.ReactNode;
}) {
  return <View style={styles.iconBadge}>{children}</View>;
}

function InfoCallout({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <View style={styles.infoCallout}>
      <View style={styles.infoIconWrap}>{icon}</View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoBody}>{body}</Text>
      </View>
    </View>
  );
}

export function NetworkPhoneAndContactsPanel({
  orgId,
  search,
  connectedOrgIds,
  inviteDailyCapReached = false,
  onSearchChange,
  onOpenProfile,
}: NetworkPhoneAndContactsPanelProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const phoneLookup = useNetworkPhoneLookup(search);
  const phoneSearchActive = isPhoneLikeNetworkSearch(search);
  const contactRecs = useNetworkContactRecommendations({
    orgId,
    connectedOrgIds,
    enabled: !phoneSearchActive,
  });

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [roleModalOrgId, setRoleModalOrgId] = useState<string | null>(null);
  const [roleModalName, setRoleModalName] = useState("");
  const [sentRoles, setSentRoles] = useState<Record<string, ConnectionInviteRole>>({});
  const [importLoading, setImportLoading] = useState(false);

  const todayInviteCount = useMemo(
    () => todayPendingInviteCountFromSent(sentQ.data ?? []),
    [sentQ.data],
  );
  const atDailyLimit = useMemo(
    () =>
      todayInviteCount >= DAILY_CONNECTION_INVITE_LIMIT || inviteDailyCapReached === true,
    [todayInviteCount, inviteDailyCapReached],
  );

  const showInviteLimitAlert = useCallback(() => {
    showAppAlert(CONNECTION_REQUEST_DAILY_LIMIT_TITLE, CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE);
  }, []);

  const openRoleModal = useCallback(
    (targetOrgId: string, name: string) => {
      if (atDailyLimit) {
        showInviteLimitAlert();
        return;
      }
      setRoleModalOrgId(targetOrgId);
      setRoleModalName(name);
    },
    [atDailyLimit, showInviteLimitAlert],
  );

  const handleConnect = useCallback(
    async (targetOrgId: string, name: string, mode: ConnectionInviteRole) => {
      if (atDailyLimit) {
        showInviteLimitAlert();
        return;
      }
      setConnectingId(targetOrgId);
      const { error, alreadyInvited, requestId } = await createConnectionRequest(
        orgId,
        targetOrgId,
        {
          requestShipperClient: mode === "client",
          requestCarrierSupplier: mode === "supplier",
        },
      );
      setConnectingId(null);
      setRoleModalOrgId(null);
      if (error) {
        const msg = error.message;
        if (looksLikeConnectionRateLimitError(msg)) {
          showInviteLimitAlert();
        } else {
          Alert.alert(t("networkDiscoverConnect"), msg);
        }
        return;
      }
      setSentRoles((prev) => ({ ...prev, [targetOrgId]: mode }));
      if (requestId) {
        queryClient.setQueryData<ConnectionRequestRow[]>(
          queryKeys.connectionRequests.sent(orgId),
          (prev = []) => {
            if (prev.some((r) => r.id === requestId)) return prev;
            const optimistic: ConnectionRequestRow = {
              id: requestId,
              from_organization_id: orgId,
              to_organization_id: targetOrgId,
              request_shipper_client: mode === "client",
              request_carrier_supplier: mode === "supplier",
              status: "pending",
              created_at: new Date().toISOString(),
              responded_at: null,
              responded_by: null,
              from_org_name: "",
              to_org_name: name,
            };
            return [optimistic, ...prev];
          },
        );
      }
      if (!alreadyInvited) invalidateNetwork();
    },
    [atDailyLimit, orgId, queryClient, invalidateNetwork, showInviteLimitAlert, t],
  );

  const handleCancel = useCallback(
    async (targetOrgId: string) => {
      setConnectingId(targetOrgId);
      const { error } = await cancelPendingConnectionRequestByOrgPair(orgId, targetOrgId);
      setConnectingId(null);
      if (error) Alert.alert(t("networkDiscoverRequestSent"), error.message);
      setSentRoles((prev) => {
        const next = { ...prev };
        delete next[targetOrgId];
        return next;
      });
      queryClient.setQueryData<ConnectionRequestRow[]>(
        queryKeys.connectionRequests.sent(orgId),
        (prev = []) =>
          prev.filter(
            (r) => !(r.to_organization_id === targetOrgId && r.status === "pending"),
          ),
      );
      invalidateNetwork();
    },
    [orgId, queryClient, invalidateNetwork, t],
  );

  const handlePickContactForSearch = useCallback(async () => {
    if (!onSearchChange) return;
    setImportLoading(true);
    try {
      if (Platform.OS !== "web") {
        await requestContactsPermission();
      }
      const result = await pickContactForNameAndPhone();
      if (!result.ok) {
        if (
          result.reason === "permission_denied" ||
          result.reason === "unavailable"
        ) {
          Alert.alert(
            t("networkContactsTitle"),
            result.message ?? t("couldNotLoadContact"),
          );
        }
        return;
      }
      onSearchChange(result.contact.phone.replace(/\D/g, "").slice(-10));
    } finally {
      setImportLoading(false);
    }
  }, [onSearchChange, t]);

  const phoneInvitee = phoneLookup.invitee;
  const phoneOrgId = phoneInvitee?.organization_id ?? null;
  const phoneDisplayName = phoneInvitee
    ? inviteeSuggestedCompanyName(phoneInvitee) ||
      phoneInvitee.organization_name ||
      phoneInvitee.full_name
    : "";
  const phoneIsDriver = inviteeProfileIsDriver(phoneInvitee?.profile_role);
  const phoneConnected =
    phoneOrgId != null && connectedOrgIds.has(phoneOrgId);
  const phoneStatus =
    phoneOrgId != null
      ? connectionStatusForOrg(phoneOrgId, connectedOrgIds, sentQ.data ?? [])
      : "none";
  const phonePendingRole =
    phoneOrgId != null
      ? sentRoles[phoneOrgId] ?? pendingRoleForOrg(phoneOrgId, sentQ.data ?? [])
      : null;

  const showContactSection =
    !phoneSearchActive &&
    (contactRecs.loading ||
      contactRecs.recommendations.length > 0 ||
      contactRecs.permissionDenied ||
      contactRecs.unavailable);

  const showContactsSync =
    Platform.OS !== "web" &&
    !contactRecs.unavailable &&
    !contactRecs.permissionDenied;

  if (!phoneSearchActive && !showContactSection) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        {phoneSearchActive ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <SectionIconBadge>
                  <Phone size={14} color={Theme.primary} strokeWidth={2.2} />
                </SectionIconBadge>
                <View style={styles.sectionTitles}>
                  <Text style={styles.sectionKicker}>{t("networkPhoneSearchKicker")}</Text>
                  <Text style={styles.sectionSubtitle}>{t("networkPhoneSearchSubtitle")}</Text>
                </View>
              </View>
            </View>

            {phoneLookup.loading ? (
              <View style={styles.loadingRow}>
                <LoadingIndicator size="small" />
                <Text style={styles.loadingText}>{t("networkPhoneSearchLookingUp")}</Text>
              </View>
            ) : null}
            {phoneLookup.error ? (
              <Text style={styles.errorText}>{phoneLookup.error}</Text>
            ) : null}

            {onSearchChange ? (
              <Pressable
                onPress={() => void handlePickContactForSearch()}
                disabled={importLoading}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.secondaryBtnPressed,
                ]}
              >
                <BookUser size={14} color={Theme.primary} strokeWidth={2.2} />
                <Text style={styles.secondaryBtnText}>
                  {importLoading ? t("networkContactsOpening") : t("networkPhonePickContact")}
                </Text>
              </Pressable>
            ) : null}

            {phoneLookup.searched && !phoneLookup.loading && !phoneInvitee ? (
              <InfoCallout
                title={t("networkPhoneSearchNoAccountTitle")}
                body={t("networkPhoneSearchNoAccount")}
                icon={<Phone size={18} color={Theme.primary} strokeWidth={2} />}
              />
            ) : null}

            {phoneInvitee && phoneOrgId ? (
              phoneIsDriver ? (
                <InfoCallout
                  title={t("networkPhoneSearchDriverTitle")}
                  body={t("networkPhoneSearchDriverAccount")}
                  icon={<Phone size={18} color={Theme.textSecondary} strokeWidth={2} />}
                />
              ) : phoneOrgId === orgId ? (
                <InfoCallout
                  title={t("networkPhoneSearchOwnOrgTitle")}
                  body={t("networkPhoneSearchOwnOrg")}
                  icon={<Phone size={18} color={Theme.textSecondary} strokeWidth={2} />}
                />
              ) : (
                <View style={styles.resultCard}>
                  <NetworkPartyDiscoverListCard
                    orgId={phoneOrgId}
                    name={phoneDisplayName}
                    locationLabel={phoneInvitee.full_name || phoneInvitee.phone}
                    connectionStatus={phoneConnected ? "approved" : phoneStatus}
                    pendingRole={phonePendingRole}
                    loading={connectingId === phoneOrgId}
                    viewerOrgId={orgId}
                    onOpenProfile={
                      onOpenProfile
                        ? () =>
                            onOpenProfile({
                              id: phoneOrgId,
                              name: phoneDisplayName,
                              connection_status: phoneStatus,
                            })
                        : undefined
                    }
                    onConnect={
                      phoneStatus === "none" && !phoneConnected
                        ? () => openRoleModal(phoneOrgId, phoneDisplayName)
                        : undefined
                    }
                    onCancel={
                      phoneStatus === "pending"
                        ? () => void handleCancel(phoneOrgId)
                        : undefined
                    }
                    nativeListRow
                  />
                </View>
              )
            ) : null}
          </View>
        ) : null}

        {phoneSearchActive && showContactSection ? <View style={styles.divider} /> : null}

        {showContactSection ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <SectionIconBadge>
                  <BookUser size={14} color={Theme.primary} strokeWidth={2.2} />
                </SectionIconBadge>
                <View style={styles.sectionTitles}>
                  <Text style={styles.sectionKicker}>{t("networkContactsTitle")}</Text>
                  <Text style={styles.sectionSubtitle}>{t("networkContactsSubtitle")}</Text>
                </View>
              </View>
              {showContactsSync ? (
                <Pressable
                  onPress={() => void contactRecs.refresh()}
                  disabled={contactRecs.loading}
                  style={({ pressed }) => [
                    styles.syncChip,
                    contactRecs.loading && styles.syncChipDisabled,
                    pressed && !contactRecs.loading && styles.syncChipPressed,
                  ]}
                  hitSlop={6}
                >
                  <RefreshCw
                    size={13}
                    color={Theme.primary}
                    strokeWidth={2.4}
                  />
                  <Text style={styles.syncChipText}>
                    {contactRecs.loading ? t("networkContactsSyncingShort") : t("networkContactsSync")}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {contactRecs.loading ? (
              <View style={styles.loadingRow}>
                <LoadingIndicator size="small" />
                <Text style={styles.loadingText}>{t("networkContactsSyncing")}</Text>
              </View>
            ) : null}

            {contactRecs.permissionDenied ? (
              <InfoCallout
                title={t("networkContactsPermissionTitle")}
                body={t("networkContactsPermissionDenied")}
                icon={<BookUser size={18} color={Theme.primary} strokeWidth={2} />}
              />
            ) : null}

            {contactRecs.unavailable && !contactRecs.permissionDenied ? (
              <InfoCallout
                title={t("networkContactsWebTitle")}
                body={t("networkContactsUnavailable")}
                icon={<Smartphone size={18} color={Theme.primary} strokeWidth={2} />}
              />
            ) : null}

            {!contactRecs.loading &&
            contactRecs.loadedOnce &&
            contactRecs.recommendations.length === 0 &&
            !contactRecs.permissionDenied &&
            !contactRecs.unavailable ? (
              <InfoCallout
                title={t("networkContactsEmptyTitle")}
                body={t("networkContactsEmpty")}
                icon={<BookUser size={18} color={Theme.textSecondary} strokeWidth={2} />}
              />
            ) : null}

            {contactRecs.recommendations.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.contactScroll}
              >
                {contactRecs.recommendations.map((rec) => {
                  const targetId = rec.invitee.organization_id;
                  const status = connectionStatusForOrg(
                    targetId,
                    connectedOrgIds,
                    sentQ.data ?? [],
                  );
                  const pendingRole =
                    sentRoles[targetId] ??
                    pendingRoleForOrg(targetId, sentQ.data ?? []);
                  return (
                    <View key={rec.normalizedPhone} style={styles.contactCard}>
                      <View style={styles.contactCardHead}>
                        <PartyAvatar
                          name={rec.displayName.toUpperCase()}
                          entityType="client"
                          size={40}
                        />
                        <View style={styles.contactCardText}>
                          <Text style={styles.contactOrgName} numberOfLines={1}>
                            {rec.displayName}
                          </Text>
                          <Text style={styles.contactSub} numberOfLines={1}>
                            {rec.contactName}
                          </Text>
                        </View>
                      </View>
                      <Pressable
                        style={({ pressed }) => [
                          styles.contactConnectBtn,
                          (status !== "none" || connectingId === targetId) &&
                            styles.contactConnectBtnMuted,
                          pressed && { opacity: 0.88 },
                        ]}
                        disabled={
                          status !== "none" || connectingId === targetId || atDailyLimit
                        }
                        onPress={() => openRoleModal(targetId, rec.displayName)}
                      >
                        <Text style={styles.contactConnectBtnText}>
                          {status === "approved"
                            ? t("networkDiscoverConnected")
                            : status === "pending"
                              ? pendingRole === "supplier"
                                ? t("networkDiscoverRequestSentAsSupplier")
                                : t("networkDiscoverRequestSentAsClient")
                              : t("networkDiscoverConnect")}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        ) : null}
      </View>

      <ConnectionRoleModal
        visible={roleModalOrgId != null}
        companyName={roleModalName}
        submitting={connectingId != null}
        onClose={() => {
          if (connectingId) return;
          setRoleModalOrgId(null);
        }}
        onConfirm={(role) => {
          if (!roleModalOrgId) return;
          void handleConnect(roleModalOrgId, roleModalName, role);
        }}
      />
    </View>
  );
}

const HUB_PAD = NETWORK_HUB_GRID_ROW_PADDING_H;

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: HUB_PAD,
    marginTop: 4,
    marginBottom: 14,
  },
  card: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      },
    }),
  },
  section: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    width: "100%",
  },
  divider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  sectionTitles: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26, 35, 126, 0.08)",
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Theme.textMuted,
    lineHeight: 16,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  loadingText: {
    fontSize: 12,
    color: Theme.textMuted,
  },
  errorText: {
    fontSize: 12,
    color: Theme.negative,
    lineHeight: 17,
  },
  infoCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  infoTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  infoBody: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 17,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
  },
  secondaryBtnPressed: {
    opacity: 0.88,
    backgroundColor: Theme.surfaceGray,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  syncChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    flexShrink: 0,
  },
  syncChipPressed: {
    opacity: 0.85,
  },
  syncChipDisabled: {
    opacity: 0.55,
  },
  syncChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  resultCard: {
    borderRadius: 10,
    overflow: "hidden",
  },
  contactScroll: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 2,
  },
  contactCard: {
    width: 216,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    gap: 10,
  },
  contactCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contactCardText: {
    flex: 1,
    minWidth: 0,
  },
  contactOrgName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  contactSub: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  contactConnectBtn: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.primary,
  },
  contactConnectBtnMuted: {
    backgroundColor: Theme.borderMedium,
  },
  contactConnectBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
});
