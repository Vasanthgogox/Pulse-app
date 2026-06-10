import Theme from "@/constants/Theme";
import { DriverProfileHubHero } from "@/features/drivers/components/desktop/DriverProfileHubHero";
import { DriverProfileOverviewPanel } from "@/features/drivers/components/desktop/DriverProfileOverviewPanel";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ROUTES } from "@/lib/routes";
import { ArrowLeft, MoreHorizontal, Wallet } from "lucide-react-native";
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
  const compact = useProfileHubCompact();
  const layoutInsets = useLayoutInsets();
  const [tab, setTab] = useState<DriverProfileTab>("overview");

  const displayName = driver.name?.trim() || "Driver";

  const stats = [
    { value: String(tripCount), label: "TRIPS" },
    { value: String(ratingCount), label: "RATINGS" },
    { value: String(tenureCount), label: "TENURES" },
    {
      value: driver.assigned_vehicle_id ? "1" : "0",
      label: "VEHICLE",
    },
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
                {[vehicleLabel, driver.phone?.trim()].filter(Boolean).join(" · ") ||
                  "Driver profile"}
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
              <Text style={mobile.chromePillText}>DRIVER</Text>
            </View>
            <View style={mobile.chromePill}>
              <Text style={mobile.chromePillText}>
                {driver.assigned_vehicle_id ? "ASSIGNED" : "UNASSIGNED"}
              </Text>
            </View>
            <View style={mobile.chromePill}>
              <Text style={mobile.chromePillText}>{tripCount} TRIPS</Text>
            </View>
          </ScrollView>
        </View>
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

        {compact ? (
          <View style={mobile.tabActionsRow}>
            <Pressable
              style={mobile.tabActionPrimary}
              onPress={() =>
                router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])
              }
            >
              <Text style={mobile.tabActionPrimaryText}>Assign trip</Text>
            </Pressable>
            <Pressable style={mobile.tabActionIcon} hitSlop={8}>
              <MoreHorizontal size={18} color={METRONIC.text} strokeWidth={2} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.tabActions}>
            <Pressable
              style={[styles.tabActionBtn, styles.tabActionBtnPrimary]}
              onPress={() =>
                router.push(ROUTES.ADD_TRIP as Parameters<typeof router.push>[0])
              }
            >
              <Text style={[styles.tabActionBtnText, styles.tabActionBtnTextOn]}>
                Assign trip
              </Text>
            </Pressable>
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
              <Text style={[styles.statValue, compact && mobile.statValueCompact]}>
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
