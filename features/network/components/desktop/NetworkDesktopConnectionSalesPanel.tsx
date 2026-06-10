/**
 * Connection sales tab — Metronic BI-style layout with left filters, KPI widgets,
 * cross-filtered charts, and paginated partner table with review metrics.
 */
import Theme from "@/constants/Theme";
import {
  ConnectionsView,
  type ConnectedOrg,
} from "@/features/network/components/ConnectionsView";
import { NetworkDesktopSalesBarChart } from "@/features/network/components/desktop/NetworkDesktopSalesBarChart";
import { SalesSidebarPartnerAvatar } from "@/features/network/components/desktop/NetworkDesktopSalesTableCells";
import { NetworkDesktopConnectionSalesTripsTable } from "@/features/network/components/desktop/NetworkDesktopConnectionSalesTripsTable";
import { NetworkDesktopSalesGrowWidget } from "@/features/network/components/desktop/NetworkDesktopSalesGrowWidget";
import { NetworkDesktopSalesDonut } from "@/features/network/components/desktop/NetworkDesktopSalesDonut";
import { NetworkDesktopSalesLineChart } from "@/features/network/components/desktop/NetworkDesktopSalesLineChart";
import { NetworkDesktopSalesStars } from "@/features/network/components/desktop/NetworkDesktopSalesStars";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import {
  buildDestinationBarItems,
  buildLaneSlices,
  buildMonthlyTripTrend,
  buildOriginBarItems,
  buildPartnerBarItems,
  buildRoleSlices,
  buildSalesTableRows,
  computeSalesKpis,
  defaultSalesFilters,
  hasActiveCrossFilters,
  type SalesCrossFilters,
  type SalesDateRange,
  type SalesRoleFilter,
  uniqueLanes,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import { formatINRChip } from "@/lib/format";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { NetworkExportMenu } from "@/features/network/components/desktop/NetworkExportMenu";
import {
  exportConnectionSalesExcel,
  exportConnectionSalesPdf,
} from "@/features/network/lib/networkExport.util";
import {
  LayoutGrid,
  MoreVertical,
  Star,
  TrendingUp,
  Users,
} from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";

type Props = {
  orgId: string;
  onOpenProfile: (item: ConnectedOrg) => void;
  onOpenDiscoverProfile?: (org: DiscoverOrg) => void;
  onGoToGrowTab?: () => void;
  inviteDailyCapReached?: boolean;
};

const DATE_RANGES: { id: SalesDateRange; label: string }[] = [
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
  { id: "all", label: "All time" },
];

const ROLE_OPTIONS: { id: SalesRoleFilter; label: string }[] = [
  { id: "CLIENT", label: "Clients" },
  { id: "SUPPLIER", label: "Suppliers" },
];

const RATING_OPTIONS = [
  { min: 3, label: "3+ stars" },
  { min: 4, label: "4+ stars" },
  { min: 5, label: "5 stars" },
];

function laneChipLabel(lane: string): string {
  if (lane.length <= 24) return lane;
  return `${lane.slice(0, 22)}…`;
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

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

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
}) {
  return (
    <View style={styles.salesKpiCard}>
      <View style={styles.salesKpiIcon}>{icon}</View>
      <Text style={styles.salesKpiValue}>{value}</Text>
      <Text style={styles.salesKpiLabel}>{label}</Text>
      {sub ? <Text style={styles.salesKpiSub}>{sub}</Text> : null}
    </View>
  );
}

