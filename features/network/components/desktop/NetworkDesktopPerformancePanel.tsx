/**
 * Hub Performance tab — the future unified Target vs Actual / cross-filtered
 * analytics page (Goals + Sales + Asset merge).
 *
 * Phase 1, Commit 1 (route proof): a spinner, nothing else.
 * Phase 1, Commit 2: the PerformanceCrossFilter/perspective state model,
 *   declared but unwired.
 * Phase 1, Commit 3: data pipeline + dashboard shell. Wired the data hooks
 *   and existing analytics util functions Goals already uses, rendered the
 *   locked visual hierarchy, KAM/Region/Supplier breakdown groupings and
 *   cross-filter interaction deliberately deferred.
 * Phase 1, Commit 4: the analytical correctness layer -- Period Target,
 *   Target-to-date, Achievement %, Pacing %, vs Previous Period, Variance
 *   (connectionGoalsAnalytics.util.ts, 37 unit tests), proven correct
 *   against a fixed, unfiltered dataset.
 * Phase 1, Commit 5 (this commit): the cross-filter engine. One shared
 *   PerformanceCrossFilter (moved into connectionGoalsAnalytics.util.ts,
 *   where the filtering functions live, so there's no panel -> util ->
 *   panel dependency loop) now actually narrows the trip/client dataset
 *   every visual below reads from -- KPI band, trend, and breakdown all
 *   recalculate from the SAME filteredTrips/clientIdSet, not three
 *   independent filters. Perspective is unaffected by clicking a
 *   cross-filter -- clicking a client row narrows the filter context, it
 *   never switches which breakdown is showing.
 *
 *   Only the Client breakdown table has real rows today (KAM/Region/
 *   Supplier/Asset grouping lands in Commit 6), so clicking a row to
 *   cross-filter is wired there; the underlying pipeline
 *   (resolveClientIdsForFilter / filterTripsForCrossFilter /
 *   resolveFilteredPeriodTarget) already handles all six dimensions
 *   correctly and is unit-tested for each, independent of whether a
 *   clickable row exists for it yet.
 *
 *   Payable has no valid KAM/Region/Client attribution (supplier/driver
 *   dues aren't assigned to a KAM or region) -- isPayableAffectedByFilter()
 *   encodes exactly when a "Not affected by this filter" label would be
 *   needed; no Receivable/Payable KPI card exists in this dashboard yet
 *   (Commits 3-4 never added one), so this is tested at the pipeline level
 *   without a UI card to attach it to.
 *
 * Phase 1, Commit 6 (this commit): KAM/Region/Supplier/Asset breakdowns
 *   now show real rows, using the SAME filteredTrips/filteredClients the
 *   KPI band already computes -- no separate analytics calculation. Only
 *   entities with an actual matching trip appear (suppliers/KAMs/regions/
 *   assets that merely exist in the org roster don't clutter the table).
 *   Clicking any breakdown row cross-filters the page (same toggle pattern
 *   as Client); it never switches the active perspective. One shared
 *   NetworkDesktopEntityProgressModal (not six modal designs) opens on
 *   "View progress", fed the already-computed KPI row and the entity's own
 *   already-filtered trips -- it never recalculates anything, and closing
 *   it never touches PerformanceCrossFilter, so the page's cross-filter
 *   context is exactly what it was before the modal opened.
 *
 * Phase 2, Commit 3 (this commit): period-scoped breakdown Actuals + entity
 *   Progress pacing. One shared periodScopedFilteredTrips
 *   (periodBounds + tripsInDateRange on filteredTrips) feeds KAM/Region/
 *   Supplier/Asset builders so entity Actuals match the selected Month/
 *   Quarter/Year (they previously summed all-time trips). Progress modal
 *   KPIs now go through buildPerformanceKpiRow (same as the top band) so
 *   KAM/Region/Client/Asset get Target-to-date/Pacing when a real target
 *   exists; Supplier stays target=0 with no fabricated pacing.
 *
 *   Still deliberately deferred: Contribution %, utilisation/idle days,
 *   supplier target model, target allocation UI, richer trip-evidence UX,
 *   import, major visual redesign, new Supabase queries/RPCs.
 */
