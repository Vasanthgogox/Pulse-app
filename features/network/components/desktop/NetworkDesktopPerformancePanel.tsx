/**
 * Hub Performance tab — the future unified Target vs Actual / cross-filtered
 * analytics page (Goals + Sales + Asset merge).
 *
 * Phase 1, Commit 1 (route proof only): the spinner below is NOT the
 * intended Performance UX. It exists solely to prove Network -> Performance
 * -> this panel resolves correctly. Real content lands over Phase 1's
 * remaining commits. See docs/PERFORMANCE_PHASE1_IMPLEMENTATION_MAP.md.
 *
 * Phase 1, Commit 2 (this commit): the cross-filter state model, declared
 * but not yet wired to any visual, calculation, or query. Still no visible
 * behavior change -- the panel still only renders the Commit 1 spinner.
 *
 * One shared filter/perspective pair is meant to drive every Performance
 * visual (Power BI-style: click a KAM/client/supplier/asset and the whole
 * page re-scopes), NOT six independent per-perspective page layouts. The
 * existing Sales tab's own local filters (lane/role/rating/on-time%, etc.
 * in SalesCrossFilters/AssetSalesCrossFilters) stay exactly where they are,
 * as an analytical sub-filter layer inside the "Why?" section -- they are
 * never promoted into this object.
 *
 * Attribution is not uniform across dimensions -- this type does not pretend
 * every field is meaningful for every metric:
 *   - kamId / regionId  -> derived from client assignment (kamAssignments /
 *     clientRegions, both client-id-keyed). Meaningful for client-portfolio
 *     metrics (revenue, trips, targets, Receivable). Has NO valid meaning
 *     for the supplier/driver half of Payable -- that must always show the
 *     real org-wide figure with a "Not affected by this filter" label, never
 *     a fabricated filtered number.
 *   - clientId          -> direct (trip.client_id). Meaningful for client +
 *     trip metrics.
 *   - supplierId         -> direct (trip.supplier_id). Meaningful for
 *     supplier/operator performance only -- no target exists for suppliers
 *     (GoalFocus has no "supplier" case) and none should be fabricated.
 *   - assetId            -> direct (trip.vehicle_id or trip.driver_id,
 *     whichever the active perspective's asset kind is). Meaningful for
 *     vehicle/driver/asset metrics.
 *   - performanceStatus / trendPointKey -> apply only to metrics that have
 *     an actual/target pair or a time series to begin with.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Which grouping/breakdown the page is currently showing -- a view mode,
 * not a filter dimension. Mirrors NetworkDesktopSalesPanel's SalesScope
 * ("aggregate" | "asset"), extended to six; that panel's own scope becomes
 * derived from this once it's wired in (not an independent second toggle).
 */
export type PerformancePerspective =
  | "aggregate"
  | "kam"
  | "client"
  | "region"
  | "supplier"
  | "asset";

export type PerformanceCrossFilter = {
  kamId: string | null;
  clientId: string | null;
  regionId: string | null;
  supplierId: string | null;
  assetId: string | null;
  performanceStatus: "behind" | "on_track" | "exceeded" | null;
  /** Day/week/month key selected on the trend chart. Not the global Period/
   * Granularity picker (Month/Quarter/Year) -- that remains separate global
   * context, per the locked Global-vs-cross-filter split. */
  trendPointKey: string | null;
};

const EMPTY_PERFORMANCE_CROSS_FILTER: PerformanceCrossFilter = {
  kamId: null,
  clientId: null,
  regionId: null,
  supplierId: null,
  assetId: null,
  performanceStatus: null,
  trendPointKey: null,
};

type Props = {
  orgId: string;
};

export function NetworkDesktopPerformancePanel({ orgId: _orgId }: Props) {
  const [perspective, setPerspective] = useState<PerformancePerspective>("aggregate");
  const [crossFilter, setCrossFilter] = useState<PerformanceCrossFilter>(
    EMPTY_PERFORMANCE_CROSS_FILTER,
  );
  // Declared, not yet consumed -- no visual, calculation, or query reads
  // these yet. Silences unused-var noise without pretending they're wired.
  void perspective;
  void setPerspective;
  void crossFilter;
  void setCrossFilter;

  return (
    <View style={styles.root}>
      <LoadingIndicator color={Theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
});
