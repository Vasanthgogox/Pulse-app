import Theme from "@/constants/Theme";
import { DriverProfileHubHero } from "@/features/drivers/components/desktop/DriverProfileHubHero";
import { DriverProfileOverviewPanel } from "@/features/drivers/components/desktop/DriverProfileOverviewPanel";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { ROUTES } from "@/lib/routes";
import { MoreHorizontal, Wallet } from "lucide-react-native";
import { useState } from "react";
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
  const [tab, setTab] = useState<DriverProfileTab>("overview");

  const stats = [
    { value: String(tripCount), label: "TRIPS" },
    { value: String(ratingCount), label: "RATINGS" },
    { value: String(tenureCount), label: "TENURES" },
    {
      value: driver.assigned_vehicle_id ? "1" : "0",
      label: "VEHICLE",
    },
  ];

  const panel =
    tab === "overview" ? (
      <DriverProfileOverviewPanel
        driver={driver}
        tripCount={tripCount}
        vehicleLabel={vehicleLabel}
      />
    ) : tab === "compliance" ? (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Compliance</Text>
        <Text style={styles.aboutBody}>
          Licence: {driver.license_number?.trim() || "Not on file"}
          {"\n"}Emergency: {driver.emergency_name?.trim() || "—"} ·{" "}
          {driver.emergency_contact?.trim() || "—"}
        </Text>
      </View>
    ) : (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Finance</Text>
        <Text style={styles.aboutBody}>
          Open the driver ledger for payable balance, salary requests, and trip settlements.
        </Text>
        <Pressable
          style={[cpStyles.quickActionBtn, cpStyles.quickActionBtnPrimary, { alignSelf: "flex-start", marginTop: 12 }]}
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
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <DriverProfileHubHero driver={driver} tripCount={tripCount} onBack={onBack} />

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
          >
            <Text style={[styles.tabActionBtnText, styles.tabActionBtnTextOn]}>
              Assign trip
            </Text>
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