import Theme from "@/constants/Theme";
import {
  DEFAULT_NETWORK_GOALS_STORE,
  loadNetworkGoalsStore,
  type NetworkGoalsStore,
} from "@/features/network/services/networkGoalsStorage.service";
import {
  buildAssetBreakdown,
  buildEntityGoalRows,
  buildKamBreakdown,
  buildPerformanceKpiRow,
  buildPerformanceTripEvidenceRows,
  buildRegionBreakdown,
  buildSupplierBreakdown,
  computeGoalsActualsForRollup,
  computePreviousPeriodActuals,
  computeTripMetrics,
  EMPTY_PERFORMANCE_CROSS_FILTER,
  filterTripsForCrossFilter,
  getRecentMonthKeys,
  periodBounds,
  previousPeriodTripWindow,
  resolveClientIdsForFilter,
  resolveFilteredPeriodTarget,
  rollupLabel,
  tripsInDateRange,
  type EntityGoalRow,
  type GoalsRollup,
  type PerformanceCommercialBreakdownRow,
  type PerformanceCrossFilter,
  type PerformanceKpiRow,
  type PerformanceOperationalBreakdownRow,
  type PerformancePerspective,
  type PerformanceTripEvidenceRow,
} from "@/features/network/utils/connectionGoalsAnalytics.util";
import {
  NetworkDesktopEntityProgressModal,
  type EntityProgressKind,
} from "@/features/network/components/desktop/NetworkDesktopEntityProgressModal";
import { formatINRChip } from "@/lib/format";
import { canAccessClients, canAccessDrivers, canAccessSuppliers } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useOrgMembersQuery } from "@/lib/queries/useOrgMembersQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { useVehiclesQuery } from "@/lib/queries/useVehiclesQuery";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { X } from "lucide-react-native";

