/**
 * Client Profile Hub — Metronic tabbed layout (Overview, KYC, Warehouses, Contracts, etc.)
 */
import { ClientProfileOverviewPanel } from "@/features/clients/components/desktop/ClientProfileOverviewPanel";
import { ClientProfileKycPanel } from "@/features/clients/components/desktop/ClientProfileKycPanel";
import {
  ClientProfileAuditPanel,
  ClientProfileCommercialsPanel,
  ClientProfileContactsPanel,
  ClientProfileContractsPanel,
  ClientProfileFinancePanel,
  ClientProfileVaultPanel,
  ClientProfileWarehousesPanel,
} from "@/features/clients/components/desktop/ClientProfileDataPanels";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import type { ClientManagementBundle, ClientProfileTab } from "@/features/clients/types/clientManagement.types";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { computeKycScore } from "@/features/clients/utils/clientManagement.util";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import {
  PartyProfileCompactChrome,
  publicEntityToChromeModel,
} from "@/features/party/components/PartyProfileCompactChrome";
import {
  ProfileHubChatActionIcon,
  ProfileHubHeaderIconButton,
} from "@/features/party/components/ProfileHubAnimatedIcons";
import { clientToPublicEntity } from "@/features/public-profile/mappers";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import {
  ProfileHubChatSplitLayout,
  profileHubChatPartnerFromParty,
} from "@/features/network/components/desktop/ProfileHubChatSplitLayout";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ClientProfileHubHero } from "@/features/clients/components/desktop/ClientProfileHubHero";
import { EditClientModal } from "@/features/clients/components/EditClientModal";
import { getLinkedOrgProfile, updateClient } from "@/features/clients/services/clients.service";
import { METRONIC } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";

type SidebarProps = {
  client: ClientRow;
};

