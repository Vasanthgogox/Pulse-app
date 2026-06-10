/**
 * Supplier Profile Hub — Metronic tabbed layout mirroring ClientProfileHub.
 * Tabs: Overview · KYC · Compliance · Contracts · Fleet · Drivers ·
 *        Warehouses · Performance · Finance · Timeline
 */
import Theme from "@/constants/Theme";
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
  supplierStyles,
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
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ROUTES } from "@/lib/routes";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ArrowLeft, MessageSquare, MoreHorizontal, Plus } from "lucide-react-native";

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
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
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

  const orgId = supplier.organization_id;
  const sharedProps = { bundle, orgId, onRefresh };

  const panel = (() => {
    switch (tab) {
      case "overview":
        return <SupplierProfileOverviewPanel bundle={bundle} />;
      case "kyc":
        return <SupplierProfileKycPanel bundle={bundle} onUploadDoc={handleUploadDoc} />;
      case "compliance":
        return <SupplierProfileCompliancePanel bundle={bundle} />;
      case "contracts":
        return <SupplierProfileContractsPanel {...sharedProps} />;
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
              <Pressable onPress={onBack} style={mobile.chromeBackBtn} accessibilityRole="button" accessibilityLabel="Go back">
                <ArrowLeft size={20} color={METRONIC.text} strokeWidth={2.2} />
              </Pressable>
            ) : null}
            <View style={mobile.chromeTitleBlock}>
              <Text style={mobile.chromeTitle} numberOfLines={2}>{displayName}</Text>
              <Text style={mobile.chromeSubtitle} numberOfLines={1}>
                {[supplier.contact_person, supplier.phone].filter(Boolean).join(" · ") || "Supplier profile"}
              </Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={mobile.chromePillsScroll} contentContainerStyle={mobile.chromePillsContent}>
            <View style={mobile.chromePill}><Text style={mobile.chromePillText}>SUPPLIER</Text></View>
            <View style={mobile.chromePill}>
              <Text style={mobile.chromePillText}>{isIntegrated ? "INTEGRATED" : (supplier.supplier_type ?? "offline").toUpperCase()}</Text>
            </View>
            <View style={[mobile.chromePill, mobile.chromePillWarn]}>
              <Text style={[mobile.chromePillText, mobile.chromePillTextWarn]}>KYC {kycScore}%</Text>
            </View>
            <View style={mobile.chromePill}><Text style={mobile.chromePillText}>SCORE {perfScore}</Text></View>
          </ScrollView>
        </View>
      ) : (
        <View style={supplierStyles.backBar}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.tabActionBtn} hitSlop={8}>
              <ArrowLeft size={16} color={METRONIC.text} strokeWidth={2.2} />
              <Text style={supplierStyles.backBarText}>Back</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={supplierStyles.hubChromeTitle} numberOfLines={1}>{displayName.toUpperCase()}</Text>
            <View style={supplierStyles.hubChromePills}>
              <View style={supplierStyles.hubChromePill}><Text style={supplierStyles.hubChromePillText}>SUPPLIER</Text></View>
              <View style={supplierStyles.hubChromePill}>
                <Text style={supplierStyles.hubChromePillText}>{isIntegrated ? "INTEGRATED" : (supplier.supplier_type ?? "offline").toUpperCase()}</Text>
              </View>
              <View style={supplierStyles.hubChromePill}><Text style={supplierStyles.hubChromePillText}>KYC {kycScore}%</Text></View>
              <View style={supplierStyles.hubChromePill}><Text style={supplierStyles.hubChromePillText}>SCORE {perfScore}</Text></View>
            </View>
          </View>
        </View>
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
                style={[styles.tabBtn, compact && mobile.tabBtnCompact, active && styles.tabBtnActive]}
                onPress={() => setTab(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, compact && mobile.tabTextCompact, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {compact ? (
          <View style={mobile.tabActionsRow}>
            <Pressable style={mobile.tabActionPrimary} onPress={() => router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])}>
              <Plus size={16} color={Theme.textOnPrimary} strokeWidth={2.5} />
              <Text style={mobile.tabActionPrimaryText}>Create trip</Text>
            </Pressable>
            <Pressable style={[mobile.tabActionIcon, chatOpen && mobile.tabActionIconActive]} onPress={() => (chatOpen ? setChatOpen(false) : openIntegratedChat())}>
              <MessageSquare size={18} color={chatOpen ? Theme.primary : METRONIC.text} strokeWidth={2} />
            </Pressable>
            <Pressable style={mobile.tabActionIcon} onPress={() => setTab("finance")}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: METRONIC.text }}>₹</Text>
            </Pressable>
            <Pressable style={mobile.tabActionIcon} hitSlop={8}>
              <MoreHorizontal size={18} color={METRONIC.text} strokeWidth={2} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.tabActions}>
            <Pressable style={[styles.tabActionBtn, styles.tabActionBtnPrimary]} onPress={() => router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])}>
              <Plus size={14} color={Theme.textOnPrimary} strokeWidth={2.5} />
              <Text style={[styles.tabActionBtnText, styles.tabActionBtnTextOn]}>Create trip</Text>
            </Pressable>
            <Pressable style={[styles.tabActionBtn, chatOpen && chatStyles.tabActionIconBtnActive]} onPress={() => (chatOpen ? setChatOpen(false) : openIntegratedChat())}>
              <MessageSquare size={14} color={chatOpen ? Theme.primary : METRONIC.text} strokeWidth={2} />
              <Text style={[styles.tabActionBtnText, chatOpen && { color: Theme.primary, fontWeight: "700" }]}>Chat</Text>
            </Pressable>
            <Pressable style={styles.tabActionBtn} onPress={() => setTab("finance")} hitSlop={8}>
              <Text style={styles.tabActionBtnText}>Ledger</Text>
            </Pressable>
            <Pressable style={styles.tabActionIconBtn} onPress={() => Alert.alert("Supplier options", "Edit, invite to platform, or export supplier data.", [{ text: "Edit supplier", onPress: () => {} }, { text: "Export data", onPress: () => {} }, { text: "Cancel", style: "cancel" }])} hitSlop={8}>
              <MoreHorizontal size={16} color={METRONIC.text} />
            </Pressable>
          </View>
        )}
      </View>

      <View style={[compact ? mobile.metricsWrapCompact : { paddingHorizontal: 32, paddingTop: 12, paddingBottom: 0, backgroundColor: "#ffffff" }]}>
        <View style={[styles.statsBar, compact && mobile.statsBarGrid]}>
          {stats.map((s, idx) => (
            <View
              key={s.label}
              style={[
                styles.statCell,
                !compact && idx === stats.length - 1 && styles.statCellLast,
                compact && mobile.statCellGrid,
                statCellCompactStyle(idx),
              ]}
            >
              <Text style={[styles.statValue, compact && mobile.statValueCompact]}>{s.value}</Text>
              <Text style={[styles.statLabel, compact && mobile.statLabelCompact]}>{s.label}</Text>
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
