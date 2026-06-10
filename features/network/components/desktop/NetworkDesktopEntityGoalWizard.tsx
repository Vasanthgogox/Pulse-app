/**
 * Goal-setting modal — client / asset detail, 3-month history, and target plan in one view.
 */
import Theme from "@/constants/Theme";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { formatClientPhoneDisplay } from "@/features/clients/utils/clientManagement.util";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { GoalFocus } from "@/features/network/services/networkGoalsStorage.service";
import {
  getMonthStore,
  monthLabelFromKey,
  previousMonthKey,
} from "@/features/network/services/networkGoalsStorage.service";
import type { NetworkGoalsStore } from "@/features/network/services/networkGoalsStorage.service";
import {
  buildEntityMonthlyPerformance,
  getPriorMonthKeys,
  recommendEntityGoalTarget,
  type EntityGoalRow,
  type EntityMonthPerformance,
} from "@/features/network/utils/connectionGoalsAnalytics.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatINRChip } from "@/lib/format";
import { Copy, Sparkles, Target, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  focus: GoalFocus;
  entity: EntityGoalRow | null;
  client?: ClientRow | null;
  selectedMonthKey: string;
  goalsStore: NetworkGoalsStore;
  trips: readonly TripRow[];
  saving?: boolean;
  onClose: () => void;
  onSave: (revenueInr: number, tripCount: number) => Promise<void>;
};

function HistoryRow({ row, showTrips }: { row: EntityMonthPerformance; showTrips: boolean }) {
  return (
    <View style={styles.goalsWizardHistoryRow}>
      <Text style={[styles.goalsWizardHistoryCell, styles.goalsWizardHistoryMonth]}>
        {row.label}
      </Text>
      <Text style={[styles.goalsWizardHistoryCell, styles.goalsWizardHistoryNum]}>
        {formatINRChip(row.actualRevenue)}
        {showTrips ? ` · ${row.actualTrips} trips` : ""}
      </Text>
      <Text style={[styles.goalsWizardHistoryCell, styles.goalsWizardHistoryNum]}>
        {row.targetRevenue > 0 ? formatINRChip(row.targetRevenue) : "—"}
        {showTrips && row.targetTrips > 0 ? ` · ${row.targetTrips}` : ""}
      </Text>
      <Text style={[styles.goalsWizardHistoryCell, styles.goalsWizardHistoryPct]}>
        {row.targetRevenue > 0 ? `${row.revenueProgressPct}%` : "—"}
      </Text>
    </View>
  );
}

