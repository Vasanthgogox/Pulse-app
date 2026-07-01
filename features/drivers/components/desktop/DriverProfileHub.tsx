import Theme from "@/constants/Theme";
import { DriverProfileHubHero } from "@/features/drivers/components/desktop/DriverProfileHubHero";
import { DriverProfileOverviewPanel } from "@/features/drivers/components/desktop/DriverProfileOverviewPanel";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import {
  PartyProfileCompactChrome,
  publicEntityToChromeModel,
} from "@/features/party/components/PartyProfileCompactChrome";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { driverToPublicEntity } from "@/features/public-profile/mappers";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ROUTES } from "@/lib/routes";
import { Wallet } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

type DriverProfileTab = "overview" | "compliance" | "finance";

const TABS: { id: DriverProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "compliance", label: "Compliance" },
  { id: "finance", label: "Finance" },
];

type Props = {
  driver: DriverRow;
  tripCount: number;
  vehicleLabel: string | null;
  ratingCount: number;
  tenureCount: number;
  onBack?: () => void;
};

export function DriverProfileHub({
  driver,
  tripCount,
  vehicleLabel,
  ratingCount,
  tenureCount,
  onBack,
}: Props) {
  const router = useRouter();
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
  const [tab, setTab] = useState<DriverProfileTab>("overview");

  const chromeModel = useMemo(
    () => publicEntityToChromeModel(driverToPublicEntity(driver)),
    [driver],
  );

  const panel =
    tab === "overview" ? (
      <DriverProfileOverviewPanel
        driver={driver}
        tripCount={tripCount}
        vehicleLabel={vehicleLabel}
      />
    ) : tab === "compliance" ? (
      <View style={[styles.card, compact && mobile.cardCompact]}>
        <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>Compliance</Text>
        <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
          Licence: {driver.license_number?.trim() || "Not on file"}
          {"\n"}Emergency: {driver.emergency_name?.trim() || "—"} ·{" "}
          {driver.emergency_contact?.trim() || "—"}
        </Text>
      </View>
    ) : (
      <View style={[styles.card, compact && mobile.cardCompact]}>
        <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>Finance</Text>
        <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
          Open the driver ledger for payable balance, salary requests, and trip settlements.
        </Text>
        <Pressable
          style={[
            cpStyles.quickActionBtn,
            cpStyles.quickActionBtnPrimary,
            { alignSelf: "flex-start", marginTop: 12 },
          ]}
          onPress={() =>
            router.push(`/driver/${driver.id}` as Parameters<typeof router.push>[0])
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
        <DriverProfileHubHero driver={driver} tripCount={tripCount} onBack={onBack} />
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
