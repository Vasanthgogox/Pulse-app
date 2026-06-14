/**
 * Client Profile Hub — Metronic tabbed layout (Overview, KYC, Warehouses, Contracts, etc.)
 */
import Theme from "@/constants/Theme";
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
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import {
  ProfileHubChatSplitLayout,
  profileHubChatPartnerFromParty,
} from "@/features/network/components/desktop/ProfileHubChatSplitLayout";
import { networkDesktopChatStyles as chatStyles } from "@/features/network/components/desktop/networkDesktopChat.styles";
import { METRONIC } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ROUTES } from "@/lib/routes";
import { ClientProfileHubHero } from "@/features/clients/components/desktop/ClientProfileHubHero";
import { EditClientModal } from "@/features/clients/components/EditClientModal";
import { updateClient } from "@/features/clients/services/clients.service";
import { ArrowLeft, Building2, FileText, Mail, MapPin, MessageSquare, MoreHorizontal, Phone, Plus, User } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

type SidebarProps = {
  client: ClientRow;
  bundle: ClientManagementBundle;
  kycScore: number;
  onTabChange: (tab: ClientProfileTab) => void;
  onEdit: () => void;
};

function ClientPartyDetailSidebar({ client, bundle, kycScore, onTabChange, onEdit }: SidebarProps) {
  const router = useRouter();
  const isIntegrated = client.is_integrated ?? Boolean(client.linked_organization_id);
  const locationLabel =
    [bundle.client?.state, bundle.client?.country].filter(Boolean).join(", ") ||
    bundle.warehouses[0]?.city || null;
  const industry = (client as Record<string, unknown>).industry as string | null | undefined;
  const clientStatus = (client as Record<string, unknown>).client_status as string | null | undefined;
  const fp = bundle.finance_profile;

  const statusBg = clientStatus === "inactive" ? "#FFF8DD" : clientStatus === "prospect" ? "#EEF6FF" : "#E8FFF3";
  const statusColor = clientStatus === "inactive" ? "#F6C000" : clientStatus === "prospect" ? "#3E97FF" : "#50CD89";
  const kycBg = kycScore >= 80 ? "#E8FFF3" : kycScore >= 50 ? "#FFF8DD" : "#FFF1F2";
  const kycColor = kycScore >= 80 ? "#50CD89" : kycScore >= 50 ? "#F6C000" : "#F1416C";

  return (
    <View>
      {/* Highlights — KV label-value rows */}
      <View style={cpStyles.sidebarCard}>
        <Text style={cpStyles.sidebarCardTitle}>Highlights</Text>

        {clientStatus ? (
          <View style={cpStyles.sidebarKvRow}>
            <Text style={cpStyles.sidebarKvLabel}>Status</Text>
            <View style={[cpStyles.sidebarBadge, { backgroundColor: statusBg }]}>
              <Text style={[cpStyles.sidebarBadgeText, { color: statusColor }]}>{clientStatus.toUpperCase()}</Text>
            </View>
          </View>
        ) : null}

        <View style={cpStyles.sidebarKvRow}>
          <Text style={cpStyles.sidebarKvLabel}>In App</Text>
          <View style={[cpStyles.sidebarBadge, { backgroundColor: isIntegrated ? "#E8FFF3" : "#F1F1F4" }]}>
            <Text style={[cpStyles.sidebarBadgeText, { color: isIntegrated ? "#50CD89" : METRONIC.subtle }]}>
              {isIntegrated ? "INTEGRATED" : "NOT IN APP"}
            </Text>
          </View>
        </View>

        <View style={cpStyles.sidebarKvRow}>
          <Text style={cpStyles.sidebarKvLabel}>KYC</Text>
          <View style={[cpStyles.sidebarBadge, { backgroundColor: kycBg }]}>
            <Text style={[cpStyles.sidebarBadgeText, { color: kycColor }]}>{kycScore}%</Text>
          </View>
        </View>

        {locationLabel ? (
          <View style={cpStyles.sidebarKvRow}>
            <Text style={cpStyles.sidebarKvLabel}>Location</Text>
            <Text style={cpStyles.sidebarKvValue} numberOfLines={1}>{locationLabel}</Text>
          </View>
        ) : null}

        {industry ? (
          <View style={cpStyles.sidebarKvRow}>
            <Text style={cpStyles.sidebarKvLabel}>Sector</Text>
            <Text style={cpStyles.sidebarKvValue} numberOfLines={1}>{industry}</Text>
          </View>
        ) : null}

        {client.gstin ? (
          <View style={[cpStyles.sidebarKvRow, { borderBottomWidth: 0 }]}>
            <Text style={cpStyles.sidebarKvLabel}>GSTIN</Text>
            <Text style={cpStyles.sidebarKvValue} numberOfLines={1}>{client.gstin}</Text>
          </View>
        ) : null}
      </View>

      {/* Commercial — payment terms from finance profile */}
      {fp ? (
        <View style={cpStyles.sidebarCard}>
          <Text style={cpStyles.sidebarCardTitle}>Commercial</Text>

          {fp.credit_days ? (
            <View style={cpStyles.sidebarKvRow}>
              <Text style={cpStyles.sidebarKvLabel}>Credit days</Text>
              <Text style={cpStyles.sidebarKvValue}>{fp.credit_days}d</Text>
            </View>
          ) : null}

          {fp.invoice_frequency ? (
            <View style={cpStyles.sidebarKvRow}>
              <Text style={cpStyles.sidebarKvLabel}>Invoice freq.</Text>
              <Text style={cpStyles.sidebarKvValue} numberOfLines={1}>{fp.invoice_frequency}</Text>
            </View>
          ) : null}

          {(fp as Record<string, unknown>).payment_terms ? (
            <View style={[cpStyles.sidebarKvRow, { borderBottomWidth: 0 }]}>
              <Text style={cpStyles.sidebarKvLabel}>Payment</Text>
              <Text style={cpStyles.sidebarKvValue} numberOfLines={1}>
                {String((fp as Record<string, unknown>).payment_terms)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Actions */}
      <View style={cpStyles.sidebarCard}>
        <Text style={cpStyles.sidebarCardTitle}>Actions</Text>
        <Pressable
          style={[cpStyles.sidebarActionBtn, cpStyles.sidebarActionBtnPrimary]}
          onPress={() => router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])}
          accessibilityRole="button"
        >
          <Plus size={13} color="#fff" strokeWidth={2.5} />
          <Text style={[cpStyles.sidebarActionBtnText, cpStyles.sidebarActionBtnTextPrimary]}>Create trip</Text>
        </Pressable>
        <Pressable style={cpStyles.sidebarActionBtn} onPress={() => onTabChange("contracts")} accessibilityRole="button">
          <FileText size={13} color={METRONIC.text} strokeWidth={2} />
          <Text style={cpStyles.sidebarActionBtnText}>Contracts ({bundle.agreements.length})</Text>
        </Pressable>
        <Pressable style={cpStyles.sidebarActionBtn} onPress={() => onTabChange("finance")} accessibilityRole="button">
          <Text style={[cpStyles.sidebarActionBtnText, { fontSize: 13 }]}>₹</Text>
          <Text style={cpStyles.sidebarActionBtnText}>Ledger</Text>
        </Pressable>
        <Pressable style={[cpStyles.sidebarActionBtn, { marginBottom: 0 }]} onPress={onEdit} accessibilityRole="button">
          <Text style={cpStyles.sidebarActionBtnText}>Edit Profile</Text>
        </Pressable>
      </View>

      {/* Contact */}
      {(client.phone || client.email || client.contact_person) ? (
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
  const router = useRouter();
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
  const contactPerson = client.contact_person?.trim();
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

  const statCellCompactStyle = (idx: number) => {
    if (!compact) return undefined;
    if (idx === 1) return mobile.statCellGridTopRight;
    if (idx === 2) return mobile.statCellGridBottomLeft;
    if (idx === 3) return mobile.statCellGridBottomRight;
    return undefined;
  };

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
        <View style={mobile.pageChrome}>
          <View style={mobile.chromeTopRow}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                style={mobile.chromeBackBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <ArrowLeft size={20} color={METRONIC.text} strokeWidth={2.2} />
              </Pressable>
            ) : null}
            <View style={mobile.chromeTitleBlock}>
              <Text style={mobile.chromeTitle} numberOfLines={2}>
                {client.name?.trim() || "Client"}
              </Text>
              {(contactPerson || locationLabel) ? (
                <Text style={mobile.chromeSubtitle} numberOfLines={1}>
                  {[contactPerson, locationLabel].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={mobile.chromePillsScroll}
            contentContainerStyle={mobile.chromePillsContent}
          >
            <View style={mobile.chromePill}>
              <Text style={mobile.chromePillText}>CLIENT</Text>
            </View>
            <View style={mobile.chromePill}>
              <Text style={mobile.chromePillText}>
                {isIntegrated ? "INTEGRATED" : "NOT IN APP"}
              </Text>
            </View>
            <View style={[mobile.chromePill, mobile.chromePillWarn]}>
              <Text style={[mobile.chromePillText, mobile.chromePillTextWarn]}>
                KYC {kyc.score}%
              </Text>
            </View>
          </ScrollView>
        </View>
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

        {compact ? (
          <View style={mobile.tabActionsRow}>
            <Pressable
              style={mobile.tabActionPrimary}
              onPress={() => router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])}
              accessibilityRole="button"
              accessibilityLabel="Create trip"
            >
              <Plus size={16} color={Theme.textOnPrimary} strokeWidth={2.5} />
              <Text style={mobile.tabActionPrimaryText}>Create trip</Text>
            </Pressable>
            <Pressable
              style={[
                mobile.tabActionIcon,
                chatOpen && mobile.tabActionIconActive,
              ]}
              onPress={() => (chatOpen ? setChatOpen(false) : openIntegratedChat())}
              accessibilityRole="button"
              accessibilityLabel={chatOpen ? "Close chat" : "Open chat"}
            >
              <MessageSquare
                size={18}
                color={chatOpen ? Theme.primary : METRONIC.text}
                strokeWidth={2}
              />
            </Pressable>
            <Pressable
              style={mobile.tabActionIcon}
              onPress={() => setTab("finance")}
              accessibilityRole="button"
              accessibilityLabel="Ledger"
            >
              <Text style={{ fontSize: 11, fontWeight: "800", color: METRONIC.text }}>₹</Text>
            </Pressable>
            <Pressable style={mobile.tabActionIcon} hitSlop={8}>
              <MoreHorizontal size={18} color={METRONIC.text} strokeWidth={2} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.tabActions}>
            <Pressable
              style={[styles.tabActionBtn, styles.tabActionBtnPrimary]}
              onPress={() => router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])}
            >
              <Text style={[styles.tabActionBtnText, styles.tabActionBtnTextOn]}>Create trip</Text>
            </Pressable>
            <Pressable
              style={[
                styles.tabActionBtn,
                chatOpen && chatStyles.tabActionIconBtnActive,
              ]}
              onPress={() => (chatOpen ? setChatOpen(false) : openIntegratedChat())}
              accessibilityRole="button"
              accessibilityLabel={chatOpen ? "Close chat" : "Open chat"}
            >
              <MessageSquare
                size={14}
                color={chatOpen ? Theme.primary : Theme.textSecondary}
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.tabActionBtnText,
                  chatOpen && { color: Theme.primary, fontWeight: "700" },
                ]}
              >
                Chat
              </Text>
            </Pressable>
            <Pressable
              style={styles.tabActionBtn}
              onPress={() => setTab("finance")}
            >
              <Text style={styles.tabActionBtnText}>Ledger</Text>
            </Pressable>
            <Pressable style={styles.tabActionBtn} hitSlop={8}>
              <MoreHorizontal size={16} color={Theme.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
        )}
      </View>

      {compact ? (
        <View style={[cpStyles.metricsWrap, mobile.metricsWrapCompact]}>
          <View style={[styles.statsBar, mobile.statsBarGrid]}>
            {stats.map((s, idx) => (
              <View
                key={s.label}
                style={[styles.statCell, mobile.statCellGrid, statCellCompactStyle(idx)]}
              >
                <Text style={[styles.statValue, mobile.statValueCompact]}>{s.value}</Text>
                <Text style={[styles.statLabel, mobile.statLabelCompact]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {compact ? panel : (
        <View style={cpStyles.hubBodyRow}>
          <View style={cpStyles.hubSidebarCol}>
            <ClientPartyDetailSidebar
              client={client}
              bundle={bundle}
              kycScore={kyc.score}
              onTabChange={setTab}
              onEdit={() => setEditOpen(true)}
            />
          </View>
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
      />
    </>
  );
}
