/**
 * Client Profile Hub — Metronic tabbed layout (Overview, KYC, Warehouses, Contracts, etc.)
 */
import Theme from "@/constants/Theme";
import { ClientProfileHubHero } from "@/features/clients/components/desktop/ClientProfileHubHero";
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
import { ROUTES } from "@/lib/routes";
import { MessageSquare, MoreHorizontal } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

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
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<ClientProfileTab>(initialTab);
  const kyc = computeKycScore(bundle.kyc_documents);
  const locationLabel =
    [bundle.client?.state, bundle.client?.country].filter(Boolean).join(", ") ||
    bundle.warehouses[0]?.city ||
    null;

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const panel = (() => {
    switch (tab) {
      case "overview":
        return <ClientProfileOverviewPanel bundle={bundle} />;
      case "contacts":
        return <ClientProfileContactsPanel bundle={bundle} />;
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
        return <ClientProfileWarehousesPanel bundle={bundle} />;
      case "contracts":
        return <ClientProfileContractsPanel bundle={bundle} />;
      case "commercials":
        return <ClientProfileCommercialsPanel bundle={bundle} />;
      case "finance":
        return <ClientProfileFinancePanel bundle={bundle} />;
      case "vault":
        return <ClientProfileVaultPanel bundle={bundle} />;
      case "audit":
        return <ClientProfileAuditPanel bundle={bundle} />;
      default:
        return <ClientProfileOverviewPanel bundle={bundle} />;
    }
  })();

  const stats = [
    { value: String(bundle.warehouses.length), label: "WAREHOUSES" },
    { value: String(bundle.agreements.length), label: "CONTRACTS" },
    { value: String(bundle.lane_rates.length), label: "LANE RATES" },
    { value: String(bundle.contacts.length), label: "CONTACTS" },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <ClientProfileHubHero
        client={client}
        locationLabel={locationLabel}
        kycScore={kyc.score}
        onBack={onBack}
      />

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
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.tabActions}>
          <Pressable
            style={[styles.tabActionBtn, styles.tabActionBtnPrimary]}
            onPress={() => router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])}
          >
            <Text style={[styles.tabActionBtnText, styles.tabActionBtnTextOn]}>Create trip</Text>
          </Pressable>
          <Pressable
            style={styles.tabActionBtn}
            onPress={() => router.push(ROUTES.clientDetail(client.id) as Parameters<typeof router.push>[0])}
          >
            <MessageSquare size={14} color={Theme.textSecondary} strokeWidth={2} />
            <Text style={styles.tabActionBtnText}>Ledger</Text>
          </Pressable>
          <Pressable style={styles.tabActionBtn} hitSlop={8}>
            <MoreHorizontal size={16} color={Theme.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <View style={cpStyles.metricsWrap}>
        <View style={styles.statsBar}>
          {stats.map((s, idx) => (
            <View
              key={s.label}
              style={[
                styles.statCell,
                cpStyles.statCellCompact,
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
}
