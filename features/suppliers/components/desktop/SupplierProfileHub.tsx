/**
 * Supplier Profile Hub — Metronic tabbed layout mirroring ClientProfileHub.
 * Tabs: Overview · KYC · Compliance · Contracts · Fleet · Drivers ·
 *        Warehouses · Performance · Finance · Timeline
 */
import Theme from "@/constants/Theme";
import { SupplierProfileHubHero } from "@/features/suppliers/components/desktop/SupplierProfileHubHero";
import {
  SupplierProfileCompliancePanel,
  SupplierProfileContractsPanel,
  SupplierProfileDriversPanel,
  SupplierProfileFinancePanel,
  SupplierProfileFleetPanel,
  SupplierProfileKycPanel,
  SupplierProfileOverviewPanel,
  SupplierProfilePerformancePanel,
  SupplierProfileTimelinePanel,
  SupplierProfileWarehousesPanel,
} from "@/features/suppliers/components/desktop/SupplierProfilePanels";
import {
  METRONIC,
  hubStyles as styles,
} from "@/features/suppliers/components/desktop/supplierProfileHub.styles";
import type {
  SupplierManagementBundle,
  SupplierProfileTab,
  SupplierKycDocType,
} from "@/features/suppliers/types/supplierManagement.types";
import {
  ProfileHubChatSplitLayout,
  profileHubChatPartnerFromParty,
} from "@/features/network/components/desktop/ProfileHubChatSplitLayout";
import { networkDesktopChatStyles as chatStyles } from "@/features/network/components/desktop/networkDesktopChat.styles";
import { ROUTES } from "@/lib/routes";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { MessageSquare, MoreHorizontal, Plus } from "lucide-react-native";

const TABS: { id: SupplierProfileTab; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "kyc",         label: "KYC" },
  { id: "compliance",  label: "Compliance" },
  { id: "contracts",   label: "Contracts" },
  { id: "fleet",       label: "Fleet" },
  { id: "drivers",     label: "Drivers" },
  { id: "warehouses",  label: "Warehouses" },
  { id: "performance", label: "Performance" },
  { id: "finance",     label: "Finance" },
  { id: "timeline",    label: "Timeline" },
];

type Props = {
  bundle: SupplierManagementBundle;
  initialTab?: SupplierProfileTab;
  onBack?: () => void;
  onRefresh?: () => void;
};

