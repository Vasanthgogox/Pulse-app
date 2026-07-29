/**
 * Vehicle profile hub — Counterparty-style chrome; existing Overview / Documents / Finance content.
 */
import Theme from "@/constants/Theme";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { partnerProfileDashboardStyles as party } from "@/features/drivers/components/partnerProfileDashboard.styles";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { VehicleProfileOverviewPanel } from "@/features/vehicles/components/desktop/VehicleProfileOverviewPanel";
import { VehicleDocumentsSection } from "@/features/vehicles/components/VehicleDocumentsSection";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import { useLayoutInsets } from "@/lib/layoutInsets";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Wallet } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

type VehicleProfileTab = "overview" | "documents" | "finance";

const TABS: { id: VehicleProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "finance", label: "Finance · Statement" },
];

type Props = {
  vehicle: VehicleRow;
  tripCount: number;
  onBack?: () => void;
  organizationId?: string | null;
  canEditDocuments?: boolean;
  onDocumentsUpdated?: (docs: VehicleDocuments) => void;
};

export function VehicleProfileHub({
  vehicle,
  tripCount,
  onBack,
  organizationId,
  canEditDocuments = false,
  onDocumentsUpdated,
}: Props) {
  const router = useRouter();
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
  const [tab, setTab] = useState<VehicleProfileTab>("overview");
  const docs = vehicle.documents;

  const panel =
    tab === "overview" ? (
      <VehicleProfileOverviewPanel vehicle={vehicle} tripCount={tripCount} />
    ) : tab === "documents" ? (
      organizationId && canEditDocuments && onDocumentsUpdated ? (
        <VehicleDocumentsSection
          organizationId={organizationId}
          vehicleId={vehicle.id}
          documents={docs}
          onDocumentsUpdated={onDocumentsUpdated}
        />
      ) : (
        <View style={[styles.card, compact && mobile.cardCompact]}>
          <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
            Compliance documents
          </Text>
          <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
            RC: {docs?.rc?.expiryDate ?? "—"}
            {"\n"}Insurance: {docs?.insurance?.expiryDate ?? "—"}
            {"\n"}Fitness: {docs?.fitness?.expiryDate ?? "—"}
            {"\n"}PUC: {docs?.pollution?.expiryDate ?? "—"}
          </Text>
        </View>
      )
    ) : (
      <View style={[styles.card, compact && mobile.cardCompact]}>
        <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
          Finance · Statement
        </Text>
        <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
          View vehicle operations ledger, fuel entries, and trip-linked costs.
        </Text>
        <Pressable
          style={[
            cpStyles.quickActionBtn,
            cpStyles.quickActionBtnPrimary,
            { alignSelf: "flex-start", marginTop: 12 },
          ]}
          onPress={() =>
            router.push(`/vehicle/${vehicle.id}` as Parameters<typeof router.push>[0])
          }
        >
          <Wallet size={14} color={Theme.textOnPrimary} />
          <Text style={[cpStyles.quickActionText, cpStyles.quickActionTextPrimary]}>
            Open ledger
          </Text>
        </Pressable>
      </View>
    );

  return (
    <View style={party.viewRoot}>
      <View style={party.viewStickyHeader}>
        <View style={party.viewStickyLeft}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={party.iconBtn}
              hitSlop={12}
              accessibilityLabel="Back"
            >
              <FontAwesome name="chevron-left" size={22} color={Theme.textPrimaryDark} />
            </Pressable>
          ) : null}
          <Text style={party.viewStickyTitle} numberOfLines={1}>
            Vehicle Profile
          </Text>
        </View>
        <View style={party.viewStickyRight}>
          <View
            style={[
              party.badge,
              { backgroundColor: Theme.surfaceGray, borderColor: Theme.borderMedium },
            ]}
          >
            <Text style={[party.badgeText, { color: Theme.textMuted }]}>VEHICLE</Text>
          </View>
        </View>
      </View>

      <View style={party.viewTabBar}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={[party.viewTabChip, active && party.viewTabChipActive]}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[party.viewTabChipText, active && party.viewTabChipTextActive]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          party.hubBody,
          compact && mobile.scrollContentCompact,
          { paddingBottom: layoutInsets.scrollBottomPadding(compact ? 16 : 24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {panel}
      </ScrollView>
    </View>
  );
}