export function NetworkDesktopConnectionSalesPanel({
  orgId,
  onOpenProfile,
  onOpenDiscoverProfile,
  onGoToGrowTab,
  inviteDailyCapReached = false,
}: Props) {
  const [connections, setConnections] = useState<ConnectedOrg[]>([]);
  const [trendChartWidth, setTrendChartWidth] = useState(320);
  const [originChartWidth, setOriginChartWidth] = useState(200);
  const [destChartWidth, setDestChartWidth] = useState(200);
  const [filters, setFilters] = useState<SalesCrossFilters>(defaultSalesFilters);
  const [tableSearch, setTableSearch] = useState("");
  const [partnerBarFilter, setPartnerBarFilter] = useState<string | null>(null);

  const tripsQ = useTripsQuery(orgId);
  const trips = tripsQ.data ?? [];

  const mergedFilters = useMemo(
    (): SalesCrossFilters => ({ ...filters, search: tableSearch }),
    [filters, tableSearch],
  );

  const lanes = useMemo(
    () => uniqueLanes(connections, trips, mergedFilters),
    [connections, trips, mergedFilters],
  );
  const trend = useMemo(
    () => buildMonthlyTripTrend(connections, trips, mergedFilters),
    [connections, trips, mergedFilters],
  );
  const laneSlices = useMemo(
    () => buildLaneSlices(connections, trips, mergedFilters),
    [connections, trips, mergedFilters],
  );
  const originBars = useMemo(
    () => buildOriginBarItems(connections, trips, mergedFilters, 5),
    [connections, trips, mergedFilters],
  );
  const destinationBars = useMemo(
    () => buildDestinationBarItems(connections, trips, mergedFilters, 5),
    [connections, trips, mergedFilters],
  );
  const partnerBars = useMemo(
    () => buildPartnerBarItems(connections, trips, mergedFilters, 6),
    [connections, trips, mergedFilters],
  );
  const roleSlices = useMemo(
    () => buildRoleSlices(connections, trips, mergedFilters),
    [connections, trips, mergedFilters],
  );
  const kpis = useMemo(
    () => computeSalesKpis(connections, trips, mergedFilters),
    [connections, trips, mergedFilters],
  );
  const tableRows = useMemo(
    () => buildSalesTableRows(connections, trips, mergedFilters),
    [connections, trips, mergedFilters],
  );

  const filtersActive = hasActiveCrossFilters(mergedFilters);

  const patchFilters = (patch: Partial<SalesCrossFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const clearFilters = () => {
    setFilters(defaultSalesFilters());
    setTableSearch("");
    setPartnerBarFilter(null);
  };

  const handlePartnerBarSelect = (key: string | null) => {
    if (!key) {
      setPartnerBarFilter(null);
      setTableSearch("");
      return;
    }
    const partner = partnerBars.find((item) => item.key === key);
    setPartnerBarFilter(key);
    setTableSearch(partner?.label ?? "");
  };

  return (
    <View style={styles.salesBody}>
      <View style={styles.splitRow}>
        <View style={styles.sidebar}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Intelligent filters</Text>
            <Text style={styles.salesFilterHint}>
              Cross-filter charts and table like Power BI
            </Text>

            <Text style={styles.salesFilterGroup}>Period</Text>
            <View style={styles.tagWrap}>
              {DATE_RANGES.map((range) => (
                <FilterChip
                  key={range.id}
                  label={range.label}
                  active={filters.dateRange === range.id}
                  onPress={() => patchFilters({ dateRange: range.id })}
                />
              ))}
            </View>

            <Text style={styles.salesFilterGroup}>Role</Text>
            <View style={styles.tagWrap}>
              {ROLE_OPTIONS.map((role) => (
                <FilterChip
                  key={role.id}
                  label={role.label}
                  active={filters.roles.has(role.id)}
                  onPress={() =>
                    patchFilters({
                      roles: toggleSet(filters.roles, role.id),
                      roleSlice: null,
                    })
                  }
                />
              ))}
            </View>

            <Text style={styles.salesFilterGroup}>Status</Text>
            <View style={styles.tagWrap}>
              <FilterChip
                label="Integrated"
                active={filters.statuses.has("integrated")}
                onPress={() =>
                  patchFilters({
                    statuses: toggleSet(filters.statuses, "integrated"),
                  })
                }
              />
              <FilterChip
                label="Invite"
                active={filters.statuses.has("invite")}
                onPress={() =>
                  patchFilters({
                    statuses: toggleSet(filters.statuses, "invite"),
                  })
                }
              />
            </View>

            <Text style={styles.salesFilterGroup}>Review</Text>
            <View style={styles.tagWrap}>
              {RATING_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.min}
                  label={opt.label}
                  active={filters.minRating === opt.min}
                  onPress={() =>
                    patchFilters({
                      minRating:
                        filters.minRating === opt.min ? null : opt.min,
                    })
                  }
                />
              ))}
            </View>

            {lanes.length > 0 ? (
              <>
                <Text style={styles.salesFilterGroup}>Lanes</Text>
                <View style={styles.tagWrap}>
                  {lanes.slice(0, 12).map((lane) => (
                    <FilterChip
                      key={lane}
                      label={laneChipLabel(lane)}
                      active={filters.lanes.has(lane)}
                      onPress={() =>
                        patchFilters({
                          lanes: toggleSet(filters.lanes, lane),
                          laneSlice: null,
                        })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.salesSidebarToggleRow}>
              <Text style={styles.salesSidebarToggleLabel}>
                Only partners with trips
              </Text>
              <Switch
                value={filters.onlyWithTrips}
                onValueChange={(v) => patchFilters({ onlyWithTrips: v })}
                trackColor={{
                  false: METRONIC.border,
                  true: "rgba(62, 151, 255, 0.35)",
                }}
                thumbColor={
                  filters.onlyWithTrips ? METRONIC.link : Theme.cardWhite
                }
              />
            </View>

            {filtersActive ? (
              <Pressable onPress={clearFilters} style={styles.salesClearBtn}>
                <Text style={styles.salesClearBtnText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Top contributors</Text>
            {tableRows.slice(0, 4).map((row, idx) => (
              <Pressable
                key={row.id}
                style={[
                  styles.salesContributorRow,
                  idx === Math.min(3, tableRows.length - 1) &&
                    styles.salesContributorRowLast,
                ]}
                onPress={() => onOpenProfile(row.connection)}
              >
                <SalesSidebarPartnerAvatar row={row} />
                <View style={styles.salesContributorTextCol}>
                  <Text style={styles.salesContributorName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={styles.salesContributorMeta}>
                    {row.trips} trips ·{" "}
                    {row.role === "CLIENT" ? "Sales" : "Cost"}{" "}
                    {formatINRChip(row.revenue)}
                  </Text>
                </View>
                <NetworkDesktopSalesStars
                  filledStars={row.filledStars}
                  size={9}
                />
              </Pressable>
            ))}
            {tableRows.length === 0 ? (
              <Text style={styles.salesEmptySide}>No partners match filters.</Text>
            ) : null}
          </View>

          <NetworkDesktopSalesGrowWidget
            orgId={orgId}
            activeLanes={
              mergedFilters.lanes.size > 0
                ? [...mergedFilters.lanes]
                : lanes.slice(0, 6)
            }
            onOpenProfile={onOpenDiscoverProfile}
            onViewAllGrow={onGoToGrowTab}
            inviteDailyCapReached={inviteDailyCapReached}
          />
        </View>

        <View style={styles.mainCol}>
          <View style={styles.salesKpiRow}>
            <KpiCard
              label="Total trips"
              value={String(kpis.totalTrips)}
              sub={
                filters.monthKey
                  ? `Filtered month`
                  : `${kpis.activePartners} partners`
              }
              icon={<TrendingUp size={16} color={METRONIC.link} />}
            />
            <KpiCard
              label="Sales"
              value={formatINRChip(kpis.totalSales)}
              sub={
                kpis.totalCost > 0 || kpis.totalMargin !== 0
                  ? `Cost ${formatINRChip(kpis.totalCost)} · Margin ${formatINRChip(kpis.totalMargin)}`
                  : kpis.topLane
                    ? `${kpis.laneCount} lanes · top: ${kpis.topLane.split(" → ")[0]}`
                    : undefined
              }
              icon={<LayoutGrid size={16} color="#50CD89" />}
            />
            <KpiCard
              label="Avg review"
              value={
                kpis.avgRating != null ? `${kpis.avgRating.toFixed(1)}` : "—"
              }
              sub={
                kpis.avgStars > 0 ? (
                  `${kpis.avgStars} star avg`
                ) : (
                  "No ratings yet"
                )
              }
              icon={<Star size={16} color={Theme.driverGold} fill={Theme.driverGold} />}
            />
            <KpiCard
              label="Integrated"
              value={`${kpis.integratedPct}%`}
              sub="Live connections"
              icon={<Users size={16} color={METRONIC.subtle} />}
            />
          </View>

          <View style={styles.salesWidgetRow}>
            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesWidgetTrend,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Sale trends</Text>
                <NetworkExportMenu
                  actions={[
                    {
                      label: "Export Sales Excel",
                      sublabel: "Partners, margins, trip counts",
                      kind: "excel",
                      onExport: () => exportConnectionSalesExcel(tableRows, kpis, "Your workspace", filters.dateRange ?? "All time"),
                    },
                    {
                      label: "Export Sales PDF",
                      sublabel: "Print-ready partner report",
                      kind: "pdf",
                      onExport: () => exportConnectionSalesPdf(tableRows, kpis, "Your workspace", filters.dateRange ?? "All time"),
                    },
                  ]}
                  triggerStyle={styles.salesCardMenu}
                />
              </View>
              <Text style={styles.salesWidgetSub}>
                Client sales by month · tap to cross-filter
              </Text>
              <View
                style={styles.salesWidgetChartBody}
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width);
                  if (w > 0 && w !== trendChartWidth) setTrendChartWidth(w);
                }}
              >
                <NetworkDesktopSalesLineChart
                  data={trend}
                  width={trendChartWidth}
                  height={132}
                  activeMonthKey={filters.monthKey}
                  onSelectMonth={(monthKey) =>
                    patchFilters({ monthKey })
                  }
                />
              </View>
            </View>

            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesWidgetDonut,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Lane mix</Text>
              </View>
              <View style={styles.salesWidgetDonutBody}>
                <NetworkDesktopSalesDonut
                  slices={laneSlices}
                  activeLabel={filters.laneSlice}
                  onSelectLabel={(label) =>
                    patchFilters({ laneSlice: label })
                  }
                  emptyMessage="No lane trips yet."
                />
              </View>
            </View>

            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesWidgetDonut,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>By role</Text>
              </View>
              <Text style={styles.salesWidgetSub}>
                Client sales vs supplier cost
              </Text>
              <View style={styles.salesWidgetDonutBody}>
                <NetworkDesktopSalesDonut
                  slices={roleSlices}
                  activeLabel={
                    filters.roleSlice === "CLIENT"
                      ? "Clients"
                      : filters.roleSlice === "SUPPLIER"
                        ? "Suppliers"
                        : null
                  }
                  onSelectLabel={(label) =>
                    patchFilters({
                      roleSlice:
                        label === "Clients"
                          ? "CLIENT"
                          : label === "Suppliers"
                            ? "SUPPLIER"
                            : null,
                    })
                  }
                  emptyMessage="No role split yet."
                />
              </View>
            </View>
          </View>

          <View style={styles.salesBarRow}>
            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesBarPartner,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Partner contribution</Text>
              </View>
              <Text style={styles.salesWidgetSub}>
                Sales (clients) & cost (suppliers) · tap to filter
              </Text>
              <NetworkDesktopSalesBarChart
                items={partnerBars}
                orientation="horizontal"
                activeKey={partnerBarFilter}
                onSelectKey={handlePartnerBarSelect}
                emptyMessage="No partner trips in range."
                footerText="Trip-weighted share · tap a partner to filter trips"
              />
            </View>

            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesBarOrigin,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Origins</Text>
              </View>
              <Text style={styles.salesWidgetSub}>Pickup lanes</Text>
              <View
                style={styles.salesWidgetChartBody}
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width);
                  if (w > 0 && w !== originChartWidth) setOriginChartWidth(w);
                }}
              >
                <NetworkDesktopSalesBarChart
                  items={originBars}
                  orientation="vertical"
                  width={originChartWidth}
                  height={128}
                  activeKey={filters.originSlice}
                  onSelectKey={(key) =>
                    patchFilters({ originSlice: key })
                  }
                  emptyMessage="No origin data."
                />
              </View>
            </View>

            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesBarDest,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Destinations</Text>
              </View>
              <Text style={styles.salesWidgetSub}>Drop lanes</Text>
              <View
                style={styles.salesWidgetChartBody}
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width);
                  if (w > 0 && w !== destChartWidth) setDestChartWidth(w);
                }}
              >
                <NetworkDesktopSalesBarChart
                  items={destinationBars}
                  orientation="vertical"
                  width={destChartWidth}
                  height={128}
                  activeKey={filters.destinationSlice}
                  onSelectKey={(key) =>
                    patchFilters({ destinationSlice: key })
                  }
                  emptyMessage="No destination data."
                />
              </View>
            </View>
          </View>

          <NetworkDesktopConnectionSalesTripsTable
            connections={connections}
            trips={trips}
            filters={mergedFilters}
          />
        </View>
      </View>

      <View style={styles.hiddenDataBridge} pointerEvents="none">
        <ConnectionsView
          orgId={orgId}
          embedded
          hubMode
          hubSearch=""
          hubFilter="ALL"
          onConnectionsComputed={setConnections}
        />
      </View>
    </View>
  );
}