export function SupplierProfileHub({
  bundle,
  initialTab = "overview",
  onBack,
  onRefresh,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<SupplierProfileTab>(initialTab);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const { supplier, trips, kyc_documents, performance } = bundle;
  const displayName =
    (supplier.name || supplier.company_name || supplier.contact_person || "Supplier").trim();
  const isIntegrated =
    supplier.supplier_type === "integrated" || Boolean(supplier.linked_organization_id);
  const chatPartner = useMemo(
    () =>
      profileHubChatPartnerFromParty({
        linkedOrgId: supplier.linked_organization_id,
        name: displayName,
        avatarUrl: supplier.avatar_url,
        avatarSeed: supplier.avatar_seed,
        role: "SUPPLIER",
        isIntegrated,
      }),
    [
      displayName,
      isIntegrated,
      supplier.avatar_seed,
      supplier.avatar_url,
      supplier.linked_organization_id,
    ],
  );

  const openIntegratedChat = () => {
    if (chatPartner) {
      setChatOpen(true);
      return;
    }
    const phoneDigits = String(supplier.phone ?? supplier.contact_phone ?? "").replace(/\D/g, "");
    if (phoneDigits.length >= 8) {
      Alert.alert(
        "Direct contact",
        "This supplier is not on Pulse chat yet. Call or text their registered number, or invite them to connect for in-app messaging.",
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
      "This supplier is not integrated on Pulse yet. Add a phone number or invite them to connect before using workspace chat.",
    );
  };
  const totalTrips = trips.length;
  const totalPayable = bundle.transactions
    .filter((tx) => (tx.amount_out ?? 0) > (tx.amount_in ?? 0))
    .reduce((s, tx) => s + ((tx.amount_out ?? 0) - (tx.amount_in ?? 0)), 0);
  const kycTotal = kyc_documents.length;
  const kycVerified = kyc_documents.filter((d) => d.status === "verified").length;
  const kycScore = kycTotal > 0 ? Math.round((kycVerified / kycTotal) * 100) : 0;
  const perfScore = performance?.overall_score ?? 0;

  const handleUploadDoc = (type: SupplierKycDocType) => {
    Alert.alert(
      "Upload document",
      `Upload ${type.replace(/_/g, " ")} — document storage integration coming soon.`,
      [{ text: "OK" }],
    );
  };

  const panel = (() => {
    switch (tab) {
      case "overview":
        return <SupplierProfileOverviewPanel bundle={bundle} />;
      case "kyc":
        return <SupplierProfileKycPanel bundle={bundle} onUploadDoc={handleUploadDoc} />;
      case "compliance":
        return <SupplierProfileCompliancePanel bundle={bundle} />;
      case "contracts":
        return <SupplierProfileContractsPanel bundle={bundle} />;
      case "fleet":
        return <SupplierProfileFleetPanel bundle={bundle} />;
      case "drivers":
        return <SupplierProfileDriversPanel bundle={bundle} />;
      case "warehouses":
        return <SupplierProfileWarehousesPanel bundle={bundle} />;
      case "performance":
        return <SupplierProfilePerformancePanel bundle={bundle} />;
      case "finance":
        return <SupplierProfileFinancePanel bundle={bundle} />;
      case "timeline":
        return <SupplierProfileTimelinePanel bundle={bundle} />;
      default:
        return <SupplierProfileOverviewPanel bundle={bundle} />;
    }
  })();

  const stats = [
    { value: String(trips.length), label: "TRIPS" },
    { value: String(bundle.contracts.length), label: "CONTRACTS" },
    { value: String(bundle.fleet.length), label: "FLEET" },
    { value: String(bundle.drivers.length), label: "DRIVERS" },
  ];

  const hubScroll = (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <SupplierProfileHubHero
        supplier={supplier}
        totalTrips={totalTrips}
        totalPayable={totalPayable}
        kycScore={kycScore}
        performanceScore={perfScore}
        onBack={onBack}
      />

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabScrollContent}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setTab(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.tabActions}>
          <Pressable
            style={[styles.tabActionBtn, styles.tabActionBtnPrimary]}
            onPress={() => router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])}
            accessibilityRole="button"
            accessibilityLabel="Create trip"
          >
            <Plus size={14} color={Theme.textOnPrimary} strokeWidth={2.5} />
            <Text style={[styles.tabActionBtnText, styles.tabActionBtnTextOn]}>
              Create trip
            </Text>
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
              color={chatOpen ? Theme.primary : METRONIC.text}
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
            hitSlop={8}
          >
            <Text style={styles.tabActionBtnText}>Ledger</Text>
          </Pressable>
          <Pressable
            style={styles.tabActionIconBtn}
            onPress={() =>
              Alert.alert(
                "Supplier options",
                "Edit, invite to platform, or export supplier data.",
                [
                  { text: "Edit supplier", onPress: () => {} },
                  { text: "Export data", onPress: () => {} },
                  { text: "Cancel", style: "cancel" },
                ],
              )
            }
            hitSlop={8}
          >
            <MoreHorizontal size={16} color={METRONIC.text} />
          </Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: 32, paddingTop: 12, paddingBottom: 0, backgroundColor: "#ffffff" }}>
        <View style={styles.statsBar}>
          {stats.map((s, idx) => (
            <View
              key={s.label}
              style={[
                styles.statCell,
                idx === stats.length - 1 && styles.statCellLast,
              ]}
            >
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {panel}
    </ScrollView>
  );

  return (
    <ProfileHubChatSplitLayout
      chatOpen={chatOpen}
      onCloseChat={() => setChatOpen(false)}
      partner={chatPartner}
    >
      {hubScroll}
    </ProfileHubChatSplitLayout>
  );
}