function ClientPartyDetailSidebar({ client }: SidebarProps) {
  if (!client.phone && !client.email && !client.contact_person) {
    return null;
  }

  return (
    <View style={cpStyles.sidebarCard}>
      <Text style={cpStyles.sidebarCardTitle}>Contact</Text>
      {client.contact_person ? (
        <View style={cpStyles.sidebarKvRow}>
          <Text style={cpStyles.sidebarKvLabel}>Name</Text>
          <Text style={cpStyles.sidebarKvValue} numberOfLines={1}>{client.contact_person}</Text>
        </View>
      ) : null}
      {client.phone ? (
        <Pressable style={cpStyles.sidebarKvRow} onPress={() => void Linking.openURL(`tel:${client.phone}`)}>
          <Text style={cpStyles.sidebarKvLabel}>Phone</Text>
          <Text style={[cpStyles.sidebarKvValue, { color: METRONIC.link }]} numberOfLines={1}>{client.phone}</Text>
        </Pressable>
      ) : null}
      {client.email ? (
        <Pressable style={[cpStyles.sidebarKvRow, { borderBottomWidth: 0 }]} onPress={() => void Linking.openURL(`mailto:${client.email}`)}>
          <Text style={cpStyles.sidebarKvLabel}>Email</Text>
          <Text style={[cpStyles.sidebarKvValue, { color: METRONIC.link }]} numberOfLines={1}>{client.email}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const TABS: { id: ClientProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "kyc", label: "KYC" },
  { id: "warehouses", label: "Warehouses" },
  { id: "contracts", label: "Contracts" },
  { id: "commercials", label: "Commercials" },
  { id: "finance", label: "Finance" },
  { id: "vault", label: "Document vault" },
  { id: "audit", label: "Audit log" },
];

type Props = {
  client: ClientRow;
  bundle: ClientManagementBundle;
  initialTab?: ClientProfileTab;
  onBack?: () => void;
  onRefresh?: () => void;
};

export function ClientProfileHub({
  client,
  bundle,
  initialTab = "overview",
  onBack,
  onRefresh,
}: Props) {
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
  const [tab, setTab] = useState<ClientProfileTab>(initialTab);
  const [chatOpen, setChatOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const orgId = String((bundle.client as Record<string, unknown>)?.organization_id ?? client.organization_id ?? "");
  const clientId = client.id;
  const kyc = computeKycScore(bundle.kyc_documents);
  const locationLabel =
    [bundle.client?.state, bundle.client?.country].filter(Boolean).join(", ") ||
    bundle.warehouses[0]?.city ||
    null;
  const isIntegrated =
    client.is_integrated ?? Boolean(client.linked_organization_id);
  const chatPartner = useMemo(
    () =>
      profileHubChatPartnerFromParty({
        linkedOrgId: client.linked_organization_id,
        name: client.name?.trim() || "Client",
        avatarUrl: client.avatar_url,
        avatarSeed: client.avatar_seed,
        role: "CLIENT",
        isIntegrated,
      }),
    [
      client.avatar_seed,
      client.avatar_url,
      client.linked_organization_id,
      client.name,
      isIntegrated,
    ],
  );

  const openIntegratedChat = () => {
    if (chatPartner) {
      setChatOpen(true);
      return;
    }
    const phoneDigits = String(client.phone ?? "").replace(/\D/g, "");
    if (phoneDigits.length >= 8) {
      Alert.alert(
        "Direct contact",
        "This client is not on Pulse chat yet. Call or text their registered number, or invite them to connect for in-app messaging.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Text",
            onPress: () => void Linking.openURL(`sms:${phoneDigits}`),
          },
          {
            text: "Call",
            onPress: () => void Linking.openURL(`tel:${phoneDigits}`),
          },
        ],
      );
      return;
    }
    Alert.alert(
      "Chat unavailable",
      "This client is not integrated on Pulse yet. Add a phone number or invite them to connect before using workspace chat.",
    );
  };

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const sharedProps = { bundle, orgId, clientId, onRefresh: onRefresh ?? (() => {}) };

  const panel = (() => {
    switch (tab) {
      case "overview":
        return (
          <ClientProfileOverviewPanel
            bundle={bundle}
            orgId={orgId}
            clientId={clientId}
            onRefresh={onRefresh}
            isIntegrated={isIntegrated}
            linkedOrgId={client.linked_organization_id}
            onImportFromProfile={isIntegrated && client.linked_organization_id ? async () => {
              const { error, profile } = await getLinkedOrgProfile(client.linked_organization_id!);
              if (error || !profile) return;
              const patch: Parameters<typeof updateClient>[2] = {
                organization_name: profile.organizationName || undefined,
                contact_person: profile.contactPerson || undefined,
                phone: profile.phone || undefined,
                email: profile.email || undefined,
              };
              if (profile.gstin && !client.gstin) patch.gstin = profile.gstin;
              if (profile.address && !client.address) patch.address = profile.address;
              await updateClient(orgId, clientId, patch);
              onRefresh?.();
            } : undefined}
          />
        );
      case "contacts":
        return <ClientProfileContactsPanel {...sharedProps} />;
      case "kyc":
        return (
          <ClientProfileKycPanel
            bundle={bundle}
            onUploadDoc={() =>
              Alert.alert("Upload KYC", "Document upload will connect to storage in the next step.")
            }
          />
        );
      case "warehouses":
        return <ClientProfileWarehousesPanel {...sharedProps} />;
      case "contracts":
        return <ClientProfileContractsPanel {...sharedProps} />;
      case "commercials":
        return <ClientProfileCommercialsPanel {...sharedProps} />;
      case "finance":
        return <ClientProfileFinancePanel {...sharedProps} />;
      case "vault":
        return <ClientProfileVaultPanel bundle={bundle} />;
      case "audit":
        return <ClientProfileAuditPanel bundle={bundle} />;
      default:
        return (
          <ClientProfileOverviewPanel
            bundle={bundle}
            orgId={orgId}
            clientId={clientId}
            onRefresh={onRefresh}
            isIntegrated={isIntegrated}
            linkedOrgId={client.linked_organization_id}
            onImportFromProfile={isIntegrated && client.linked_organization_id ? async () => {
              const { error, profile } = await getLinkedOrgProfile(client.linked_organization_id!);
              if (error || !profile) return;
              const patch: Parameters<typeof updateClient>[2] = {
                organization_name: profile.organizationName || undefined,
                contact_person: profile.contactPerson || undefined,
                phone: profile.phone || undefined,
                email: profile.email || undefined,
              };
              if (profile.gstin && !client.gstin) patch.gstin = profile.gstin;
              if (profile.address && !client.address) patch.address = profile.address;
              await updateClient(orgId, clientId, patch);
              onRefresh?.();
            } : undefined}
          />
        );
    }
  })();

  const stats = [
    { value: String(bundle.warehouses.length), label: "WAREHOUSES" },
    { value: String(bundle.agreements.length), label: "CONTRACTS" },
    { value: String(bundle.lane_rates.length), label: "LANE RATES" },
    { value: String(bundle.contacts.length), label: "CONTACTS" },
  ];

  const chromeModel = useMemo(
    () => publicEntityToChromeModel(clientToPublicEntity(client)),
    [client],
  );

  const chatActionButton = (
    <ProfileHubHeaderIconButton
      onPress={() => (chatOpen ? setChatOpen(false) : openIntegratedChat())}
      accessibilityLabel={chatOpen ? "Close chat" : "Open chat"}
    >
      <ProfileHubChatActionIcon size={36} active={chatOpen} />
    </ProfileHubHeaderIconButton>
  );

  const hubScroll = (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        compact && mobile.scrollContentCompact,
        { paddingBottom: layoutInsets.scrollBottomPadding(compact ? 16 : 24) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {compact ? (
        <PartyProfileCompactChrome
          model={chromeModel}
          onBack={onBack}
          chatAction={chatActionButton}
        />
      ) : (
        <ClientProfileHubHero
          client={client}
          locationLabel={locationLabel}
          kycScore={kyc.score}
          stats={stats}
          onBack={onBack}
        />
      )}

      <View style={[styles.tabBar, compact && mobile.tabBarCompact]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={compact ? mobile.tabScrollCompact : styles.tabScroll}
          contentContainerStyle={compact ? mobile.tabScrollContentCompact : styles.tabScrollContent}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                style={[
                  styles.tabBtn,
                  compact && mobile.tabBtnCompact,
                  active && styles.tabBtnActive,
                ]}
                onPress={() => setTab(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.tabText,
                    compact && mobile.tabTextCompact,
                    active && styles.tabTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!compact ? (
          <View style={styles.tabActions}>
            <ProfileHubHeaderIconButton
              onPress={() => (chatOpen ? setChatOpen(false) : openIntegratedChat())}
              accessibilityLabel={chatOpen ? "Close chat" : "Open chat"}
            >
              <ProfileHubChatActionIcon size={36} active={chatOpen} />
            </ProfileHubHeaderIconButton>
          </View>
        ) : null}
      </View>

      {compact ? panel : (
        <View style={cpStyles.hubBodyRow}>
          {(client.phone || client.email || client.contact_person) ? (
            <View style={cpStyles.hubSidebarCol}>
              <ClientPartyDetailSidebar client={client} />
            </View>
          ) : null}
          <View style={cpStyles.hubMainCol}>
            {panel}
          </View>
        </View>
      )}
    </ScrollView>
  );

  return (
    <>
      <ProfileHubChatSplitLayout
        chatOpen={chatOpen}
        onCloseChat={() => setChatOpen(false)}
        partner={chatPartner}
      >
        {hubScroll}
      </ProfileHubChatSplitLayout>
      <EditClientModal
        visible={editOpen}
        client={client}
        onClose={() => setEditOpen(false)}
        onSave={async (patch) => {
          await updateClient(orgId, clientId, patch);
          setEditOpen(false);
          onRefresh?.();
        }}
        onSyncLatest={isIntegrated && client.linked_organization_id ? async () => {
          const { error, profile } = await getLinkedOrgProfile(client.linked_organization_id!);
          if (error || !profile) return undefined;
          const patch: Parameters<typeof updateClient>[2] = {
            organization_name: profile.organizationName || undefined,
            contact_person: profile.contactPerson || undefined,
            phone: profile.phone || undefined,
            email: profile.email || undefined,
          };
          if (profile.gstin && !client.gstin) patch.gstin = profile.gstin;
          if (profile.address && !client.address) patch.address = profile.address;
          await updateClient(orgId, clientId, patch);
          onRefresh?.();
          return {
            companyName: profile.organizationName,
            contactPerson: profile.contactPerson,
            phone: profile.phone,
            email: profile.email,
            gstin: profile.gstin ?? undefined,
            address: profile.address ?? undefined,
          };
        } : undefined}
      />
    </>
  );
}
