/**
 * Goals tab — monthly sales targets (revenue, trips, margin %);
 * client-level revenue; vehicle/driver asset targets; quarter & YTD rollups.
 */
import Theme from "@/constants/Theme";
import { NetworkDesktopEntityGoalWizard } from "@/features/network/components/desktop/NetworkDesktopEntityGoalWizard";
import { NetworkDesktopGoalsBalanceChart } from "@/features/network/components/desktop/NetworkDesktopGoalsBalanceChart";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import {
  carryForwardGoals,
  DEFAULT_NETWORK_GOALS_STORE,
  getMonthStore,
  loadNetworkGoalsStore,
  monthLabelFromKey,
  patchAggregateTarget,
  patchEntityTarget,
  previousMonthKey,
  saveNetworkGoalsStore,
  type GoalFocus,
  type NetworkGoalsStore,
} from "@/features/network/services/networkGoalsStorage.service";
import {
  balancePeriodMonthKeys,
  buildBalanceTrendPoints,
  buildEntityGoalRows,
  buildGoalSummaryRows,
  buildPeriodSummary,
  computeGoalsActualsForRollup,
  computePayableReceivableSnapshot,
  getRecentMonthKeys,
  type EntityGoalRow,
  type GoalTargetRow,
  type GoalsRollup,
} from "@/features/network/utils/connectionGoalsAnalytics.util";
import type { SalesDateRange } from "@/features/network/utils/connectionSalesAnalytics.util";
import { formatINR, formatINRChip } from "@/lib/format";
import {
  useClientsQuery,
  useDriversQuery,
  useSuppliersQuery,
  useTransactionsQuery,
  useTripsQuery,
  useVehiclesQuery,
} from "@/lib/queries";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  MoreVertical,
  Pencil,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  orgId: string;
};

