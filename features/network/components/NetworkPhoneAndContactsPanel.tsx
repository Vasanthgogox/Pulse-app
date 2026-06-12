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
import { NetworkGrowSummaryCard } from "@/features/network/components/NetworkGrowSummaryCard";
import { NetworkPartyDiscoverListCard } from "@/features/network/components/NetworkPartyDiscoverListCard";
import { useNetworkDiscovery } from "@/features/network/hooks/useNetworkDiscovery";
import {
  isConnectableDiscoverOrg,
  scoreDiscoverOrg,
} from "@/features/network/utils/discoverRecommendations.util";
import {
  NETWORK_HUB_GRID_ROW_PADDING_H,
  SPLIT_STACK_BREAKPOINT,
} from "@/features/network/constants/networkHubGrid";
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
import {
  BookUser,
  Contact,
  Link as LinkIcon,
  Phone,
  RefreshCw,
  Settings as SettingsIcon,
  Smartphone,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useOrganization } from "@/contexts/OrganizationContext";

type NetworkPhoneAndContactsPanelProps = {
  orgId: string;
  search: string;
  connectedOrgIds: ReadonlySet<string>;
  totalConnections?: number;
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

/** Best-effort slug builder for the workspace invite URL. Mirrors
 *  organizations.slug semantics (lowercase, hyphenated, alphanumeric)
 *  without requiring a DB round-trip. */
function buildInviteSlug(orgName: string, fallbackId: string): string {
  const normalized = (orgName ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length > 0) return normalized;
  return (fallbackId ?? "").slice(0, 8) || "workspace";
}

function buildInviteUrl(slug: string): { display: string; full: string } {
  const base =
    (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "").trim().replace(/\/$/, "") ||
    "https://qu.network";
  const full = `${base}/join/${slug}`;
  const display = full.replace(/^https?:\/\//, "");
  return { display, full };
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
  totalConnections = 0,
  inviteDailyCapReached = false,
  onSearchChange,
  onOpenProfile,
}: NetworkPhoneAndContactsPanelProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const { orgs: discoverOrgs } = useNetworkDiscovery({ orgId, search: "" });
  const phoneLookup = useNetworkPhoneLookup(search);
  const phoneSearchActive = isPhoneLikeNetworkSearch(search);
  const contactRecs = useNetworkContactRecommendations({
    orgId,
    connectedOrgIds,
    enabled: !phoneSearchActive,
  });

  /**
   * Hero banner switches between a horizontal two-pane card (desktop /
   * tablet ≥ 820px) and a stacked single-column layout (mobile / narrow
   * web). The reference design has "FROM YOUR CONTACTS" on the left
   * 1/3 (gray panel) and "Available on mobile" + Sync Contacts CTA on
   * the right 2/3 (white panel).
   */
  const { width: windowWidth } = useWindowDimensions();
  const heroBannerHorizontal = windowWidth >= SPLIT_STACK_BREAKPOINT;

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [roleModalOrgId, setRoleModalOrgId] = useState<string | null>(null);
  const [roleModalName, setRoleModalName] = useState("");
  const [sentRoles, setSentRoles] = useState<Record<string, ConnectionInviteRole>>({});
  const [importLoading, setImportLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const { currentOrganization } = useOrganization();
  const inviteSlug = useMemo(
    () => buildInviteSlug(currentOrganization?.name ?? "", orgId),
    [currentOrganization?.name, orgId],
  );
  const inviteUrl = useMemo(() => buildInviteUrl(inviteSlug), [inviteSlug]);

  const todayInviteCount = useMemo(
    () => todayPendingInviteCountFromSent(sentQ.data ?? []),
    [sentQ.data],
  );

  const pendingSentOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of sentQ.data ?? []) {
      if (row.status === "pending" && row.to_organization_id) {
        ids.add(row.to_organization_id);
      }
    }
    return ids;
  }, [sentQ.data]);

  const discoverCount = useMemo(
    () =>
      discoverOrgs
        .map(scoreDiscoverOrg)
        .filter(isConnectableDiscoverOrg)
        .filter((o) => !pendingSentOrgIds.has(o.id)).length,
    [discoverOrgs, pendingSentOrgIds],
  );

  const handleCopyInvite = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(inviteUrl.full);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      /* ignore — fall through to share */
    }
  }, [inviteUrl.full]);

  /** When the user is bounced to system Settings to grant Contacts
   *  access, we arm this ref so that the next foreground transition
   *  triggers a fresh `contactRecs.refresh()` automatically. Without
   *  it, the user would return to the app and still see "Contacts
   *  access needed" until they tap Sync a second time — which made
   *  the Allow Access button feel broken. */
  const awaitingPermissionGrantRef = useRef(false);

  /** Native-only: drives the "Sync contacts" hero CTA.
   *
   *  Flow:
   *    • Permission undetermined → call `contactRecs.refresh()`,
   *      which runs `Contacts.requestPermissionsAsync()` and shows
   *      the OS prompt.
   *    • Permission denied      → open the app's own Settings page
   *      via the iOS `app-settings:` URL (or `Linking.openSettings()`
   *      on Android). iOS resolves `app-settings:` directly to this
   *      app's row in Settings, which is the only place a user can
   *      re-grant Contacts after a prior denial. We arm the ref so
   *      the upcoming foreground re-entry re-runs the sync. */
  const handleNativeSyncContacts = useCallback(async () => {
    if (Platform.OS === "web") return;
    if (contactRecs.loading) return;

    if (contactRecs.permissionDenied) {
      awaitingPermissionGrantRef.current = true;
      try {
        if (Platform.OS === "ios") {
          const url = "app-settings:";
          const canOpen = await Linking.canOpenURL(url).catch(() => false);
          if (canOpen) {
            await Linking.openURL(url);
            return;
          }
        }
        await Linking.openSettings();
      } catch {
        awaitingPermissionGrantRef.current = false;
        Alert.alert(
          t("networkContactsPermissionTitle"),
          t("networkContactsPermissionDenied"),
        );
      }
      return;
    }

    void contactRecs.refresh();
  }, [
    contactRecs.loading,
    contactRecs.permissionDenied,
    contactRecs.refresh,
    t,
  ]);

  /** When the user returns from system Settings after we routed them
   *  there (`awaitingPermissionGrantRef.current === true`), re-run the
   *  sync so that:
   *    • a freshly granted permission lights up recommendations
   *      immediately, no extra tap required;
   *    • a still-denied state at least gets re-checked and the UI
   *      stays accurate. */
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (!awaitingPermissionGrantRef.current) return;
      awaitingPermissionGrantRef.current = false;
      void contactRecs.refresh();
    });
    return () => sub.remove();
  }, [contactRecs.refresh]);

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
      (contactRecs.loadedOnce && Platform.OS !== "web"));

  const showContactsSync =
    Platform.OS !== "web" &&
    !contactRecs.unavailable &&
    !contactRecs.permissionDenied;

  /**
   * Resolved props for the hero banner's right pane. The pane has 3 shapes:
   *   - WEB                          → informational only ("Available on
   *     mobile"); no CTA, because there's no contacts-sync flow we can run
   *     from a browser and we no longer link out to a marketing page.
   *   - NATIVE w/ permission OK      → "Sync contacts" / "Refresh" pill
   *   - NATIVE w/ permission denied  → "Allow access" pill (opens settings)
   *
   * `ctaLabel` is `null` when the pane should render as text-only. The JSX
   * below conditionally mounts the Pressable based on that flag so both
   * variants look intentional (matching the reference design).
   */
  const heroCalloutConfig: {
    Icon: typeof Smartphone;
    title: string;
    body: string;
    ctaLabel: string | null;
    ctaIcon: typeof Smartphone | null;
    onPress: (() => void) | null;
    disabled: boolean;
  } = (() => {
    if (Platform.OS === "web") {
      return {
        Icon: Smartphone,
        title: t("networkContactsWebTitle"),
        body: t("networkContactsUnavailable"),
        ctaLabel: null,
        ctaIcon: null,
        onPress: null,
        disabled: false,
      };
    }
    const ctaLabel = contactRecs.permissionDenied
      ? t("networkContactsOpenSettings")
      : contactRecs.loading
        ? t("networkContactsSyncingShort")
        : contactRecs.loadedOnce
          ? t("networkContactsNativeCtaRefresh")
          : t("networkContactsNativeCtaSync");
    return {
      Icon: BookUser,
      title: contactRecs.permissionDenied
        ? t("networkContactsPermissionTitle")
        : t("networkContactsNativeTitle"),
      body: contactRecs.permissionDenied
        ? t("networkContactsPermissionDenied")
        : t("networkContactsNativeBody"),
      ctaLabel,
      ctaIcon: contactRecs.permissionDenied ? SettingsIcon : RefreshCw,
      onPress: handleNativeSyncContacts,
      disabled: contactRecs.loading,
    };
  })();
  const HeroCalloutIcon = heroCalloutConfig.Icon;
  const HeroCalloutCtaIcon = heroCalloutConfig.ctaIcon;

  const detailsCardActive = phoneSearchActive || showContactSection;

  return (
    <View style={styles.wrap}>
      {/* HERO BANNER — horizontal 1/3 + 2/3 split on wide screens (≥ 820px),
       *  stacks to a single column on narrow screens. Left pane carries the
       *  "FROM YOUR CONTACTS" eyebrow on a muted gray background; right pane
       *  hosts the "Available on mobile / Sync contacts" callout and CTA
       *  pinned to the far right.
       */}
      <View
        style={[
          styles.heroBanner,
          heroBannerHorizontal && styles.heroBannerHorizontal,
        ]}
      >
        {/* LEFT PANE — "FROM YOUR CONTACTS" */}
        <View
          style={[
            styles.heroLeftPane,
            heroBannerHorizontal && styles.heroLeftPaneHorizontal,
          ]}
        >
          <View style={styles.heroIconBadge}>
            <Contact size={18} color={Theme.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.heroHeaderText}>
            <Text style={styles.heroKicker}>{t("networkContactsTitleUpper")}</Text>
            <Text style={styles.heroSubtitle}>{t("networkContactsSubtitle")}</Text>
          </View>
        </View>

        {/* RIGHT PANE — "Available on mobile / Sync contacts" + CTA pill */}
        <View
          style={[
            styles.heroRightPane,
            heroBannerHorizontal && styles.heroRightPaneHorizontal,
          ]}
        >
          <View style={styles.heroRightTextRow}>
            <View style={styles.heroInnerIcon}>
              <HeroCalloutIcon size={18} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.heroInnerText}>
              <Text style={styles.heroInnerTitle}>{heroCalloutConfig.title}</Text>
              <Text style={styles.heroInnerBody}>{heroCalloutConfig.body}</Text>
            </View>
          </View>
          {heroCalloutConfig.ctaLabel && heroCalloutConfig.onPress ? (
            <Pressable
              onPress={heroCalloutConfig.onPress}
              disabled={heroCalloutConfig.disabled}
              style={({ pressed }) => [
                styles.heroInnerCta,
                !heroBannerHorizontal && styles.heroInnerCtaStacked,
                heroCalloutConfig.disabled && styles.heroInnerCtaDisabled,
                pressed && !heroCalloutConfig.disabled && styles.heroInnerCtaPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={heroCalloutConfig.ctaLabel}
            >
              {HeroCalloutCtaIcon ? (
                <HeroCalloutCtaIcon size={12} color={Theme.cardWhite} strokeWidth={2.4} />
              ) : null}
              <Text style={styles.heroInnerCtaText}>
                {heroCalloutConfig.ctaLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* DETAILS CARD — phone search + contact recommendations. Lives in its
       *  own card below the banner now that the banner is a horizontal
       *  summary. Only mounts when there's something to show, so the banner
       *  stays the only thing on screen until the user types a phone number
       *  or successfully syncs contacts.
       */}
      {detailsCardActive ? (
        <View style={styles.detailsCard}>
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
            {showContactsSync ? (
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }} />
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
                  <RefreshCw size={13} color={Theme.primary} strokeWidth={2.4} />
                  <Text style={styles.syncChipText}>
                    {contactRecs.loading
                      ? t("networkContactsSyncingShort")
                      : t("networkContactsSync")}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {contactRecs.loading ? (
              <View style={styles.loadingRow}>
                <LoadingIndicator size="small" />
                <Text style={styles.loadingText}>{t("networkContactsSyncing")}</Text>
              </View>
            ) : null}

            {/* On native, the permission-denied state is already
             *  surfaced (with an Allow Access CTA) inside the hero
             *  callout above, so we suppress this duplicate InfoCallout
             *  to avoid the "two stacked Contacts access needed" UX. */}
            {contactRecs.permissionDenied && Platform.OS === "web" ? (
              <InfoCallout
                title={t("networkContactsPermissionTitle")}
                body={t("networkContactsPermissionDenied")}
                icon={<BookUser size={18} color={Theme.primary} strokeWidth={2} />}
              />
            ) : null}

            {/* The "Available on mobile" callout for web users is already
             *  rendered as the hero card's primary inner panel, so we skip
             *  the duplicate InfoCallout here to keep the card uncluttered. */}

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

            {contactRecs.recommendations.length > 0 ? (() => {
                const orgRecs = contactRecs.recommendations.filter((r) => !r.isDriver);
                const driverCount = contactRecs.recommendations.length - orgRecs.length;
                return (
                  <View style={styles.contactList}>
                    {orgRecs.length > 0 ? (
                      <>
                        <Text style={styles.contactListHeading}>
                          {orgRecs.length}{" "}
                          {orgRecs.length === 1
                            ? t("networkContactsOnPulseSingular")
                            : t("networkContactsOnPulsePlural")}
                        </Text>
                        {orgRecs.map((rec, idx) => {
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
                            <View key={rec.normalizedPhone}>
                              {idx > 0 ? <View style={styles.contactRowDivider} /> : null}
                              <NetworkPartyDiscoverListCard
                                orgId={targetId}
                                name={rec.displayName}
                                locationLabel={rec.contactName}
                                connectionStatus={status}
                                pendingRole={pendingRole}
                                loading={connectingId === targetId}
                                viewerOrgId={orgId}
                                onOpenProfile={
                                  onOpenProfile
                                    ? () =>
                                        onOpenProfile({
                                          id: targetId,
                                          name: rec.displayName,
                                          connection_status: status,
                                        })
                                    : undefined
                                }
                                onConnect={
                                  status === "none"
                                    ? () => openRoleModal(targetId, rec.displayName)
                                    : undefined
                                }
                                onCancel={
                                  status === "pending"
                                    ? () => void handleCancel(targetId)
                                    : undefined
                                }
                                nativeListRow
                              />
                            </View>
                          );
                        })}
                      </>
                    ) : null}
                    {driverCount > 0 ? (
                      <Text style={styles.contactDriverNote}>
                        {driverCount}{" "}
                        {driverCount === 1
                          ? t("networkContactsDriverNoteSingular")
                          : t("networkContactsDriverNotePlural")}
                      </Text>
                    ) : null}
                  </View>
                );
              })()
            : null}
          </View>
        ) : null}
        </View>
      ) : null}

      {/* Grow summary + Invite via Link — side-by-side on wide, stacked on narrow. */}
      <View
        style={[
          styles.inviteRow,
          !heroBannerHorizontal && styles.inviteRowStacked,
        ]}
      >
        <NetworkGrowSummaryCard
          discoverCount={discoverCount}
          totalConnections={totalConnections}
          todayInviteCount={todayInviteCount}
        />
        <View style={styles.inviteCard}>
          <View style={styles.inviteGlow} pointerEvents="none" />
          <View style={styles.inviteHeaderRow}>
            <View style={styles.inviteIconWrap}>
              <LinkIcon size={14} color={Theme.actionAccent} strokeWidth={2.2} />
            </View>
            <Text style={styles.inviteCardTitle}>{t("networkInviteHeading")}</Text>
          </View>
          <Text style={styles.inviteCardBody}>{t("networkInviteBody")}</Text>
          <View style={styles.inviteCopyRow}>
            <Text style={styles.inviteUrlText} numberOfLines={1}>
              {inviteUrl.display}
            </Text>
            <Pressable
              onPress={() => void handleCopyInvite()}
              style={({ pressed }) => [
                styles.inviteCopyBtn,
                pressed && styles.inviteCopyBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                inviteCopied
                  ? t("networkInviteCopied")
                  : t("networkInviteCopy")
              }
            >
              <Text style={styles.inviteCopyBtnText}>
                {inviteCopied ? t("networkInviteCopied") : t("networkInviteCopy")}
              </Text>
            </Pressable>
          </View>
        </View>
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
    gap: 12,
  },

  /* ── Hero banner (FROM YOUR CONTACTS) ─────────────────────────────
   *
   *  Two-pane layout matching the reference design:
   *    ┌────────────────┬───────────────────────────────────────────┐
   *    │ [icon] FROM    │ [icon] Available on mobile      [SYNC ▸] │
   *    │  YOUR CONTACTS │  Open the Pulse app on your phone…       │
   *    │  subtitle…     │                                           │
   *    └────────────────┴───────────────────────────────────────────┘
   *
   *  Color scheme: the banner is a calm two-tone gray/white card.
   *  The shell is white with a hairline slate border; the left pane
   *  carries a recessed light-gray wash so it reads as a "label" strip;
   *  the right pane stays transparent and inherits the banner's white
   *  surface. Brand purple is reserved for the section icons and the
   *  right-pane CTA pill so the chrome stays neutral and the action
   *  remains visually anchored.
   *
   *  - Wide screens (≥ SPLIT_STACK_BREAKPOINT): the `*Horizontal` variants
   *    apply `flexDirection: "row"` to the banner, fix the left pane width
   *    to ~33%, and pin the CTA to the far right of the right pane.
   *  - Narrow screens: the banner stacks vertically; the left pane swaps
   *    its right border for a bottom border; the CTA on the right pane
   *    spans full width.
   */
  heroBanner: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    flexDirection: "column",
    ...Platform.select({
      web: {
        boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      },
    }),
  },
  heroBannerHorizontal: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  /** Left pane = recessed light-gray "label" strip. The slight
   *  contrast against the white right pane creates the two-tone
   *  hierarchy without any explicit divider rule. The bottom (or
   *  right, when horizontal) hairline reinforces the section
   *  separation. */
  heroLeftPane: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: Theme.surface,
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  heroLeftPaneHorizontal: {
    width: "33%",
    minWidth: 220,
    borderBottomWidth: 0,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
  },
  heroRightPane: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
    backgroundColor: "transparent",
  },
  heroRightPaneHorizontal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 18,
  },
  heroRightTextRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  heroIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(79,70,229,0.10)",
    borderWidth: 1,
    borderColor: "rgba(79,70,229,0.18)",
    flexShrink: 0,
  },
  heroHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  /** Refined eyebrow — matches the page-level "Discover potential allies"
   *  kicker (8px / 800 / 1.2 letter-spacing). Less shouty than the prior
   *  900-weight 12px label. */
  heroKicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  heroInnerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(79,70,229,0.10)",
    borderWidth: 1,
    borderColor: "rgba(79,70,229,0.18)",
    flexShrink: 0,
  },
  heroInnerText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  heroInnerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  heroInnerBody: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 17,
  },
  /** CTA pill carries the brand color now that the banner shell is
   *  neutral: purple surface, white text/icon, soft purple shadow so
   *  the pill reads as elevated and clearly actionable against the
   *  gray/white chrome. */
  heroInnerCta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    flexShrink: 0,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(79,70,229,0.22)",
      },
      default: {
        shadowColor: "#4F46E5",
        shadowOpacity: 0.22,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      },
    }),
  },
  /** Narrow screens stack the CTA below the text block; full-width
   *  matches the reference's `w-full sm:w-auto` pattern so the tap
   *  target is comfortable on phones. */
  heroInnerCtaStacked: {
    alignSelf: "stretch",
  },
  heroInnerCtaDisabled: {
    opacity: 0.7,
  },
  heroInnerCtaPressed: {
    opacity: 0.92,
  },
  heroInnerCtaText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: Theme.cardWhite,
  },

  /* ── Details card (phone search + contact recommendations) ──────
   *  Lives below the hero banner. Mounts only when there's something
   *  to show so the banner remains the focus until the user types a
   *  phone or successfully syncs contacts. */
  detailsCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    padding: 16,
    gap: 14,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },

  /* ── Invite via Link card (light surface, purple CTA) ─────────────
   *
   *  Color swap counterpart to the hero banner: this card used to be a
   *  deep purple panel with a white "Copy" pill. It now mirrors the
   *  surface treatment that the hero banner had — light card surface
   *  (cardWhite) with dark text — and the "Copy" pill inverts to purple
   *  with white text. The decorative top-right glow goes from translucent
   *  white to a faint indigo wash so it still adds depth on the light bg.
   */
  inviteRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  inviteRowStacked: {
    flexDirection: "column",
  },
  inviteCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    padding: 18,
    gap: 8,
    position: "relative",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  inviteGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(99, 102, 241, 0.05)",
  },
  inviteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  inviteIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99, 102, 241, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.14)",
  },
  inviteCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  inviteCardBody: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  inviteCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  inviteUrlText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    ...Platform.select({
      web: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
      default: {},
    }),
  },
  inviteCopyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.actionAccent,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 6px rgba(99,102,241,0.20)",
      },
      default: {
        shadowColor: Theme.actionAccent,
        shadowOpacity: 0.20,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      },
    }),
  },
  inviteCopyBtnPressed: {
    opacity: 0.88,
  },
  inviteCopyBtnText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: Theme.cardWhite,
  },

  /* ── Inline sections (phone search / contact recs) inside hero ── */
  section: {
    paddingHorizontal: 0,
    paddingVertical: 2,
    gap: 10,
    width: "100%",
  },
  divider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 0,
    marginVertical: 2,
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
    backgroundColor: "rgba(79, 70, 229, 0.08)",
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
  contactList: {
    gap: 0,
  },
  contactListHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textSecondary,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  contactRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 2,
  },
  contactDriverNote: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 10,
    paddingHorizontal: 2,
  },
});