const ROLLUPS: { id: GoalsRollup; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

const PERSPECTIVES: {
  id: PerformancePerspective;
  label: string;
  requires?: "clients" | "suppliers" | "drivers";
}[] = [
  { id: "aggregate", label: "Aggregate" },
  { id: "kam", label: "KAM", requires: "clients" },
  { id: "client", label: "Client", requires: "clients" },
  { id: "region", label: "Region", requires: "clients" },
  { id: "supplier", label: "Supplier", requires: "suppliers" },
  { id: "asset", label: "Asset", requires: "drivers" },
];

function entityLabel(kind: EntityProgressKind): string {
  if (kind === "kam") return "KAM";
  if (kind === "region") return "Region";
  if (kind === "supplier") return "Supplier";
  if (kind === "asset") return "Asset";
  return "Client";
}

function formatKpiValue(unit: PerformanceKpiRow["unit"], value: number): string {
  if (unit === "trips") return String(Math.round(value));
  if (unit === "pct") return `${value.toFixed(1)}%`;
  return formatINRChip(value);
}

type Props = {
  orgId: string;
};

export function NetworkDesktopPerformancePanel({ orgId }: Props) {
  const capabilities = useCapabilities();
  const availablePerspectives = useMemo(
    () =>
      PERSPECTIVES.filter((p) => {
        if (p.requires === "clients") return canAccessClients(capabilities);
        if (p.requires === "suppliers") return canAccessSuppliers(capabilities);
        if (p.requires === "drivers") return canAccessDrivers(capabilities);
        return true;
      }),
    [capabilities],
  );

  // Perspective (view mode) and crossFilter (the shared filter context) are
  // deliberately independent state -- selecting a perspective must never
  // itself change or clear the active cross-filter, and vice versa.
  const [perspective, setPerspective] = useState<PerformancePerspective>("aggregate");
  const [crossFilter, setCrossFilter] = useState<PerformanceCrossFilter>(
    EMPTY_PERFORMANCE_CROSS_FILTER,
  );
  const hasActiveCrossFilter =
    crossFilter.kamId != null ||
    crossFilter.regionId != null ||
    crossFilter.clientId != null ||
    crossFilter.supplierId != null ||
    crossFilter.assetId != null;
  const clearAllFilters = () => setCrossFilter(EMPTY_PERFORMANCE_CROSS_FILTER);
  const toggleFilter = (
    field: "kamId" | "regionId" | "clientId" | "supplierId" | "assetId",
    value: string,
  ) =>
    setCrossFilter((prev) => ({
      ...prev,
      [field]: prev[field] === value ? null : value,
    }));
  const toggleClientFilter = (clientId: string) => toggleFilter("clientId", clientId);

  // Asset perspective's own Vehicle/Driver sub-focus -- a view detail, not a
  // cross-filter dimension, mirroring NetworkDesktopAssetSalesPanel's own
  // driver/vehicle toggle.
  const [assetFocus, setAssetFocus] = useState<"vehicle" | "driver">("vehicle");

  const [progressEntity, setProgressEntity] = useState<{
    kind: EntityProgressKind;
    id: string;
    name: string;
  } | null>(null);

  const monthOptions = useMemo(() => getRecentMonthKeys(6), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(
    () => monthOptions[monthOptions.length - 1] ?? getRecentMonthKeys(1)[0],
  );
  const [rollup, setRollup] = useState<GoalsRollup>("month");

  const [goalsStore, setGoalsStore] = useState<NetworkGoalsStore>(
    DEFAULT_NETWORK_GOALS_STORE,
  );
  useEffect(() => {
    let cancelled = false;
    void loadNetworkGoalsStore(orgId).then((loaded) => {
      if (!cancelled) setGoalsStore(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const tripsQ = useTripsQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const vehiclesQ = useVehiclesQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const orgMembersQ = useOrgMembersQuery(orgId);

  const trips = tripsQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const drivers = driversQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const orgMembers = orgMembersQ.data?.members ?? [];

  const kamById = useMemo(
    () => new Map(orgMembers.filter((m) => m.role !== "driver").map((m) => [m.user_id, { name: m.full_name ?? "KAM" }])),
    [orgMembers],
  );
  const supplierById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, { name: s.name ?? s.company_name ?? "Supplier" }])),
    [suppliers],
  );
  const vehicleById = useMemo(
    () => new Map(vehicles.map((v) => [v.id, { name: v.vehicle_number ?? "Vehicle" }])),
    [vehicles],
  );
  const driverById = useMemo(
    () => new Map(drivers.map((d) => [d.id, { name: d.name ?? "Driver" }])),
    [drivers],
  );

  // Stable per mount -- a dashboard shell doesn't need a live-ticking clock;
  // revisit if a specific need for intra-session freshness surfaces.
  const asOf = useMemo(() => new Date(), []);

  // ── The one filtering pipeline every visual below reads from ──────────────
  // Raw cached data -> clientIdSet -> filteredTrips/filteredClients -> every
  // KPI/trend/breakdown calculation. With an empty crossFilter, clientIdSet
  // is null and filterTripsForCrossFilter returns the exact input reference
  // -- the "no cross-filter" case is identical to the pre-Performance,
  // unfiltered calculation (proven in the regression test).
  const clientIdSet = useMemo(
    () => resolveClientIdsForFilter(crossFilter, clients, goalsStore.kamAssignments, goalsStore.clientRegions),
    [crossFilter, clients, goalsStore],
  );
  const filteredTrips = useMemo(
    () => filterTripsForCrossFilter(trips, crossFilter, clientIdSet),
    [trips, crossFilter, clientIdSet],
  );
  const filteredClients = useMemo(
    () => (clientIdSet == null ? clients : clients.filter((c) => clientIdSet.has(c.id))),
    [clients, clientIdSet],
  );

  const actuals = useMemo(
    () => computeGoalsActualsForRollup(filteredTrips, selectedMonthKey, rollup),
    [filteredTrips, selectedMonthKey, rollup],
  );

  const periodTarget = useMemo(
    () => resolveFilteredPeriodTarget(goalsStore, selectedMonthKey, rollup, crossFilter, clientIdSet),
    [goalsStore, selectedMonthKey, rollup, crossFilter, clientIdSet],
  );

  const previousActuals = useMemo(
    () => computePreviousPeriodActuals(filteredTrips, selectedMonthKey, rollup, asOf),
    [filteredTrips, selectedMonthKey, rollup, asOf],
  );
  // The previous period's trip list itself (not just the aggregated
  // totals) -- the KAM/Region/Supplier/Asset breakdowns need it per-entity
  // for their own Previous period/Growth columns, same window as above.
  const previousFilteredTrips = useMemo(
    () => previousPeriodTripWindow(filteredTrips, selectedMonthKey, rollup, asOf),
    [filteredTrips, selectedMonthKey, rollup, asOf],
  );

  // Phase 2 Commit 3 fix: buildKamBreakdown/buildRegionBreakdown/
  // buildSupplierBreakdown/buildAssetBreakdown only ever grouped/summed
  // whatever trips they were given -- selectedMonthKey/rollup were used
  // ONLY for the target sum, never to scope the trips themselves. Fed
  // filteredTrips (cross-filter-scoped only, otherwise all-time, per
  // useTripsQuery's own "full list, no pagination" contract) directly,
  // that meant every breakdown row's actualRevenue/actualTrips silently
  // included trips from outside the selected period -- inconsistent with
  // the KPI band above (computeGoalsActualsForRollup) and with
  // previousActualRevenue in the SAME rows (previousFilteredTrips already
  // window-scoped). One shared periodBounds/tripsInDateRange application
  // here, reused by all four breakdown builders below, so every one of
  // them reads the identical period-scoped population.
  const periodScopedFilteredTrips = useMemo(() => {
    const { start, end } = periodBounds(selectedMonthKey, rollup);
    return tripsInDateRange(filteredTrips, start, end);
  }, [filteredTrips, selectedMonthKey, rollup]);

  const kpiRows: PerformanceKpiRow[] = useMemo(
    () => [
      buildPerformanceKpiRow(
        "Sales revenue",
        "inr",
        actuals.revenueInr,
        periodTarget.revenueInr,
        previousActuals.revenueInr,
        selectedMonthKey,
        rollup,
        asOf,
      ),
      buildPerformanceKpiRow(
        "Trips",
        "trips",
        actuals.tripCount,
        periodTarget.tripCount,
        previousActuals.tripCount,
        selectedMonthKey,
        rollup,
        asOf,
      ),
      buildPerformanceKpiRow(
        "Margin",
        "pct",
        actuals.marginPct,
        periodTarget.marginPct,
        previousActuals.marginPct,
        selectedMonthKey,
        rollup,
        asOf,
      ),
    ],
    [actuals, periodTarget, previousActuals, selectedMonthKey, rollup, asOf],
  );
  const revenueRow = kpiRows[0];

  // Aggregate and Client share the same client-focus breakdown. Every
  // breakdown below reads filteredTrips/filteredClients -- the same
  // dataset the KPI band uses -- so a KAM/Region filter set elsewhere
  // narrows these tables too, not just the entity-level ones.
  const showsClientBreakdown = perspective === "aggregate" || perspective === "client";
  const entityRows: EntityGoalRow[] = useMemo(() => {
    if (!showsClientBreakdown) return [];
    return buildEntityGoalRows(
      "client",
      goalsStore,
      filteredClients,
      drivers,
      vehicles,
      filteredTrips,
      selectedMonthKey,
      rollup,
      12,
    );
  }, [showsClientBreakdown, goalsStore, filteredClients, drivers, vehicles, filteredTrips, selectedMonthKey, rollup]);

  const kamRows: PerformanceCommercialBreakdownRow[] = useMemo(() => {
    if (perspective !== "kam") return [];
    return buildKamBreakdown(
      goalsStore,
      periodScopedFilteredTrips,
      previousFilteredTrips,
      kamById,
      selectedMonthKey,
      rollup,
    );
  }, [perspective, goalsStore, periodScopedFilteredTrips, previousFilteredTrips, kamById, selectedMonthKey, rollup]);

  const regionRows: PerformanceCommercialBreakdownRow[] = useMemo(() => {
    if (perspective !== "region") return [];
    return buildRegionBreakdown(
      goalsStore,
      periodScopedFilteredTrips,
      previousFilteredTrips,
      selectedMonthKey,
      rollup,
    );
  }, [perspective, goalsStore, periodScopedFilteredTrips, previousFilteredTrips, selectedMonthKey, rollup]);

  const supplierRows: PerformanceOperationalBreakdownRow[] = useMemo(() => {
    if (perspective !== "supplier") return [];
    return buildSupplierBreakdown(periodScopedFilteredTrips, previousFilteredTrips, supplierById);
  }, [perspective, periodScopedFilteredTrips, previousFilteredTrips, supplierById]);

  const assetRows: PerformanceOperationalBreakdownRow[] = useMemo(() => {
    if (perspective !== "asset") return [];
    const byId = assetFocus === "vehicle" ? vehicleById : driverById;
    return buildAssetBreakdown(periodScopedFilteredTrips, previousFilteredTrips, assetFocus, byId);
  }, [perspective, periodScopedFilteredTrips, previousFilteredTrips, assetFocus, vehicleById, driverById]);

  // Portfolio (KAM/Region Progress modal only) -- clients under whichever
  // KAM/region is currently open in the modal, reusing the same
  // buildEntityGoalRows("client", ...) the Aggregate/Client breakdown
  // already calls, scoped to that entity's own client-id set.
  const progressPortfolioClients: EntityGoalRow[] | undefined = useMemo(() => {
    if (!progressEntity || (progressEntity.kind !== "kam" && progressEntity.kind !== "region")) {
      return undefined;
    }
    const scopedClients = clients.filter((c) =>
      progressEntity.kind === "kam"
        ? goalsStore.kamAssignments[c.id] === progressEntity.id
        : goalsStore.clientRegions[c.id] === progressEntity.id,
    );
    const scopedClientIds = new Set(scopedClients.map((c) => c.id));
    const scopedTrips = filteredTrips.filter((t) => t.client_id && scopedClientIds.has(t.client_id));
    return buildEntityGoalRows(
      "client",
      goalsStore,
      scopedClients,
      drivers,
      vehicles,
      scopedTrips,
      selectedMonthKey,
      rollup,
      50,
    );
  }, [progressEntity, clients, goalsStore, filteredTrips, drivers, vehicles, selectedMonthKey, rollup]);

  // The entity's own trips for the Progress modal's evidence table -- matches
  // whichever kind/id is open, scoped within filteredTrips (the page's
  // current cross-filter) AND the selected Month/Quarter/Year period.
  //
  // Phase 2 Commit 1 fix: filteredTrips only applies the cross-filter
  // dimensions -- the period itself was never applied to this array (only
  // to the KPI aggregation, via computeGoalsActualsForRollup internally).
  // Without this, the evidence table/download would silently include trips
  // from outside the selected period. tripsInDateRange + periodBounds are
  // both already used/tested elsewhere in this pipeline -- composed here,
  // not reimplemented.
  const progressEntityTrips = useMemo(() => {
    if (!progressEntity) return [];
    const { kind, id } = progressEntity;
    const withinKind = (() => {
      if (kind === "client") return filteredTrips.filter((t) => t.client_id === id);
      if (kind === "supplier") return filteredTrips.filter((t) => t.supplier_id === id);
      if (kind === "asset") {
        return filteredTrips.filter((t) => t.vehicle_id === id || t.driver_id === id);
      }
      // kam / region -- every trip belonging to any client under this entity
      const scopedClientIds = new Set(
        clients
          .filter((c) =>
            kind === "kam" ? goalsStore.kamAssignments[c.id] === id : goalsStore.clientRegions[c.id] === id,
          )
          .map((c) => c.id),
      );
      return filteredTrips.filter((t) => t.client_id && scopedClientIds.has(t.client_id));
    })();
    const { start, end } = periodBounds(selectedMonthKey, rollup);
    return tripsInDateRange(withinKind, start, end);
  }, [progressEntity, filteredTrips, clients, goalsStore, selectedMonthKey, rollup]);

  // Display-ready evidence rows -- thin mapping only, no recalculation.
  const progressEvidenceRows: PerformanceTripEvidenceRow[] = useMemo(
    () => buildPerformanceTripEvidenceRows(progressEntityTrips, { supplierById, vehicleById, driverById }),
    [progressEntityTrips, supplierById, vehicleById, driverById],
  );

  const progressPeriodLabel = rollupLabel(selectedMonthKey, rollup);

  // Any OTHER active cross-filter dimension besides the entity currently
  // open in the modal (e.g. viewing Bhujesh's KAM progress while a Region
  // filter is simultaneously active elsewhere on the page). Reuses the same
  // display-name lookups already built for the "Showing:" context bar.
  const progressOtherFilterLabel: string | null = useMemo(() => {
    if (!progressEntity) return null;
    const parts: string[] = [];
    if (progressEntity.kind !== "kam" && crossFilter.kamId) {
      parts.push(kamById.get(crossFilter.kamId)?.name ?? crossFilter.kamId);
    }
    if (progressEntity.kind !== "region" && crossFilter.regionId) {
      parts.push(crossFilter.regionId);
    }
    if (progressEntity.kind !== "client" && crossFilter.clientId) {
      parts.push(clients.find((c) => c.id === crossFilter.clientId)?.name ?? crossFilter.clientId);
    }
    if (progressEntity.kind !== "supplier" && crossFilter.supplierId) {
      parts.push(supplierById.get(crossFilter.supplierId)?.name ?? crossFilter.supplierId);
    }
    if (progressEntity.kind !== "asset" && crossFilter.assetId) {
      parts.push(
        (vehicleById.get(crossFilter.assetId) ?? driverById.get(crossFilter.assetId))?.name ??
          crossFilter.assetId,
      );
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [progressEntity, crossFilter, kamById, clients, supplierById, vehicleById, driverById]);

  // The Progress modal's KPI header reuses whichever breakdown row is
  // already computed for this entity -- never a second calculation.
  // Phase 2 Commit 3: every kind now goes through the SAME generic,
  // already-tested buildPerformanceKpiRow the top KPI band uses -- not a
  // hand-built object per kind. That's what gives entity-level Target-to-
  // date/Pacing "for free": buildPerformanceKpiRow already computes them
  // whenever periodTargetValue > 0, and already gates them to null
  // otherwise (Supplier's periodTargetValue is always 0 -- no GoalFocus
  // "supplier" case exists; Asset's is only nonzero when that specific
  // vehicle/driver actually has a target set in Goals). No new util
  // function -- resolveFilteredPeriodTarget already resolves exactly the
  // one-asset-own-target case (vehicle if set, else driver, else 0),
  // reused here ONLY for this modal calculation, not for the Asset
  // breakdown TABLE (buildAssetBreakdown's operational row shape, and its
  // own contract, are unchanged).
  const progressKpi: PerformanceKpiRow | null = useMemo(() => {
    if (!progressEntity) return null;
    const { kind, id } = progressEntity;
    if (kind === "kam" || kind === "region") {
      const row = (kind === "kam" ? kamRows : regionRows).find((r) => r.id === id);
      if (!row) return null;
      return buildPerformanceKpiRow(
        entityLabel(kind),
        "inr",
        row.actualRevenue,
        row.targetRevenue,
        row.previousActualRevenue,
        selectedMonthKey,
        rollup,
        asOf,
      );
    }
    if (kind === "client") {
      const row = entityRows.find((r) => r.id === id);
      if (!row) return null;
      // Phase 2 Commit 2 fix, unchanged: buildEntityGoalRows (shared with
      // the Goals tab -- not modified here) never tracked previous-period
      // actuals, so this is computed alongside rather than inside it.
      const previousClientTrips = previousFilteredTrips.filter((t) => t.client_id === id);
      const previousMetrics = computeTripMetrics(previousClientTrips);
      return buildPerformanceKpiRow(
        "Client",
        "inr",
        row.actualRevenue,
        row.targetRevenue,
        previousMetrics.revenueInr,
        selectedMonthKey,
        rollup,
        asOf,
      );
    }
    const row = (kind === "supplier" ? supplierRows : assetRows).find((r) => r.id === id);
    if (!row) return null;
    // Supplier: always 0 (no target concept exists). Asset: that one
    // vehicle/driver's own target if configured, else 0 -- independent of
    // any client-side cross-filter, same rule already proven for the
    // aggregate-level Asset cross-filter case.
    const periodTargetValue =
      kind === "asset"
        ? resolveFilteredPeriodTarget(goalsStore, selectedMonthKey, rollup, { supplierId: null, assetId: id }, null)
            .revenueInr
        : 0;
    return buildPerformanceKpiRow(
      entityLabel(kind),
      "inr",
      row.actualRevenue,
      periodTargetValue,
      row.previousActualRevenue,
      selectedMonthKey,
      rollup,
      asOf,
    );
  }, [
    progressEntity,
    kamRows,
    regionRows,
    entityRows,
    supplierRows,
    assetRows,
    previousFilteredTrips,
    goalsStore,
    selectedMonthKey,
    rollup,
    asOf,
  ]);

  // Supplier/Asset only -- Cost/Margin already computed by supplierRows/
  // assetRows, kept separate from progressKpi (a shared type also used by
  // the top KPI band) so the modal can render it as a subordinate line
  // rather than a fourth value competing with Target/Actual/Achievement.
  const progressOperationalDetail: { cost: number; marginPct: number } | null = useMemo(() => {
    if (!progressEntity || (progressEntity.kind !== "supplier" && progressEntity.kind !== "asset")) {
      return null;
    }
    const row = (progressEntity.kind === "supplier" ? supplierRows : assetRows).find(
      (r) => r.id === progressEntity.id,
    );
    if (!row) return null;
    return { cost: row.actualCost, marginPct: row.marginPct };
  }, [progressEntity, supplierRows, assetRows]);

  const trendCompareItems = useMemo(
    () => [
      { label: "Previous period", value: revenueRow.previousActual },
      { label: "Target-to-date", value: revenueRow.targetToDate ?? 0 },
      { label: "Actual", value: revenueRow.actual },
    ],
    [revenueRow],
  );
  const maxTrendValue = Math.max(1, ...trendCompareItems.map((p) => p.value));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Performance</Text>
        <View style={styles.rollupRow}>
          {ROLLUPS.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setRollup(r.id)}
              style={[styles.rollupChip, rollup === r.id && styles.rollupChipOn]}
            >
              <Text style={[styles.rollupChipText, rollup === r.id && styles.rollupChipTextOn]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.perspectiveScroll}
        contentContainerStyle={styles.perspectiveRow}
      >
        {availablePerspectives.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setPerspective(p.id)}
            style={[styles.perspectiveChip, perspective === p.id && styles.perspectiveChipOn]}
          >
            <Text
              style={[
                styles.perspectiveChipText,
                perspective === p.id && styles.perspectiveChipTextOn,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* One compact context bar -- not a "Filter by..." panel per
          dimension. Built generically from crossFilter state; every
          dimension renders the same way once it's set, regardless of
          which breakdown table the click came from. */}
      <View style={styles.showingRow}>
        <Text style={styles.showingLine}>
          {hasActiveCrossFilter ? "Showing:" : "Showing: All business"}
        </Text>
        {crossFilter.kamId ? (
          <Pressable style={styles.filterChip} onPress={() => toggleFilter("kamId", crossFilter.kamId!)}>
            <Text style={styles.filterChipText}>
              KAM: {kamById.get(crossFilter.kamId)?.name ?? crossFilter.kamId}
            </Text>
            <X size={12} color={Theme.textOnPrimary} />
          </Pressable>
        ) : null}
        {crossFilter.regionId ? (
          <Pressable style={styles.filterChip} onPress={() => toggleFilter("regionId", crossFilter.regionId!)}>
            <Text style={styles.filterChipText}>Region: {crossFilter.regionId}</Text>
            <X size={12} color={Theme.textOnPrimary} />
          </Pressable>
        ) : null}
        {crossFilter.clientId ? (
          <Pressable style={styles.filterChip} onPress={() => toggleFilter("clientId", crossFilter.clientId!)}>
            <Text style={styles.filterChipText}>
              Client: {clients.find((c) => c.id === crossFilter.clientId)?.name ?? crossFilter.clientId}
            </Text>
            <X size={12} color={Theme.textOnPrimary} />
          </Pressable>
        ) : null}
        {crossFilter.supplierId ? (
          <Pressable style={styles.filterChip} onPress={() => toggleFilter("supplierId", crossFilter.supplierId!)}>
            <Text style={styles.filterChipText}>
              Supplier: {supplierById.get(crossFilter.supplierId)?.name ?? crossFilter.supplierId}
            </Text>
            <X size={12} color={Theme.textOnPrimary} />
          </Pressable>
        ) : null}
        {crossFilter.assetId ? (
          <Pressable style={styles.filterChip} onPress={() => toggleFilter("assetId", crossFilter.assetId!)}>
            <Text style={styles.filterChipText}>
              Asset: {(vehicleById.get(crossFilter.assetId) ?? driverById.get(crossFilter.assetId))?.name ?? crossFilter.assetId}
            </Text>
            <X size={12} color={Theme.textOnPrimary} />
          </Pressable>
        ) : null}
        {hasActiveCrossFilter ? (
          <Pressable onPress={clearAllFilters} hitSlop={8}>
            <Text style={styles.clearAllText}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.kpiRow}>
        {kpiRows.map((row) => (
          <View key={row.label} style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{row.label}</Text>
            <View style={styles.kpiPrimaryRow}>
              <View style={styles.kpiPrimaryCell}>
                <Text style={styles.kpiPrimaryValue}>
                  {row.hasTarget ? formatKpiValue(row.unit, row.periodTarget) : "Not set"}
                </Text>
                <Text style={styles.kpiPrimaryCaption}>Period target</Text>
              </View>
              <View style={styles.kpiPrimaryCell}>
                <Text style={styles.kpiPrimaryValue}>{formatKpiValue(row.unit, row.actual)}</Text>
                <Text style={styles.kpiPrimaryCaption}>Actual</Text>
              </View>
              <View style={styles.kpiPrimaryCell}>
                <Text style={styles.kpiPrimaryValue}>
                  {row.achievement != null ? `${row.achievement}%` : "—"}
                </Text>
                <Text style={styles.kpiPrimaryCaption}>Achievement</Text>
              </View>
            </View>
            {row.targetToDate != null ? (
              <View style={styles.kpiSecondaryRow}>
                <Text style={styles.kpiSecondaryText}>
                  {formatKpiValue(row.unit, row.targetToDate)} target-to-date
                </Text>
                <Text style={styles.kpiSecondaryText}>
                  {row.pacing != null ? `${row.pacing}% pacing` : "Pacing unavailable"}
                </Text>
              </View>
            ) : null}
            <Text style={styles.kpiTertiaryText}>
              {row.hasPreviousData && row.changeVsPrevious != null
                ? `${row.changeVsPrevious >= 0 ? "↑" : "↓"} ${Math.abs(row.changeVsPrevious)}% vs previous period`
                : "No previous period data"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Actual vs Target-to-date vs Previous period</Text>
        <Text style={styles.trendCaption}>
          Sales revenue, same period/date basis as the KPI band above. A rolling multi-month
          overlay is later polish, not built here -- this proves the three values agree today.
        </Text>
        <View style={styles.trendRow}>
          {trendCompareItems.map((item) => (
            <View key={item.label} style={styles.trendBarWrap}>
              <View
                style={[
                  styles.trendBar,
                  { height: Math.max(4, (item.value / maxTrendValue) * 96) },
                ]}
              />
              <Text style={styles.trendBarValue}>{formatINRChip(item.value)}</Text>
              <Text style={styles.trendBarLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {perspective === "asset" ? (
        <View style={styles.assetFocusRow}>
          {(["vehicle", "driver"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setAssetFocus(f)}
              style={[styles.rollupChip, assetFocus === f && styles.rollupChipOn]}
            >
              <Text style={[styles.rollupChipText, assetFocus === f && styles.rollupChipTextOn]}>
                {f === "vehicle" ? "Vehicles" : "Drivers"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Performance breakdown</Text>

        {showsClientBreakdown ? (
          <>
            <View style={styles.breakdownHeadRow}>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColName]}>Name</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Actual</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Target</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>%</Text>
              <View style={styles.breakdownColAction} />
            </View>
            {entityRows.length === 0 ? (
              <View style={styles.breakdownEmpty} />
            ) : (
              entityRows.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => toggleClientFilter(row.id)}
                  style={[styles.breakdownRow, crossFilter.clientId === row.id && styles.breakdownRowActive]}
                >
                  <Text style={[styles.breakdownCell, styles.breakdownColName]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                    {formatINRChip(row.actualRevenue)}
                  </Text>
                  <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                    {row.hasTarget ? formatINRChip(row.targetRevenue) : "—"}
                  </Text>
                  <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                    {row.hasTarget ? `${row.revenueProgressPct}%` : "—"}
                  </Text>
                  <Pressable
                    style={styles.breakdownColAction}
                    onPress={() => setProgressEntity({ kind: "client", id: row.id, name: row.name })}
                  >
                    <Text style={styles.viewProgressText}>View progress</Text>
                  </Pressable>
                </Pressable>
              ))
            )}
          </>
        ) : null}

        {perspective === "kam" || perspective === "region" ? (
          <>
            <View style={styles.breakdownHeadRow}>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColName]}>
                {perspective === "kam" ? "KAM" : "Region"}
              </Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Trips</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Sales</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Target</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Achievement</Text>
              <View style={styles.breakdownColAction} />
            </View>
            {(perspective === "kam" ? kamRows : regionRows).length === 0 ? (
              <View style={styles.breakdownEmpty} />
            ) : (
              (perspective === "kam" ? kamRows : regionRows).map((row) => {
                const field = perspective === "kam" ? "kamId" : "regionId";
                const active = crossFilter[field] === row.id;
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => toggleFilter(field, row.id)}
                    style={[styles.breakdownRow, active && styles.breakdownRowActive]}
                  >
                    <Text style={[styles.breakdownCell, styles.breakdownColName]} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>{row.actualTrips}</Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                      {formatINRChip(row.actualRevenue)}
                    </Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                      {row.hasTarget ? formatINRChip(row.targetRevenue) : "—"}
                    </Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                      {row.achievement != null ? `${row.achievement}%` : "—"}
                    </Text>
                    <Pressable
                      style={styles.breakdownColAction}
                      onPress={() => setProgressEntity({ kind: perspective, id: row.id, name: row.name })}
                    >
                      <Text style={styles.viewProgressText}>View progress</Text>
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </>
        ) : null}

        {perspective === "supplier" || perspective === "asset" ? (
          <>
            <View style={styles.breakdownHeadRow}>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColName]}>
                {perspective === "supplier" ? "Supplier" : assetFocus === "vehicle" ? "Vehicle" : "Driver"}
              </Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Trips</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Sales</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Cost</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Margin</Text>
              <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Growth</Text>
              <View style={styles.breakdownColAction} />
            </View>
            {(perspective === "supplier" ? supplierRows : assetRows).length === 0 ? (
              <View style={styles.breakdownEmpty} />
            ) : (
              (perspective === "supplier" ? supplierRows : assetRows).map((row) => {
                const field = perspective === "supplier" ? "supplierId" : "assetId";
                const active = crossFilter[field] === row.id;
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => toggleFilter(field, row.id)}
                    style={[styles.breakdownRow, active && styles.breakdownRowActive]}
                  >
                    <Text style={[styles.breakdownCell, styles.breakdownColName]} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>{row.actualTrips}</Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                      {formatINRChip(row.actualRevenue)}
                    </Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                      {formatINRChip(row.actualCost)}
                    </Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                      {row.marginPct.toFixed(1)}%
                    </Text>
                    <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                      {row.hasPreviousData && row.growthPct != null ? `${row.growthPct}%` : "—"}
                    </Text>
                    <Pressable
                      style={styles.breakdownColAction}
                      onPress={() => setProgressEntity({ kind: perspective, id: row.id, name: row.name })}
                    >
                      <Text style={styles.viewProgressText}>View progress</Text>
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </>
        ) : null}
      </View>

      {progressEntity && progressKpi ? (
        <NetworkDesktopEntityProgressModal
          visible
          onClose={() => setProgressEntity(null)}
          kind={progressEntity.kind}
          entityName={progressEntity.name}
          kpi={progressKpi}
          portfolioClients={progressPortfolioClients}
          evidenceRows={progressEvidenceRows}
          periodLabel={progressPeriodLabel}
          otherFilterLabel={progressOtherFilterLabel}
          operationalDetail={progressOperationalDetail}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fb" },
  content: { padding: 20, gap: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark },
  rollupRow: { flexDirection: "row", gap: 6 },
  rollupChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Theme.surfaceForm,
    borderRadius: 8,
  },
  rollupChipOn: { backgroundColor: Theme.primary },
  rollupChipText: { fontSize: 12, fontWeight: "700", color: Theme.textSecondary },
  rollupChipTextOn: { color: Theme.textOnPrimary },
  perspectiveScroll: { flexGrow: 0 },
  perspectiveRow: { flexDirection: "row", gap: 8 },
  perspectiveChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
  },
  perspectiveChipOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  perspectiveChipText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  perspectiveChipTextOn: { color: Theme.textOnPrimary },
  showingRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  showingLine: { fontSize: 12, color: Theme.textMuted, fontWeight: "600" },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Theme.primary,
    borderRadius: 14,
  },
  filterChipText: { fontSize: 11, fontWeight: "700", color: Theme.textOnPrimary },
  clearAllText: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    flexGrow: 1,
    flexBasis: 180,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 4,
  },
  kpiLabel: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  kpiPrimaryRow: { flexDirection: "row", gap: 12 },
  kpiPrimaryCell: { flex: 1 },
  kpiPrimaryValue: { fontSize: 18, fontWeight: "800", color: Theme.textPrimaryDark },
  kpiPrimaryCaption: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  kpiSecondaryRow: { flexDirection: "row", justifyContent: "space-between" },
  kpiSecondaryText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  kpiTertiaryText: { fontSize: 11, fontWeight: "700", color: Theme.primary },
  sectionCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  trendCaption: { fontSize: 11, color: Theme.textMuted },
  trendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    gap: 10,
    minHeight: 120,
  },
  trendBarWrap: { alignItems: "center", gap: 6, width: 96 },
  trendBar: { width: 32, backgroundColor: Theme.primary, borderRadius: 4 },
  trendBarValue: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  trendBarLabel: { fontSize: 10, color: Theme.textMuted },
  breakdownHeadRow: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  breakdownHeadCell: { fontSize: 11, fontWeight: "800", color: Theme.textMuted },
  breakdownColName: { flex: 2 },
  breakdownColNum: { flex: 1, textAlign: "right" },
  breakdownRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  breakdownRowActive: { backgroundColor: Theme.surfaceForm, borderRadius: 8 },
  breakdownCell: { fontSize: 13, color: Theme.textPrimaryDark },
  breakdownColAction: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  viewProgressText: { fontSize: 11, fontWeight: "700", color: Theme.primary },
  breakdownEmpty: { minHeight: 40 },
  assetFocusRow: { flexDirection: "row", gap: 6 },
});