const ROLLUPS: { id: GoalsRollup; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

const FOCUS_TABS: { id: GoalFocus; label: string }[] = [
  { id: "client", label: "Clients" },
  { id: "vehicle", label: "Vehicles" },
  { id: "driver", label: "Drivers" },
];

const BALANCE_PERIODS: { id: SalesDateRange; label: string }[] = [
  { id: "3m", label: "Month" },
  { id: "6m", label: "Quarter" },
  { id: "12m", label: "Year" },
  { id: "all", label: "All" },
];

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.salesFilterChip, active && styles.salesFilterChipOn]}
    >
      <Text
        style={[
          styles.salesFilterChipText,
          active && styles.salesFilterChipTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatMetricValue(row: GoalTargetRow): string {
  if (row.unit === "trips") return String(Math.round(row.actual));
  if (row.unit === "pct") return `${row.actual.toFixed(1)}%`;
  return formatINRChip(row.actual);
}

function formatMetricTarget(row: GoalTargetRow): string {
  if (row.target <= 0) return "Not set";
  if (row.unit === "trips") return `${Math.round(row.target)} trips`;
  if (row.unit === "pct") return `${row.target.toFixed(1)}%`;
  return formatINRChip(row.target);
}

function BalanceWidget({
  title,
  label,
  amount,
  sub,
  progress,
  progressLabel,
  tone,
  icon,
  period,
  onPeriodChange,
}: {
  title: string;
  label: string;
  amount: string;
  sub: string;
  progress: number;
  progressLabel: string;
  tone: "receivable" | "payable";
  icon: ReactNode;
  period: SalesDateRange;
  onPeriodChange: (p: SalesDateRange) => void;
}) {
  const toneColor = tone === "receivable" ? "#3E97FF" : "#F1416C";
  return (
    <View style={styles.goalsBalanceCard}>
      <View style={styles.goalsBalanceHeader}>
        <Text style={styles.goalsBalanceTitle}>{title}</Text>
        <Pressable hitSlop={8}>
          <MoreVertical size={15} color={METRONIC.muted} />
        </Pressable>
      </View>
      <View style={styles.goalsBalanceIconRow}>{icon}</View>
      <Text style={styles.goalsBalanceLabel}>{label}</Text>
      <Text style={styles.goalsBalanceAmount}>{amount}</Text>
      <Text style={styles.goalsBalanceSub}>{sub}</Text>
      <View style={styles.goalsPeriodRow}>
        {BALANCE_PERIODS.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => onPeriodChange(p.id)}
            style={[
              styles.goalsPeriodBtn,
              period === p.id && styles.goalsPeriodBtnOn,
            ]}
          >
            <Text
              style={[
                styles.goalsPeriodBtnText,
                period === p.id && styles.goalsPeriodBtnTextOn,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.goalsProgressTrack}>
        <View
          style={[
            styles.goalsProgressFill,
            {
              width: `${Math.min(100, Math.max(0, progress))}%`,
              backgroundColor: toneColor,
            },
          ]}
        />
      </View>
      <Text style={styles.goalsProgressMeta}>{progressLabel}</Text>
    </View>
  );
}

function GoalTargetCard({
  row,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
}: {
  row: GoalTargetRow;
  editing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const hasTarget = row.target > 0;
  const placeholder =
    row.unit === "trips" ? "Trips" : row.unit === "pct" ? "Margin %" : "INR";

  return (
    <View style={styles.goalsTargetCard}>
      <View style={styles.goalsTargetCardHeader}>
        <Text style={styles.goalsTargetCardTitle}>{row.label}</Text>
        <Pressable onPress={onStartEdit} hitSlop={8}>
          <Pencil size={14} color={METRONIC.muted} />
        </Pressable>
      </View>
      <Text style={styles.goalsTargetCardHint}>{row.subtitle}</Text>
      <View style={styles.goalsTargetInner}>
        <View style={styles.goalsTargetValueCol}>
          <Text style={styles.goalsTargetActual}>{formatMetricValue(row)}</Text>
          <Text style={styles.goalsTargetMeta} numberOfLines={2}>
            {hasTarget
              ? `${row.progressPct}% of ${formatMetricTarget(row)}`
              : "Set a monthly target for the selected month."}
          </Text>
        </View>
        {editing ? (
          <View style={styles.goalsTargetEditCol}>
            <TextInput
              style={styles.goalsTargetInput}
              value={draft}
              onChangeText={onDraftChange}
              keyboardType="numeric"
              placeholder={placeholder}
              placeholderTextColor={METRONIC.muted}
            />
            <View style={styles.goalsTargetEditActions}>
              <Pressable onPress={onCancel} style={styles.goalsTargetCancelBtn}>
                <Text style={styles.goalsTargetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={onSave} style={styles.goalsTargetSaveBtn}>
                <Text style={styles.goalsTargetSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={onStartEdit} style={styles.goalsTargetActionBtn}>
            <Text style={styles.goalsTargetActionText}>
              {hasTarget ? "Edit goal" : "Add a goal"}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={styles.goalsTargetSliderTrack}>
        <View
          style={[
            styles.goalsTargetSliderFill,
            { width: `${hasTarget ? Math.min(100, row.progressPct) : 8}%` },
          ]}
        />
        <View
          style={[
            styles.goalsTargetSliderThumb,
            {
              left: `${hasTarget ? Math.min(96, Math.max(4, row.progressPct)) : 4}%`,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.goalsStatusPill,
          row.status === "on_track"
            ? styles.goalsStatusOnTrack
            : row.status === "behind"
              ? styles.goalsStatusBehind
              : styles.goalsStatusUnset,
        ]}
      >
        <Text
          style={[
            styles.goalsStatusText,
            row.status === "on_track"
              ? styles.goalsStatusOnTrackText
              : row.status === "behind"
                ? styles.goalsStatusBehindText
                : styles.goalsStatusUnsetText,
          ]}
        >
          {row.status === "on_track"
            ? "On track"
            : row.status === "behind"
              ? "Behind target"
              : "No target"}
        </Text>
      </View>
    </View>
  );
}

export function NetworkDesktopGoalsPanel({ orgId }: Props) {
  const layout = useProfileHubCompactLayout();
  const monthOptions = useMemo(() => getRecentMonthKeys(3), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(
    () => monthOptions[monthOptions.length - 1] ?? getRecentMonthKeys(1)[0],
  );
  const [rollup, setRollup] = useState<GoalsRollup>("month");
  const [activeFocus, setActiveFocus] = useState<GoalFocus>("client");
  const [balancePeriod, setBalancePeriod] = useState<SalesDateRange>("3m");
  const [goalsStore, setGoalsStore] = useState<NetworkGoalsStore>(
    DEFAULT_NETWORK_GOALS_STORE,
  );
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [editingMetric, setEditingMetric] = useState<
    GoalTargetRow["metric"] | null
  >(null);
  const [draftTarget, setDraftTarget] = useState("");
  const [goalWizardEntity, setGoalWizardEntity] = useState<EntityGoalRow | null>(
    null,
  );
  const [balanceChartWidth, setBalanceChartWidth] = useState(420);
  const [saving, setSaving] = useState(false);

  const tripsQ = useTripsQuery(orgId);
  const txQ = useTransactionsQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const vehiclesQ = useVehiclesQuery(orgId);

  const trips = tripsQ.data ?? [];
  const transactions = txQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const drivers = driversQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];

  useEffect(() => {
    let cancelled = false;
    setGoalsLoading(true);
    void loadNetworkGoalsStore(orgId).then((loaded) => {
      if (!cancelled) {
        setGoalsStore(loaded);
        setGoalsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const actuals = useMemo(
    () => computeGoalsActualsForRollup(trips, selectedMonthKey, rollup),
    [trips, selectedMonthKey, rollup],
  );

  const periodSummary = useMemo(
    () => buildPeriodSummary(goalsStore, selectedMonthKey, rollup),
    [goalsStore, selectedMonthKey, rollup],
  );

  const balanceSnapshot = useMemo(
    () =>
      computePayableReceivableSnapshot(
        clients,
        suppliers,
        drivers,
        trips,
        transactions,
      ),
    [clients, suppliers, drivers, trips, transactions],
  );

  const balanceTrend = useMemo(
    () => buildBalanceTrendPoints(trips, balancePeriodMonthKeys(balancePeriod)),
    [trips, balancePeriod],
  );

  const summaryRows = useMemo(
    () => buildGoalSummaryRows(goalsStore, actuals, selectedMonthKey, rollup),
    [goalsStore, actuals, selectedMonthKey, rollup],
  );

  const entityRows = useMemo(
    () =>
      buildEntityGoalRows(
        activeFocus,
        goalsStore,
        clients,
        drivers,
        vehicles,
        trips,
        selectedMonthKey,
        rollup,
        20,
      ),
    [
      activeFocus,
      goalsStore,
      clients,
      drivers,
      vehicles,
      trips,
      selectedMonthKey,
      rollup,
    ],
  );

  const selectedMonthStore = useMemo(
    () => getMonthStore(goalsStore, selectedMonthKey),
    [goalsStore, selectedMonthKey],
  );

  const prevMonthKey = previousMonthKey(selectedMonthKey);
  const monthHasTargets =
    selectedMonthStore.aggregate.revenueInr > 0 ||
    selectedMonthStore.aggregate.tripCount > 0 ||
    selectedMonthStore.aggregate.marginPct > 0 ||
    Object.keys(selectedMonthStore.clients).length > 0 ||
    Object.keys(selectedMonthStore.vehicles).length > 0 ||
    Object.keys(selectedMonthStore.drivers).length > 0;

  const receivableProgress =
    balanceSnapshot.receivableBilled > 0
      ? Math.round(
          (balanceSnapshot.receivableCollected /
            balanceSnapshot.receivableBilled) *
            100,
        )
      : 0;

  const payableTotal =
    balanceSnapshot.supplierPayable + balanceSnapshot.driverPayable;
  const payablePaid =
    balanceSnapshot.supplierPaid + balanceSnapshot.driverPaid;
  const payableProgress =
    payableTotal > 0 ? Math.round((payablePaid / payableTotal) * 100) : 0;

  const persistStore = useCallback(
    async (next: NetworkGoalsStore) => {
      setSaving(true);
      setGoalsStore(next);
      try {
        await saveNetworkGoalsStore(orgId, next);
      } finally {
        setSaving(false);
      }
    },
    [orgId],
  );

  const startAggregateEdit = (row: GoalTargetRow) => {
    setEditingMetric(row.metric);
    setDraftTarget(row.target > 0 ? String(row.target) : "");
  };

  const saveAggregateEdit = async (metric: GoalTargetRow["metric"]) => {
    const parsed = Number(draftTarget.replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const patch =
      metric === "revenue"
        ? { revenueInr: parsed }
        : metric === "trips"
          ? { tripCount: Math.round(parsed) }
          : { marginPct: Math.min(100, parsed) };
    const next = patchAggregateTarget(goalsStore, selectedMonthKey, patch);
    await persistStore(next);
    setEditingMetric(null);
    setDraftTarget("");
  };

  const handleCarryForward = async () => {
    if (!prevMonthKey) return;
    const next = carryForwardGoals(
      goalsStore,
      prevMonthKey,
      selectedMonthKey,
      "all",
    );
    await persistStore(next);
  };

  const goalWizardClient = useMemo(() => {
    if (!goalWizardEntity || activeFocus !== "client") return null;
    return clients.find((c) => c.id === goalWizardEntity.id) ?? null;
  }, [activeFocus, clients, goalWizardEntity]);

  const saveGoalWizard = async (revenueInr: number, tripCount: number) => {
    if (!goalWizardEntity) return;
    setSaving(true);
    try {
      const next = patchEntityTarget(
        goalsStore,
        selectedMonthKey,
        activeFocus,
        goalWizardEntity.id,
        {
          revenueInr,
          tripCount,
        },
      );
      await persistStore(next);
      setGoalWizardEntity(null);
    } finally {
      setSaving(false);
    }
  };

  const dataLoading =
    tripsQ.isLoading ||
    txQ.isLoading ||
    clientsQ.isLoading ||
    suppliersQ.isLoading;

  const targetsSetCount = summaryRows.filter((r) => r.target > 0).length;

  return (
    <View style={[styles.salesBody, layout.salesBody]}>
      <View style={[styles.splitRow, layout.splitRow]}>
        <View style={[styles.sidebar, layout.sidebar]}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Goal filters</Text>
            <Text style={styles.salesFilterHint}>
              Set targets per month · view month, quarter, or YTD
            </Text>

            <Text style={styles.salesFilterGroup}>Target month</Text>
            <View style={styles.tagWrap}>
              {monthOptions.map((key) => (
                <FilterChip
                  key={key}
                  label={monthLabelFromKey(key)}
                  active={selectedMonthKey === key}
                  onPress={() => setSelectedMonthKey(key)}
                />
              ))}
            </View>

            <Text style={styles.salesFilterGroup}>Rollup view</Text>
            <View style={styles.tagWrap}>
              {ROLLUPS.map((r) => (
                <FilterChip
                  key={r.id}
                  label={r.label}
                  active={rollup === r.id}
                  onPress={() => setRollup(r.id)}
                />
              ))}
            </View>

            <Text style={styles.salesFilterGroup}>Focus</Text>
            <View style={styles.tagWrap}>
              {FOCUS_TABS.map((tab) => (
                <FilterChip
                  key={tab.id}
                  label={tab.label}
                  active={activeFocus === tab.id}
                  onPress={() => setActiveFocus(tab.id)}
                />
              ))}
            </View>

            {!monthHasTargets && prevMonthKey ? (
              <Pressable
                style={styles.goalsCarryForwardBtn}
                onPress={() => void handleCarryForward()}
              >
                <Copy size={14} color={METRONIC.link} />
                <Text style={styles.goalsCarryForwardText}>
                  Carry forward from {monthLabelFromKey(prevMonthKey)}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>
              {periodSummary.rollupLabel} progress
            </Text>
            {summaryRows.map((row, idx) => (
              <View
                key={row.id}
                style={[
                  styles.goalsSidebarRow,
                  idx === summaryRows.length - 1 && styles.goalsSidebarRowLast,
                ]}
              >
                <View style={styles.goalsSidebarRowTop}>
                  <Text style={styles.goalsSidebarLabel}>{row.label}</Text>
                  <Text style={styles.goalsSidebarPct}>
                    {row.target > 0 ? `${row.progressPct}%` : "—"}
                  </Text>
                </View>
                <View style={styles.goalsSidebarTrack}>
                  <View
                    style={[
                      styles.goalsSidebarFill,
                      {
                        width: `${row.target > 0 ? Math.min(100, row.progressPct) : 0}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.goalsSidebarMeta}>
                  {formatMetricValue(row)}
                  {row.target > 0 ? ` / ${formatMetricTarget(row)}` : ""}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Entity targets (rollup)</Text>
            <Text style={styles.goalsNetSub}>
              Clients {formatINRChip(periodSummary.clientTargetSum.revenueInr)}
              {" · "}
              Vehicles {formatINRChip(periodSummary.vehicleTargetSum.revenueInr)}
              {" · "}
              Drivers {formatINRChip(periodSummary.driverTargetSum.revenueInr)}
            </Text>
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Net position</Text>
            <Text style={styles.goalsNetValue}>
              {formatINRChip(balanceSnapshot.netPosition)}
            </Text>
            <Text style={styles.goalsNetSub}>
              Receivable {formatINRChip(balanceSnapshot.receivableDue)} ·
              Payable {formatINRChip(balanceSnapshot.totalPayable)}
            </Text>
          </View>
        </View>

        <View style={[styles.mainCol, layout.mainCol]}>
          {dataLoading || goalsLoading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={METRONIC.link} />
            </View>
          ) : (
            <>
              <View style={styles.goalsBalanceRow}>
                <BalanceWidget
                  title="Receivable"
                  label="Due from clients"
                  amount={formatINR(balanceSnapshot.receivableDue).replace(
                    /\s/g,
                    "",
                  )}
                  sub={`Collected ${formatINRChip(balanceSnapshot.receivableCollected)} of ${formatINRChip(balanceSnapshot.receivableBilled)} billed`}
                  progress={receivableProgress}
                  progressLabel={`${receivableProgress}% collected`}
                  tone="receivable"
                  period={balancePeriod}
                  onPeriodChange={setBalancePeriod}
                  icon={
                    <ArrowDownLeft size={18} color="#3E97FF" strokeWidth={2.2} />
                  }
                />
                <BalanceWidget
                  title="Payable"
                  label="Due to partners"
                  amount={formatINR(balanceSnapshot.totalPayable).replace(
                    /\s/g,
                    "",
                  )}
                  sub={`Supplier ${formatINRChip(balanceSnapshot.supplierPayable)} · Driver ${formatINRChip(balanceSnapshot.driverPayable)}`}
                  progress={payableProgress}
                  progressLabel={`${payableProgress}% settled`}
                  tone="payable"
                  period={balancePeriod}
                  onPeriodChange={setBalancePeriod}
                  icon={
                    <ArrowUpRight size={18} color="#F1416C" strokeWidth={2.2} />
                  }
                />
              </View>

              <View style={[styles.salesCard, styles.salesCardPadTight]}>
                <View style={styles.salesWidgetHeader}>
                  <Text style={styles.salesCardTitle}>Balance trend</Text>
                  <Text style={styles.goalsChartSub}>
                    Receivable vs payable · last 3 months
                  </Text>
                </View>
                <View
                  style={styles.salesWidgetChartBody}
                  onLayout={(e) => {
                    const w = Math.floor(e.nativeEvent.layout.width);
                    if (w > 0 && w !== balanceChartWidth) {
                      setBalanceChartWidth(w);
                    }
                  }}
                >
                  <NetworkDesktopGoalsBalanceChart
                    data={balanceTrend}
                    width={balanceChartWidth}
                    height={156}
                  />
                </View>
              </View>

              <View style={styles.goalsMonthBanner}>
                <Text style={styles.goalsMonthBannerTitle}>
                  Aggregate targets · {monthLabelFromKey(selectedMonthKey)}
                </Text>
                <Text style={styles.goalsMonthBannerSub}>
                  {rollup === "month"
                    ? "Editing this month only"
                    : `${periodSummary.rollupLabel} compares cumulative actuals vs summed monthly targets`}
                </Text>
              </View>

              <View style={styles.goalsTargetGridThree}>
                {summaryRows.map((row) => (
                  <GoalTargetCard
                    key={row.id}
                    row={row}
                    editing={editingMetric === row.metric}
                    draft={draftTarget}
                    onDraftChange={setDraftTarget}
                    onStartEdit={() => startAggregateEdit(row)}
                    onSave={() => void saveAggregateEdit(row.metric)}
                    onCancel={() => {
                      setEditingMetric(null);
                      setDraftTarget("");
                    }}
                  />
                ))}
              </View>

              <View style={[styles.salesCard, styles.salesTableCard]}>
                <View style={styles.salesTableTitleRow}>
                  <View style={styles.salesTripTableTitleCol}>
                    <Text style={styles.salesCardTitle}>
                      {FOCUS_TABS.find((t) => t.id === activeFocus)?.label}{" "}
                      targets
                    </Text>
                    <Text style={styles.salesTripTableSub}>
                      {activeFocus === "client"
                        ? "Revenue per client · set for "
                        : "Revenue & trips per asset · set for "}
                      {monthLabelFromKey(selectedMonthKey)}
                      {rollup !== "month"
                        ? ` · showing ${periodSummary.rollupLabel} actuals`
                        : ""}
                    </Text>
                  </View>
                  {saving ? (
                    <ActivityIndicator size="small" color={METRONIC.link} />
                  ) : (
                    <Pressable style={styles.salesCardMenu}>
                      <MoreVertical size={15} color={METRONIC.muted} />
                    </Pressable>
                  )}
                </View>

                <View style={styles.salesTableScroll}>
                  <View style={styles.goalsEntityTableHead}>
                    <View style={styles.goalsEntityTableGrid}>
                    <Text
                      style={[styles.goalsEntityHeadCell, styles.goalsEntityColName]}
                    >
                      Name
                    </Text>
                    <Text
                      style={[
                        styles.goalsEntityHeadCell,
                        styles.goalsEntityColActual,
                        styles.goalsEntityHeadNum,
                      ]}
                    >
                      Actual
                    </Text>
                    <Text
                      style={[
                        styles.goalsEntityHeadCell,
                        styles.goalsEntityColTarget,
                        styles.goalsEntityHeadNum,
                      ]}
                    >
                      Target
                    </Text>
                    <Text
                      style={[
                        styles.goalsEntityHeadCell,
                        styles.goalsEntityColProgress,
                        styles.goalsEntityHeadNum,
                      ]}
                    >
                      Progress
                    </Text>
                    <View style={styles.goalsEntityColAction} />
                  </View>
                </View>

                {entityRows.length === 0 ? (
                  <View style={styles.salesTableEmpty}>
                    <Text style={styles.emptyText}>
                      No {activeFocus}s found. Add connections to set targets.
                    </Text>
                  </View>
                ) : (
                  entityRows.map((entity, idx) => {
                    const primaryActual =
                      activeFocus === "client"
                        ? formatINRChip(entity.actualRevenue)
                        : `${formatINRChip(entity.actualRevenue)} · ${entity.actualTrips} trips`;
                    const primaryTarget =
                      activeFocus === "client"
                        ? entity.targetRevenue > 0
                          ? formatINRChip(entity.targetRevenue)
                          : "—"
                        : entity.hasTarget
                          ? `${formatINRChip(entity.targetRevenue)} · ${entity.targetTrips} trips`
                          : "—";
                    const progressPct =
                      activeFocus === "client"
                        ? entity.revenueProgressPct
                        : Math.round(
                            (entity.revenueProgressPct + entity.tripProgressPct) / 2,
                          );

                    return (
                      <Pressable
                        key={entity.id}
                        style={[
                          styles.goalsEntityRow,
                          idx === entityRows.length - 1 &&
                            styles.salesTableRowLast,
                        ]}
                        onPress={() => setGoalWizardEntity(entity)}
                        accessibilityRole="button"
                        accessibilityLabel={`Set goal for ${entity.name}`}
                      >
                        <View style={styles.goalsEntityTableGrid}>
                          <View style={styles.goalsEntityColName}>
                            <Text style={styles.goalsEntityName} numberOfLines={1}>
                              {entity.name}
                            </Text>
                            <Text style={styles.goalsEntityMeta} numberOfLines={1}>
                              {entity.meta}
                            </Text>
                          </View>
                          <View style={styles.goalsEntityColActual}>
                            <Text style={styles.goalsEntityValue} numberOfLines={1}>
                              {primaryActual}
                            </Text>
                          </View>
                          <View style={styles.goalsEntityColTarget}>
                            <Text style={styles.goalsEntityValue} numberOfLines={2}>
                              {primaryTarget}
                            </Text>
                          </View>
                          <View style={styles.goalsEntityColProgress}>
                            <Text style={styles.goalsEntityProgressText}>
                              {entity.hasTarget ? `${progressPct}%` : "—"}
                            </Text>
                          </View>
                          <View style={styles.goalsEntityColAction}>
                            <Target size={14} color={METRONIC.link} />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}
                </View>
              </View>

              <View style={styles.salesKpiRow}>
                <View style={styles.salesKpiCard}>
                  <View style={styles.salesKpiIcon}>
                    <Wallet size={16} color={METRONIC.link} />
                  </View>
                  <Text style={styles.salesKpiValue}>
                    {formatINRChip(balanceSnapshot.receivableDue)}
                  </Text>
                  <Text style={styles.salesKpiLabel}>Open receivable</Text>
                </View>
                <View style={styles.salesKpiCard}>
                  <View style={styles.salesKpiIcon}>
                    <TrendingUp size={16} color="#50CD89" />
                  </View>
                  <Text style={styles.salesKpiValue}>
                    {formatINRChip(actuals.revenueInr)}
                  </Text>
                  <Text style={styles.salesKpiLabel}>
                    {periodSummary.rollupLabel} sales
                  </Text>
                </View>
                <View style={styles.salesKpiCard}>
                  <View style={styles.salesKpiIcon}>
                    <Target size={16} color={Theme.driverGold} />
                  </View>
                  <Text style={styles.salesKpiValue}>
                    {actuals.marginPct.toFixed(1)}%
                  </Text>
                  <Text style={styles.salesKpiLabel}>Actual margin</Text>
                </View>
                <View style={styles.salesKpiCard}>
                  <View style={styles.salesKpiIcon}>
                    <ArrowUpRight size={16} color="#F1416C" />
                  </View>
                  <Text style={styles.salesKpiValue}>
                    {targetsSetCount}/3
                  </Text>
                  <Text style={styles.salesKpiLabel}>Aggregate targets set</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      <NetworkDesktopEntityGoalWizard
        visible={goalWizardEntity != null}
        focus={activeFocus}
        entity={goalWizardEntity}
        client={goalWizardClient}
        selectedMonthKey={selectedMonthKey}
        goalsStore={goalsStore}
        trips={trips}
        saving={saving}
        onClose={() => setGoalWizardEntity(null)}
        onSave={saveGoalWizard}
      />
    </View>
  );
}