export function NetworkDesktopEntityGoalWizard({
  visible,
  focus,
  entity,
  client,
  selectedMonthKey,
  goalsStore,
  trips,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const [revenueDraft, setRevenueDraft] = useState("");
  const [tripsDraft, setTripsDraft] = useState("");
  const [planMode, setPlanMode] = useState<"recommend" | "carry" | "custom">("recommend");

  const historyMonthKeys = useMemo(
    () => getPriorMonthKeys(selectedMonthKey, 3),
    [selectedMonthKey],
  );

  const history = useMemo(() => {
    if (!entity) return [];
    return buildEntityMonthlyPerformance(
      focus,
      entity.id,
      trips,
      goalsStore,
      historyMonthKeys,
    );
  }, [entity, focus, goalsStore, historyMonthKeys, trips]);

  const prevMonthKey = useMemo(
    () => previousMonthKey(selectedMonthKey),
    [selectedMonthKey],
  );

  const previousMonthTarget = useMemo(() => {
    if (!entity || !prevMonthKey) {
      return { revenueInr: 0, tripCount: 0 };
    }
    const month = getMonthStore(goalsStore, prevMonthKey);
    const bucket =
      focus === "client"
        ? month.clients
        : focus === "vehicle"
          ? month.vehicles
          : month.drivers;
    return bucket[entity.id] ?? { revenueInr: 0, tripCount: 0 };
  }, [entity, focus, goalsStore, prevMonthKey]);

  const recommendation = useMemo(
    () => recommendEntityGoalTarget(history, previousMonthTarget, focus),
    [focus, history, previousMonthTarget],
  );

  const currentMonthTarget = useMemo(() => {
    if (!entity) return { revenueInr: 0, tripCount: 0 };
    const month = getMonthStore(goalsStore, selectedMonthKey);
    const bucket =
      focus === "client"
        ? month.clients
        : focus === "vehicle"
          ? month.vehicles
          : month.drivers;
    return bucket[entity.id] ?? { revenueInr: 0, tripCount: 0 };
  }, [entity, focus, goalsStore, selectedMonthKey]);

  useEffect(() => {
    if (!visible || !entity) return;
    const initialRevenue =
      currentMonthTarget.revenueInr > 0
        ? currentMonthTarget.revenueInr
        : recommendation.recommendedRevenue;
    const initialTrips =
      currentMonthTarget.tripCount > 0
        ? currentMonthTarget.tripCount
        : recommendation.recommendedTrips;
    setRevenueDraft(initialRevenue > 0 ? String(initialRevenue) : "");
    setTripsDraft(initialTrips > 0 ? String(initialTrips) : "");
    setPlanMode(currentMonthTarget.revenueInr > 0 ? "custom" : "recommend");
  }, [visible, entity, currentMonthTarget, recommendation]);

  if (!entity) return null;

  const focusLabel =
    focus === "client" ? "Client" : focus === "vehicle" ? "Vehicle" : "Driver";
  const showTrips = focus !== "client";
  const canCarryForward =
    Boolean(prevMonthKey) &&
    (previousMonthTarget.revenueInr > 0 || previousMonthTarget.tripCount > 0);

  const clientPhone =
    client?.phone != null ? formatClientPhoneDisplay(client.phone) : "—";
  const showClientPhone = clientPhone !== "—";

  const applyRecommendation = () => {
    setPlanMode("recommend");
    setRevenueDraft(
      recommendation.recommendedRevenue > 0
        ? String(recommendation.recommendedRevenue)
        : "",
    );
    if (showTrips) {
      setTripsDraft(
        recommendation.recommendedTrips > 0
          ? String(recommendation.recommendedTrips)
          : "",
      );
    }
  };

  const applyCarryForward = () => {
    if (!canCarryForward) return;
    setPlanMode("carry");
    setRevenueDraft(
      previousMonthTarget.revenueInr > 0
        ? String(previousMonthTarget.revenueInr)
        : "",
    );
    if (showTrips) {
      setTripsDraft(
        previousMonthTarget.tripCount > 0
          ? String(previousMonthTarget.tripCount)
          : "",
      );
    }
  };

  const handleSave = async () => {
    const revenue = Number(revenueDraft.replace(/,/g, "").trim());
    const tripCount = showTrips
      ? Number(tripsDraft.replace(/,/g, "").trim())
      : 0;
    if (!Number.isFinite(revenue) || revenue < 0) return;
    if (showTrips && (!Number.isFinite(tripCount) || tripCount < 0)) return;
    await onSave(revenue, showTrips ? Math.round(tripCount) : 0);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.goalsWizardBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.goalsWizardSheet, styles.goalsWizardSheetTall, { paddingBottom: insets.bottom + 12 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.goalsWizardHeader}>
            <View style={styles.goalsWizardHeaderText}>
              <Text style={styles.goalsWizardTitle}>Set {focusLabel.toLowerCase()} goal</Text>
              <Text style={styles.goalsWizardSubtitle}>
                {entity.name} · {monthLabelFromKey(selectedMonthKey)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <X size={18} color={METRONIC.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.goalsWizardBody}
            contentContainerStyle={styles.goalsWizardBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.goalsWizardHero}>
              <View style={styles.goalsWizardHeroIcon}>
                <Target size={22} color={METRONIC.link} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.goalsWizardHeroName}>{entity.name}</Text>
                <Text style={styles.goalsWizardHeroMeta}>{entity.meta}</Text>
              </View>
            </View>

            {focus === "client" && client ? (
              <View style={styles.goalsWizardDetailGrid}>
                {client.contact_person ? (
                  <View style={styles.goalsWizardDetailCell}>
                    <Text style={styles.goalsWizardDetailLabel}>Contact</Text>
                    <Text style={styles.goalsWizardDetailValue}>
                      {client.contact_person}
                    </Text>
                  </View>
                ) : null}
                {showClientPhone ? (
                  <View style={styles.goalsWizardDetailCell}>
                    <Text style={styles.goalsWizardDetailLabel}>Phone</Text>
                    <Text style={styles.goalsWizardDetailValue}>{clientPhone}</Text>
                  </View>
                ) : null}
                {client.email ? (
                  <View style={styles.goalsWizardDetailCell}>
                    <Text style={styles.goalsWizardDetailLabel}>Email</Text>
                    <Text style={styles.goalsWizardDetailValue} numberOfLines={1}>
                      {client.email}
                    </Text>
                  </View>
                ) : null}
                {client.address ? (
                  <View style={[styles.goalsWizardDetailCell, styles.goalsWizardDetailWide]}>
                    <Text style={styles.goalsWizardDetailLabel}>Address</Text>
                    <Text style={styles.goalsWizardDetailValue}>{client.address}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.goalsWizardKpiRow}>
              <View style={styles.goalsWizardKpi}>
                <Text style={styles.goalsWizardKpiValue}>
                  {formatINRChip(entity.actualRevenue)}
                </Text>
                <Text style={styles.goalsWizardKpiLabel}>Period actual</Text>
              </View>
              <View style={styles.goalsWizardKpi}>
                <Text style={styles.goalsWizardKpiValue}>
                  {entity.targetRevenue > 0 ? formatINRChip(entity.targetRevenue) : "—"}
                </Text>
                <Text style={styles.goalsWizardKpiLabel}>Current target</Text>
              </View>
              <View style={styles.goalsWizardKpi}>
                <Text style={styles.goalsWizardKpiValue}>
                  {entity.hasTarget ? `${entity.revenueProgressPct}%` : "—"}
                </Text>
                <Text style={styles.goalsWizardKpiLabel}>Progress</Text>
              </View>
            </View>

            <Text style={styles.goalsWizardSectionTitle}>
              Last 3 months · target vs actual
            </Text>
            <View style={styles.goalsWizardHistoryHead}>
              <Text style={[styles.goalsWizardHistoryHeadCell, styles.goalsWizardHistoryMonth]}>
                Month
              </Text>
              <Text style={[styles.goalsWizardHistoryHeadCell, styles.goalsWizardHistoryNum]}>
                Actual
              </Text>
              <Text style={[styles.goalsWizardHistoryHeadCell, styles.goalsWizardHistoryNum]}>
                Target
              </Text>
              <Text style={[styles.goalsWizardHistoryHeadCell, styles.goalsWizardHistoryPct]}>
                %
              </Text>
            </View>
            {history.length === 0 ? (
              <Text style={styles.goalsWizardEmpty}>
                No prior months in range — use the recommendation or set a custom target below.
              </Text>
            ) : (
              history.map((row) => (
                <HistoryRow key={row.monthKey} row={row} showTrips={showTrips} />
              ))
            )}

            <View style={styles.goalsWizardRecommendCard}>
              <View style={styles.goalsWizardRecommendHeader}>
                <Sparkles size={16} color={METRONIC.link} />
                <Text style={styles.goalsWizardRecommendTitle}>Recommendation</Text>
              </View>
              <Text style={styles.goalsWizardRecommendAmount}>
                {formatINRChip(recommendation.recommendedRevenue)}
                {showTrips && recommendation.recommendedTrips > 0
                  ? ` · ${recommendation.recommendedTrips} trips`
                  : ""}
              </Text>
              <Text style={styles.goalsWizardRecommendBody}>{recommendation.rationale}</Text>
              <Pressable
                style={[
                  styles.goalsWizardOptionBtn,
                  planMode === "recommend" && styles.goalsWizardOptionBtnOn,
                ]}
                onPress={applyRecommendation}
              >
                <Text
                  style={[
                    styles.goalsWizardOptionBtnText,
                    planMode === "recommend" && styles.goalsWizardOptionBtnTextOn,
                  ]}
                >
                  Use recommendation
                </Text>
              </Pressable>
            </View>

            {canCarryForward && prevMonthKey ? (
              <Pressable
                style={[
                  styles.goalsWizardCarryCard,
                  planMode === "carry" && styles.goalsWizardCarryCardOn,
                ]}
                onPress={applyCarryForward}
              >
                <Copy size={16} color={METRONIC.link} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.goalsWizardCarryTitle}>
                    Carry forward {monthLabelFromKey(prevMonthKey)}
                  </Text>
                  <Text style={styles.goalsWizardCarrySub}>
                    {formatINRChip(previousMonthTarget.revenueInr)}
                    {showTrips && previousMonthTarget.tripCount > 0
                      ? ` · ${previousMonthTarget.tripCount} trips`
                      : ""}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <Text style={styles.goalsWizardSectionTitle}>Set target for {monthLabelFromKey(selectedMonthKey)}</Text>
            <Text style={styles.goalsWizardFieldLabel}>Revenue (INR)</Text>
            <TextInput
              style={styles.goalsWizardInput}
              value={revenueDraft}
              onChangeText={(v) => {
                setPlanMode("custom");
                setRevenueDraft(v);
              }}
              keyboardType="numeric"
              placeholder="e.g. 200000"
              placeholderTextColor={METRONIC.muted}
            />
            {showTrips ? (
              <>
                <Text style={styles.goalsWizardFieldLabel}>Trip count</Text>
                <TextInput
                  style={styles.goalsWizardInput}
                  value={tripsDraft}
                  onChangeText={(v) => {
                    setPlanMode("custom");
                    setTripsDraft(v);
                  }}
                  keyboardType="numeric"
                  placeholder="e.g. 12"
                  placeholderTextColor={METRONIC.muted}
                />
              </>
            ) : null}
          </ScrollView>

          <View style={styles.goalsWizardFooter}>
            <View />
            <View style={styles.goalsWizardFooterActions}>
              <Pressable style={styles.goalsWizardCancelBtn} onPress={onClose} disabled={saving}>
                <Text style={styles.goalsWizardCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.goalsWizardPrimaryBtn, saving && { opacity: 0.6 }]}
                onPress={() => void handleSave()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Theme.textOnPrimary} size="small" />
                ) : (
                  <Text style={styles.goalsWizardPrimaryText}>Save goal</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
