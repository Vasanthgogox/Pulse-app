import Theme from "@/constants/Theme";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { VehicleProfileHubHero } from "@/features/vehicles/components/desktop/VehicleProfileHubHero";
import { VehicleProfileOverviewPanel } from "@/features/vehicles/components/desktop/VehicleProfileOverviewPanel";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ArrowLeft, MoreHorizontal, Wallet } from "lucide-react-native";
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
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
  const [tab, setTab] = useState<VehicleProfileTab>("overview");
  const docs = vehicle.documents;
  const docCount = [
    docs?.rc?.expiryDate,
    docs?.insurance?.expiryDate,
    docs?.fitness?.expiryDate,
    docs?.pollution?.expiryDate,
  ].filter(Boolean).length;

  const displayName =
    vehicle.registration_number?.trim() ||
    vehicle.vehicle_number?.trim() ||
    "Vehicle";

  const stats = [
    { value: String(tripCount), label: "TRIPS" },
    { value: String(docCount), label: "DOCUMENTS" },
    { value: vehicle.capacity?.trim() || "—", label: "CAPACITY" },
    { value: (vehicle.vehicle_type ?? "—").toUpperCase(), label: "TYPE" },
  ];

  const statCellCompactStyle = (idx: number) => {
    if (!compact) return undefined;
    if (idx === 1) return mobile.statCellGridTopRight;
    if (idx === 2) return mobile.statCellGridBottomLeft;
    if (idx === 3) return mobile.statCellGridBottomRight;
    return undefined;
  };

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
                {displayName}
              </Text>
              <Text style={mobile.chromeSubtitle} numberOfLines={1}>
                {[vehicle.vehicle_type, vehicle.capacity?.trim()]
                  .filter(Boolean)
                  .join(" · ") || "Vehicle profile"}
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={mobile.chromePillsScroll}
            contentContainerStyle={mobile.chromePillsContent}
          >
            <View style={mobile.chromePill}>
              <Text style={mobile.chromePillText}>VEHICLE</Text>
            </View>
            <View style={mobile.chromePill}>
              <Text style={mobile.chromePillText}>
                {(vehicle.vehicle_type ?? "FLEET").toUpperCase()}
              </Text>
            </View>
            <View style={mobile.chromePill}>
              <Text style={mobile.chromePillText}>{docCount} DOCS</Text>
            </View>
          </ScrollView>
        </View>
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

        {compact ? (
          <View style={mobile.tabActionsRow}>
            <Pressable style={mobile.tabActionIcon} hitSlop={8}>
              <MoreHorizontal size={18} color={METRONIC.text} strokeWidth={2} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.tabActions}>
            <Pressable style={styles.tabActionBtn} hitSlop={8}>
              <MoreHorizontal size={16} color={Theme.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
        )}
      </View>

      <View style={[cpStyles.metricsWrap, compact && mobile.metricsWrapCompact]}>
        <View style={[styles.statsBar, compact && mobile.statsBarGrid]}>
          {stats.map((s, idx) => (
            <View
              key={s.label}
              style={[
                styles.statCell,
                !compact && cpStyles.statCellCompact,
                !compact && idx === stats.length - 1 && styles.statCellLast,
                compact && mobile.statCellGrid,
                statCellCompactStyle(idx),
              ]}
            >
              <Text
                style={[styles.statValue, compact && mobile.statValueCompact]}
                numberOfLines={1}
              >
                {s.value}
              </Text>
              <Text style={[styles.statLabel, compact && mobile.statLabelCompact]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {panel}
    </ScrollView>
  );
}
