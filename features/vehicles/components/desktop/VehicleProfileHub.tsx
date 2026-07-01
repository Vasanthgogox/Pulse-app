import Theme from "@/constants/Theme";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { VehicleProfileHubHero } from "@/features/vehicles/components/desktop/VehicleProfileHubHero";
import { VehicleProfileOverviewPanel } from "@/features/vehicles/components/desktop/VehicleProfileOverviewPanel";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import {
  PartyProfileCompactChrome,
  vehicleToChromeModel,
} from "@/features/party/components/PartyProfileCompactChrome";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { Wallet } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

type VehicleProfileTab = "overview" | "documents" | "finance";

const TABS: { id: VehicleProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "finance", label: "Finance" },
];

type Props = {
  vehicle: VehicleRow;
  tripCount: number;
  onBack?: () => void;
};

export function VehicleProfileHub({ vehicle, tripCount, onBack }: Props) {
  const router = useRouter();
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
  const [tab, setTab] = useState<VehicleProfileTab>("overview");
  const docs = vehicle.documents;

  const chromeModel = useMemo(
    () => vehicleToChromeModel(vehicle, tripCount),
    [vehicle, tripCount],
  );

  const panel =
    tab === "overview" ? (
      <VehicleProfileOverviewPanel vehicle={vehicle} tripCount={tripCount} />
    ) : tab === "documents" ? (
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
    ) : (
      <View style={[styles.card, compact && mobile.cardCompact]}>
        <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>Finance</Text>
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
        <PartyProfileCompactChrome model={chromeModel} onBack={onBack} />
      ) : (
        <VehicleProfileHubHero vehicle={vehicle} tripCount={tripCount} onBack={onBack} />
      )}

      <View style={[styles.tabBar, compact && mobile.tabBarCompact]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={compact ? mobile.tabScrollCompact : styles.tabScroll}
          contentContainerStyle={
            compact ? mobile.tabScrollContentCompact : styles.tabScrollContent
          }
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
      </View>

      {panel}
    </ScrollView>
  );
}
