import Theme from "@/constants/Theme";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { VehicleProfileHubHero } from "@/features/vehicles/components/desktop/VehicleProfileHubHero";
import { VehicleProfileOverviewPanel } from "@/features/vehicles/components/desktop/VehicleProfileOverviewPanel";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { MoreHorizontal, Wallet } from "lucide-react-native";
import { useState } from "react";
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
  const [tab, setTab] = useState<VehicleProfileTab>("overview");
  const docs = vehicle.documents;
  const docCount = [
    docs?.rc?.expiryDate,
    docs?.insurance?.expiryDate,
    docs?.fitness?.expiryDate,
    docs?.pollution?.expiryDate,
  ].filter(Boolean).length;

  const stats = [
    { value: String(tripCount), label: "TRIPS" },
    { value: String(docCount), label: "DOCUMENTS" },
    { value: vehicle.capacity?.trim() || "—", label: "CAPACITY" },
    { value: (vehicle.vehicle_type ?? "—").toUpperCase(), label: "TYPE" },
  ];

  const panel =
    tab === "overview" ? (
      <VehicleProfileOverviewPanel vehicle={vehicle} tripCount={tripCount} />
    ) : tab === "documents" ? (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Compliance documents</Text>
        <Text style={styles.aboutBody}>
          RC: {docs?.rc?.expiryDate ?? "—"}
          {"\n"}Insurance: {docs?.insurance?.expiryDate ?? "—"}
          {"\n"}Fitness: {docs?.fitness?.expiryDate ?? "—"}
          {"\n"}PUC: {docs?.pollution?.expiryDate ?? "—"}
        </Text>
      </View>
    ) : (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Finance</Text>
        <Text style={styles.aboutBody}>
          View vehicle operations ledger, fuel entries, and trip-linked costs.
        </Text>
        <Pressable
          style={[cpStyles.quickActionBtn, cpStyles.quickActionBtnPrimary, { alignSelf: "flex-start", marginTop: 12 }]}
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
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <VehicleProfileHubHero vehicle={vehicle} tripCount={tripCount} onBack={onBack} />

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
              <Text style={styles.statValue} numberOfLines={1}>
                {s.value}
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {panel}
    </ScrollView>
  );
}
