/**
 * Goals tab — targets for clients, suppliers, vehicles, drivers;
 * payable/receivable balance widgets (Metronic reference layout).
 */
import Theme from "@/constants/Theme";
import { NetworkDesktopGoalsBalanceChart } from "@/features/network/components/desktop/NetworkDesktopGoalsBalanceChart";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  DEFAULT_NETWORK_ORG_GOALS,
  loadNetworkOrgGoals,
  patchGoalDimension,
  saveNetworkOrgGoals,
  type GoalDimension,
  type NetworkOrgGoals,
} from "@/features/network/services/networkGoalsStorage.service";
import {
  buildBalanceTrendPoints,
  buildGoalSummaryRows,
  buildTopEntityGoalRows,
  computeGoalsActuals,
  computePayableReceivableSnapshot,
  type GoalTargetRow,
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

const DATE_RANGES: { id: SalesDateRange; label: string }[] = [
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
  { id: "all", label: "All time" },
];

const BALANCE_PERIODS: { id: SalesDateRange; label: string }[] = [
  { id: "3m", label: "Month" },
  { id: "6m", label: "Quarter" },
  { id: "12m", label: "Year" },
  { id: "all", label: "All" },
];

const DIMENSIONS: { id: GoalDimension; label: string }[] = [
  { id: "client", label: "Clients" },
  { id: "supplier", label: "Suppliers" },
  { id: "vehicle", label: "Vehicles" },
  { id: "driver", label: "Drivers" },
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

function formatGoalValue(row: GoalTargetRow): string {
  if (row.unit === "trips") return String(Math.round(row.actual));
  return formatINRChip(row.actual);
}

function formatGoalTarget(row: GoalTargetRow): string {
  if (row.target <= 0) return "Not set";
  if (row.unit === "trips") return `${Math.round(row.target)} trips`;
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
          <Text style={styles.goalsTargetActual}>
            {formatGoalValue(row)}
          </Text>
          <Text style={styles.goalsTargetMeta} numberOfLines={2}>
            {hasTarget
              ? `${row.progressPct}% of ${formatGoalTarget(row)}`
              : "Set a monthly target to track progress."}
          </Text>
        </View>
        {editing ? (
          <View style={styles.goalsTargetEditCol}>
            <TextInput
              style={styles.goalsTargetInput}
              value={draft}
              onChangeText={onDraftChange}
              keyboardType="numeric"
              placeholder={row.unit === "trips" ? "Trips" : "INR"}
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
            {
              width: `${hasTarget ? Math.min(100, row.progressPct) : 8}%`,
            },
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
  const [dateRange, setDateRange] = useState<SalesDateRange>("6m");
  const [balancePeriod, setBalancePeriod] = useState<SalesDateRange>("6m");
  const [activeDimension, setActiveDimension] = useState<GoalDimension>("client");
  const [goals, setGoals] = useState<NetworkOrgGoals>(DEFAULT_NETWORK_ORG_GOALS);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [editingDimension, setEditingDimension] = useState<GoalDimension | null>(
    null,
  );
  const [draftTarget, setDraftTarget] = useState("");
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
    void loadNetworkOrgGoals(orgId).then((loaded) => {
      if (!cancelled) {
        setGoals(loaded);
        setGoalsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const actuals = useMemo(
    () => computeGoalsActuals(trips, dateRange),
    [trips, dateRange],
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
    () => buildBalanceTrendPoints(trips, balancePeriod),
    [trips, balancePeriod],
  );

  const summaryRows = useMemo(
    () => buildGoalSummaryRows(goals, actuals),
    [goals, actuals],
  );

  const topEntities = useMemo(
    () =>
      buildTopEntityGoalRows(
        activeDimension,
        clients,
        suppliers,
        drivers,
        vehicles,
        trips,
        dateRange,
        8,
      ),
    [
      activeDimension,
      clients,
      suppliers,
      drivers,
      vehicles,
      trips,
      dateRange,
    ],
  );

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

  const persistGoals = useCallback(
    async (next: NetworkOrgGoals) => {
      setSaving(true);
      setGoals(next);
      try {
        await saveNetworkOrgGoals(orgId, next);
      } finally {
        setSaving(false);
      }
    },
    [orgId],
  );

  const startEdit = (dimension: GoalDimension, current: number) => {
    setEditingDimension(dimension);
    setDraftTarget(current > 0 ? String(current) : "");
  };

  const saveEdit = async (dimension: GoalDimension) => {
    const parsed = Number(draftTarget.replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const next = patchGoalDimension(goals, dimension, parsed);
    await persistGoals(next);
    setEditingDimension(null);
    setDraftTarget("");
  };

  const dataLoading =
    tripsQ.isLoading ||
    txQ.isLoading ||
    clientsQ.isLoading ||
    suppliersQ.isLoading;

  return (
    <View style={styles.salesBody}>
      <View style={styles.splitRow}>
        <View style={styles.sidebar}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Goal filters</Text>
            <Text style={styles.salesFilterHint}>
              Period and focus for targets & balance
            </Text>

            <Text style={styles.salesFilterGroup}>Period</Text>
            <View style={styles.tagWrap}>
              {DATE_RANGES.map((range) => (
                <FilterChip
                  key={range.id}
                  label={range.label}
                  active={dateRange === range.id}
                  onPress={() => setDateRange(range.id)}
                />
              ))}
            </View>

            <Text style={styles.salesFilterGroup}>Focus</Text>
            <View style={styles.tagWrap}>
              {DIMENSIONS.map((dim) => (
                <FilterChip
                  key={dim.id}
                  label={dim.label}
                  active={activeDimension === dim.id}
                  onPress={() => setActiveDimension(dim.id)}
                />
              ))}
            </View>
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Target progress</Text>
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
                  {formatGoalValue(row)}
                  {row.target > 0 ? ` / ${formatGoalTarget(row)}` : ""}
                </Text>
              </View>
            ))}
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

        <View style={styles.mainCol}>
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
                    Receivable vs payable by month
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

              <View style={styles.goalsTargetGrid}>
                {summaryRows.map((row) => (
                  <GoalTargetCard
                    key={row.id}
                    row={row}
                    editing={editingDimension === row.dimension}
                    draft={draftTarget}
                    onDraftChange={setDraftTarget}
                    onStartEdit={() =>
                      startEdit(
                        row.dimension,
                        row.target,
                      )
                    }
                    onSave={() => void saveEdit(row.dimension)}
                    onCancel={() => {
                      setEditingDimension(null);
                      setDraftTarget("");
                    }}
                  />
                ))}
              </View>

              <View style={[styles.salesCard, styles.salesTableCard]}>
                <View style={styles.salesTableTitleRow}>
                  <View style={styles.salesTripTableTitleCol}>
                    <Text style={styles.salesCardTitle}>
                      {DIMENSIONS.find((d) => d.id === activeDimension)?.label}{" "}
                      breakdown
                    </Text>
                    <Text style={styles.salesTripTableSub}>
                      Top performers for selected period · tap pencil on goals
                      above to set targets
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

                <View style={styles.goalsEntityTableHead}>
                  <Text style={[styles.goalsEntityHeadCell, styles.goalsEntityNameCol]}>
                    Name
                  </Text>
                  <Text style={[styles.goalsEntityHeadCell, styles.goalsEntityMetaCol]}>
                    Activity
                  </Text>
                  <Text
                    style={[
                      styles.goalsEntityHeadCell,
                      styles.goalsEntityValueCol,
                      styles.salesGridNumHead,
                    ]}
                  >
                    {activeDimension === "client" || activeDimension === "supplier"
                      ? "Amount"
                      : "Trips"}
                  </Text>
                  <View style={styles.goalsEntityActionCol} />
                </View>

                {topEntities.length === 0 ? (
                  <View style={styles.salesTableEmpty}>
                    <Text style={styles.emptyText}>
                      No activity for this focus in the selected period.
                    </Text>
                  </View>
                ) : (
                  topEntities.map((entity, idx) => (
                    <View
                      key={entity.id}
                      style={[
                        styles.goalsEntityRow,
                        idx === topEntities.length - 1 &&
                          styles.salesTableRowLast,
                      ]}
                    >
                      <View style={styles.goalsEntityNameCol}>
                        <Text style={styles.goalsEntityName} numberOfLines={1}>
                          {entity.name}
                        </Text>
                      </View>
                      <View style={styles.goalsEntityMetaCol}>
                        <Text style={styles.goalsEntityMeta} numberOfLines={1}>
                          {entity.meta}
                        </Text>
                      </View>
                      <View style={styles.goalsEntityValueCol}>
                        <Text style={styles.goalsEntityValue} numberOfLines={1}>
                          {activeDimension === "client" ||
                          activeDimension === "supplier"
                            ? formatINRChip(entity.value)
                            : String(entity.trips)}
                        </Text>
                      </View>
                      <Pressable style={styles.goalsEntityActionCol}>
                        <Target size={14} color={METRONIC.muted} />
                      </Pressable>
                    </View>
                  ))
                )}

                {topEntities.length > 0 ? (
                  <Pressable style={styles.goalsViewMore}>
                    <Text style={styles.goalsViewMoreText}>
                      View all {DIMENSIONS.find((d) => d.id === activeDimension)?.label?.toLowerCase()}
                    </Text>
                  </Pressable>
                ) : null}
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
                    {formatINRChip(actuals.clientSales)}
                  </Text>
                  <Text style={styles.salesKpiLabel}>Period sales</Text>
                </View>
                <View style={styles.salesKpiCard}>
                  <View style={styles.salesKpiIcon}>
                    <ArrowUpRight size={16} color="#F1416C" />
                  </View>
                  <Text style={styles.salesKpiValue}>
                    {formatINRChip(balanceSnapshot.totalPayable)}
                  </Text>
                  <Text style={styles.salesKpiLabel}>Open payable</Text>
                </View>
                <View style={styles.salesKpiCard}>
                  <View style={styles.salesKpiIcon}>
                    <Target size={16} color={Theme.driverGold} />
                  </View>
                  <Text style={styles.salesKpiValue}>
                    {summaryRows.filter((r) => r.target > 0).length}/4
                  </Text>
                  <Text style={styles.salesKpiLabel}>Targets set</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
