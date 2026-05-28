/**
 * Fiscal Analytics: Overview, Corridor Grid, Fleet Grid.
 * Uses ledger transactions + trip details; KPIs and filters from available data.
 */
import Theme from "@/constants/Theme";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { Layout } from "@/constants/Layout";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { formatLedgerAmount } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const TREND_BAR_MAX_HEIGHT = 56;

const MONTHS_SHORT = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

function dateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = (iso ?? "").slice(0, 10);
  return s || null;
}

function formatShortDate(key: string): string {
  const [y, m, d] = key.split("-");
  const mi = Number(m ?? 0) - 1;
  return `${d ?? ""} ${MONTHS_SHORT[mi] ?? m}`;
}

export type AnalyticsTripDetailMap = Record<
  string,
  {
    trip_number: string;
    drop_location?: string;
    pickup_area?: string;
    client_name?: string;
    pickup_date?: string | null;
    vehicle_number?: string | null;
    client_price?: number | null;
  }
>;

export interface FinanceAnalyticsViewProps {
  transactions: LedgerRow[];
  tripDetailsMap?: AnalyticsTripDetailMap | null;
}

interface TripPerformance {
  trip_id: string;
  origin: string;
  dest: string;
  client: string;
  vehicle: string;
  actualIn: number;
  actualOut: number;
  revenue: number;
  contribution: number;
  margin: number;
}

interface TripTotals {
  actualIn: number;
  actualOut: number;
}

export function FinanceAnalyticsView({
  transactions,
  tripDetailsMap = {},
}: FinanceAnalyticsViewProps) {
  const [analyticsView, setAnalyticsView] = useState<"overview" | "corridor" | "fleet">("overview");

  const tabLabels: Record<"overview" | "corridor" | "fleet", string> = {
    overview: "Overview",
    corridor: "Routes",
    fleet: "Vehicles",
  };
  const [selectedPartyFilter, setSelectedPartyFilter] = useState<string | null>(null);

  const data = useMemo(() => {
    const tripTotalsByTripId = new Map<string, TripTotals>();
    const partyNamesByTripId = new Map<string, Set<string>>();
    const partyStats: Array<[string, { in: number; out: number; count: number }]> = [];
    const partyMap = new Map<string, { in: number; out: number; count: number }>();
    const trendMap = new Map<string, { in: number; out: number }>();

    transactions.forEach((tx) => {
      const amountIn = Number(tx.amount_in ?? 0);
      const amountOut = Number(tx.amount_out ?? 0);

      if (tx.trip_id) {
        const totals = tripTotalsByTripId.get(tx.trip_id) ?? {
          actualIn: 0,
          actualOut: 0,
        };
        totals.actualIn += amountIn;
        totals.actualOut += amountOut;
        tripTotalsByTripId.set(tx.trip_id, totals);

        const partyName = (tx.party_name ?? "").trim();
        if (partyName) {
          const names = partyNamesByTripId.get(tx.trip_id) ?? new Set<string>();
          names.add(partyName);
          partyNamesByTripId.set(tx.trip_id, names);
        }
      }

      const name = (tx.party_name ?? "").trim() || "—";
      if (!partyMap.has(name)) partyMap.set(name, { in: 0, out: 0, count: 0 });
      const party = partyMap.get(name)!;
      party.in += amountIn;
      party.out += amountOut;
      party.count += 1;

      const trendKey = dateKey(tx.transaction_date ?? tx.created_at) ?? "—";
      if (!trendMap.has(trendKey)) trendMap.set(trendKey, { in: 0, out: 0 });
      const trend = trendMap.get(trendKey)!;
      trend.in += amountIn;
      trend.out += amountOut;
    });

    const tripPerformance: TripPerformance[] = Array.from(tripTotalsByTripId.entries()).map(([tripId, totals]) => {
      const detail = tripDetailsMap?.[tripId];
      const revenue = (detail?.client_price != null && detail.client_price > 0)
        ? detail.client_price
        : totals.actualIn;
      const contribution = revenue - totals.actualOut;
      const margin = revenue > 0 ? (contribution / revenue) * 100 : 0;
      return {
        trip_id: tripId,
        origin: detail?.pickup_area ?? "—",
        dest: detail?.drop_location ?? "—",
        client: detail?.client_name ?? "—",
        vehicle: (detail?.vehicle_number ?? "").trim() || "—",
        actualIn: totals.actualIn,
        actualOut: totals.actualOut,
        revenue,
        contribution,
        margin,
      };
    });

    partyMap.forEach((vals, name) => partyStats.push([name, vals]));

    const fleetMap = new Map<string, { rev: number; exp: number; count: number }>();
    tripPerformance.forEach((t) => {
      const category = (t.vehicle !== "—" ? t.vehicle.split(" ")[0] : "Other") || "Other";
      if (!fleetMap.has(category)) fleetMap.set(category, { rev: 0, exp: 0, count: 0 });
      const f = fleetMap.get(category)!;
      f.rev += t.revenue;
      f.exp += t.actualOut;
      f.count += 1;
    });
    const fleetStats = Array.from(fleetMap.entries());
    const trendData = Array.from(trendMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);

    return { tripPerformance, partyStats, fleetStats, trendData, partyNamesByTripId };
  }, [transactions, tripDetailsMap]);

  const filteredKpis = useMemo(() => {
    let targetTrips = data.tripPerformance;
    if (selectedPartyFilter) {
      targetTrips = data.tripPerformance.filter(
        (t) =>
          t.client === selectedPartyFilter ||
          data.partyNamesByTripId.get(t.trip_id)?.has(selectedPartyFilter) === true
      );
    }
    const rev = targetTrips.reduce((s, t) => s + t.revenue, 0);
    const exp = targetTrips.reduce((s, t) => s + t.actualOut, 0);
    const profit = rev - exp;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;
    return { rev, exp, profit, margin };
  }, [data.partyNamesByTripId, data.tripPerformance, selectedPartyFilter]);

  const maxTrend = Math.max(
    1,
    ...data.trendData.map(([, v]) => v.in + v.out)
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* KPI bar */}
      <View style={styles.kpiBar}>
        <View style={styles.kpiTop}>
          <View style={styles.kpiTopLeft}>
            <Text style={styles.kpiLabel}>Total revenue</Text>
            <Text style={styles.kpiRev}>₹{formatLedgerAmount(filteredKpis.rev)}</Text>
          </View>
          {selectedPartyFilter ? (
            <TouchableOpacity
              style={styles.kpiFilterChip}
              onPress={() => setSelectedPartyFilter(null)}
              activeOpacity={0.8}
              hitSlop={Layout.touchTargetHitSlop}
            >
              <FontAwesome name="times" size={10} color={Theme.teslaRed} />
              <Text style={styles.kpiFilterChipText} numberOfLines={1}>{selectedPartyFilter}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiCellLabel}>Profit</Text>
            <Text style={styles.kpiProfit}>₹{formatLedgerAmount(filteredKpis.profit)}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiCellLabel}>Spent</Text>
            <Text style={styles.kpiExp}>₹{formatLedgerAmount(filteredKpis.exp)}</Text>
          </View>
          <View style={[styles.kpiCell, styles.kpiCellRight]}>
            <Text style={styles.kpiCellLabel}>Margin</Text>
            <Text style={styles.kpiMargin}>{filteredKpis.margin.toFixed(1)}%</Text>
          </View>
        </View>
      </View>

      <Text style={styles.introLine}>See the big picture or drill into routes and vehicles.</Text>

      {/* Sub-nav */}
      <View style={styles.subNav}>
        {(["overview", "corridor", "fleet"] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.subNavTab, analyticsView === v && styles.subNavTabActive]}
            onPress={() => setAnalyticsView(v)}
            activeOpacity={0.8}
            hitSlop={Layout.touchTargetHitSlop}
          >
            <Text style={[styles.subNavTabText, analyticsView === v && styles.subNavTabTextActive]}>
              {tabLabels[v]}
            </Text>
            {analyticsView === v && <View style={styles.subNavTabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Party filter (overview only) */}
      {analyticsView === "overview" && data.partyStats.length > 0 && (
        <View style={styles.partyStripWrapper}>
          <Text style={styles.partyStripHint}>Tap a party to see their numbers</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.partyStrip}
            contentContainerStyle={styles.partyStripContent}
          >
            {data.partyStats.map(([name, vals]) => {
              const selected = selectedPartyFilter === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.partyCard, selected && styles.partyCardSelected]}
                  onPress={() => setSelectedPartyFilter(selected ? null : name)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.partyCardName, selected && styles.partyCardNameSelected]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.partyCardMeta, selected && styles.partyCardMetaSelected]}>
                    {vals.count} {vals.count === 1 ? "transaction" : "transactions"}
                  </Text>
                  <Text style={[styles.partyCardAmount, selected && styles.partyCardAmountSelected]}>
                    ₹{formatLedgerAmount(vals.in)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {analyticsView === "overview" && (
        <View style={styles.overview}>
          {/* Activity over time */}
          {data.trendData.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity over time</Text>
              <Text style={styles.sectionSubtitle}>Cash in and out by day</Text>
              <View style={styles.trendCard}>
                <View style={styles.trendBars}>
                  {data.trendData.map(([date, vals]) => {
                    const ratio = maxTrend > 0 ? (vals.in + vals.out) / maxTrend : 0;
                    const barHeight = Math.max(6, Math.round(ratio * TREND_BAR_MAX_HEIGHT));
                    return (
                      <View key={date} style={styles.trendBarWrap}>
                        <View style={[styles.trendBar, { height: barHeight }]} />
                        <Text style={styles.trendBarLabel} numberOfLines={1}>{formatShortDate(date)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity over time</Text>
              <Text style={styles.emptyStateText}>No transactions in this period</Text>
            </View>
          )}

          {/* Top routes */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderRowTitle}>
                <Text style={styles.sectionTitle}>Top routes</Text>
                <Text style={styles.sectionSubtitle}>Best margin by route</Text>
              </View>
              {data.tripPerformance.length > 0 && (
                <TouchableOpacity
                  style={styles.seeAllBtn}
                  onPress={() => setAnalyticsView("corridor")}
                  activeOpacity={0.8}
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <Text style={styles.seeAllBtnText}>See all</Text>
                  <FontAwesome name="chevron-right" size={10} color={Theme.textPrimary} />
                </TouchableOpacity>
              )}
            </View>
            {data.tripPerformance.length > 0 ? (
              data.tripPerformance
                .slice(0, 5)
                .sort((a, b) => b.margin - a.margin)
                .map((trip) => (
                  <View key={trip.trip_id} style={styles.corridorRow}>
                    <View style={styles.corridorRowLeft}>
                      <Text style={styles.corridorRoute} numberOfLines={1}>
                        {trip.origin} → {trip.dest}
                      </Text>
                      <Text style={styles.corridorMeta}>{trip.client}</Text>
                    </View>
                    <View style={styles.corridorRowRight}>
                      <Text style={styles.corridorMargin}>{trip.margin.toFixed(0)}%</Text>
                      <Text style={styles.corridorMeta}>margin</Text>
                    </View>
                  </View>
                ))
            ) : (
              <Text style={styles.emptyStateText}>No routes yet</Text>
            )}
          </View>

          {/* By vehicle type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By vehicle type</Text>
            <Text style={styles.sectionSubtitle}>Revenue per vehicle category</Text>
            {data.fleetStats.length > 0 ? (
              <View style={styles.fleetGrid}>
                {data.fleetStats.map(([name, vals]) => (
                  <View key={name} style={styles.fleetCard}>
                    <View style={styles.fleetCardTop}>
                      <Text style={styles.fleetCardName} numberOfLines={1}>{name}</Text>
                      <FontAwesome name="truck" size={12} color={Theme.textMuted} />
                    </View>
                    <Text style={styles.fleetCardAmount}>₹{formatLedgerAmount(vals.rev)}</Text>
                    <Text style={styles.fleetCardMeta}>earned</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyStateText}>No vehicle data yet</Text>
            )}
          </View>
        </View>
      )}

      {analyticsView === "corridor" && (
        <View style={styles.corridorList}>
          <View style={styles.corridorListHeader}>
            <View style={styles.corridorListHeaderTitleWrap}>
              <Text style={styles.sectionTitle}>Route performance</Text>
              <Text style={styles.sectionSubtitle}>How each route is doing</Text>
            </View>
            <FontAwesome name="map-marker" size={14} color={Theme.textMuted} />
          </View>
          {data.tripPerformance.length === 0 ? (
            <View style={styles.emptyStateWrap}>
              <Text style={styles.emptyStateText}>No routes yet</Text>
            </View>
          ) : (
            <>
              {[...data.tripPerformance]
                .sort((a, b) => b.margin - a.margin)
                .map((trip) => (
                  <View key={trip.trip_id} style={styles.corridorCard}>
                    <View style={styles.corridorCardId}>
                      <Text style={styles.corridorCardIdText} numberOfLines={1}>
                        {getTripOperationalDisplay({
                          trip_number: tripDetailsMap?.[trip.trip_id]?.trip_number ?? trip.trip_id,
                        })}
                      </Text>
                    </View>
                    <View style={styles.corridorCardBody}>
                      <View style={styles.corridorCardTop}>
                        <View>
                          <Text style={styles.corridorCardRoute} numberOfLines={1}>
                            {trip.origin} → {trip.dest}
                          </Text>
                          <Text style={styles.corridorMeta}>{trip.client}</Text>
                        </View>
                        <View
                          style={[
                            styles.marginPill,
                            trip.margin > 15 ? styles.marginPillGood : styles.marginPillNeutral,
                          ]}
                        >
                          <Text
                            style={[
                              styles.marginPillText,
                              trip.margin > 15 ? styles.marginPillTextGood : styles.marginPillTextNeutral,
                            ]}
                          >
                            {trip.margin.toFixed(1)}% margin
                          </Text>
                        </View>
                      </View>
                      <View style={styles.contributionRow}>
                        <View style={styles.contributionBarWrap}>
                          <Text style={styles.contributionLabel}>Profit share</Text>
                          <View style={styles.contributionBar}>
                            <View
                              style={[
                                styles.contributionBarFill,
                                {
                                  width: `${trip.revenue > 0 ? (trip.contribution / trip.revenue) * 100 : 0}%`,
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <View style={styles.contributionValue}>
                          <Text style={styles.contributionAmount}>₹{formatLedgerAmount(trip.contribution)}</Text>
                          <Text style={styles.corridorMeta}>you keep</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
            </>
          )}
        </View>
      )}

      {analyticsView === "fleet" && (
        <View style={styles.fleetList}>
          <View style={styles.corridorListHeader}>
            <View style={styles.corridorListHeaderTitleWrap}>
              <Text style={styles.sectionTitle}>Vehicle performance</Text>
              <Text style={styles.sectionSubtitle}>How your vehicles are doing</Text>
            </View>
            <FontAwesome name="dashboard" size={14} color={Theme.textMuted} />
          </View>
          {data.fleetStats.length === 0 ? (
            <View style={styles.emptyStateWrap}>
              <Text style={styles.emptyStateText}>No vehicle data yet</Text>
            </View>
          ) : (
          data.fleetStats.map(([name, vals]) => {
            const margin = vals.rev > 0 ? ((vals.rev - vals.exp) / vals.rev) * 100 : 0;
            return (
              <View key={name} style={styles.fleetBigCard}>
                <View style={styles.fleetBigCardTop}>
                  <View>
                    <Text style={styles.fleetBigCardName}>{name}</Text>
                    <Text style={styles.fleetBigCardMeta}>{vals.count} {vals.count === 1 ? "trip" : "trips"}</Text>
                  </View>
                  <View style={styles.fleetBigCardRight}>
                    <Text style={styles.fleetBigCardMargin}>{margin.toFixed(0)}%</Text>
                    <Text style={styles.corridorMeta}>margin</Text>
                  </View>
                </View>
                <View style={styles.fleetBigCardGrid}>
                  <View>
                    <Text style={styles.fleetBigCardAmount}>₹{formatLedgerAmount(vals.rev)}</Text>
                    <Text style={styles.corridorMeta}>earned</Text>
                  </View>
                  <View style={styles.fleetBigCardGridRight}>
                    <Text style={styles.fleetBigCardExp}>₹{formatLedgerAmount(vals.exp)}</Text>
                    <Text style={styles.corridorMeta}>spent</Text>
                  </View>
                </View>
              </View>
            );
          })
          )}
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  kpiBar: {
    backgroundColor: Theme.darkSurface,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    paddingBottom: 16,
  },
  kpiTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  kpiTopLeft: { flex: 1, minWidth: 0 },
  kpiLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  kpiRev: {
    fontSize: 28,
    fontWeight: "400",
    color: Theme.textOnPrimary,
    letterSpacing: -0.5,
  },
  kpiFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  kpiFilterChipText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    maxWidth: 100,
  },
  kpiRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: 12,
    marginTop: 12,
    gap: 16,
  },
  kpiCell: { flex: 1 },
  kpiCellRight: { alignItems: "flex-end" },
  kpiCellLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
  },
  kpiProfit: { fontSize: 16, fontWeight: "500", color: Theme.darkGreen },
  kpiExp: { fontSize: 16, fontWeight: "500", color: Theme.teslaRed },
  kpiMargin: { fontSize: 16, fontWeight: "500", color: Theme.textOnPrimary },
  introLine: {
    fontSize: 11,
    color: Theme.textMuted,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 2,
  },
  subNav: {
    flexDirection: "row",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    gap: 20,
  },
  subNavTab: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
    position: "relative",
  },
  subNavTabActive: {},
  subNavTabText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  subNavTabTextActive: { color: Theme.textPrimary },
  subNavTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Theme.textPrimary,
    borderRadius: 1,
  },
  partyStrip: { maxHeight: 100 },
  partyStripContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    gap: 12,
    flexDirection: "row",
    paddingBottom: 16,
  },
  partyCard: {
    minWidth: 140,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    minHeight: Layout.minTouchTargetSize * 2,
  },
  partyCardSelected: {
    backgroundColor: Theme.darkSurface,
    borderColor: Theme.darkSurface,
  },
  partyCardName: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  partyCardNameSelected: { color: Theme.textOnPrimary },
  partyCardMeta: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  partyCardMetaSelected: { color: Theme.textOnDarkMuted },
  partyCardAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  partyCardAmountSelected: { color: Theme.textOnPrimary },
  overview: { paddingHorizontal: Layout.screenPaddingHorizontal, paddingTop: 8 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  sectionHeaderRowTitle: { flex: 1, minWidth: 0 },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  seeAllBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  emptyStateWrap: {
    paddingVertical: 24,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 13,
    color: Theme.textMuted,
  },
  partyStripWrapper: { marginBottom: 4 },
  partyStripHint: {
    fontSize: 10,
    color: Theme.textMuted,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 4,
  },
  trendCard: {
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    height: TREND_BAR_MAX_HEIGHT + 36,
  },
  trendBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: TREND_BAR_MAX_HEIGHT,
    gap: 4,
  },
  trendBarWrap: {
    flex: 1,
    height: TREND_BAR_MAX_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  trendBar: {
    width: "80%",
    minHeight: 6,
    backgroundColor: Theme.textMuted,
    opacity: 0.5,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  trendBarLabel: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
    textTransform: "uppercase",
  },
  corridorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  corridorRowLeft: { flex: 1, minWidth: 0 },
  corridorRowRight: { alignItems: "flex-end" },
  corridorRoute: {
    fontSize: 14,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  corridorMeta: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginTop: 2,
  },
  corridorMargin: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimary,
  },
  fleetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  fleetCard: {
    width: "47%",
    minWidth: 0,
    flexGrow: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    padding: 12,
  },
  fleetCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  fleetCardName: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  fleetCardAmount: { fontSize: 18, fontWeight: "400", color: Theme.textPrimary },
  fleetCardMeta: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginTop: 2,
  },
  corridorList: { paddingBottom: 16 },
  corridorListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  corridorListHeaderTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  corridorCard: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  corridorCardId: {
    width: 48,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  corridorCardIdText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  corridorCardBody: { flex: 1, padding: 12, minWidth: 0 },
  corridorCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  corridorCardRoute: {
    fontSize: 14,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  marginPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  marginPillGood: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.darkGreen,
  },
  marginPillNeutral: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  marginPillText: { fontSize: 9, fontWeight: "700" },
  marginPillTextGood: { color: Theme.darkGreen },
  marginPillTextNeutral: { color: Theme.textMuted },
  contributionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingTop: 8,
  },
  contributionBarWrap: { flex: 1, minWidth: 0 },
  contributionLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  contributionBar: {
    height: 6,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 3,
    overflow: "hidden",
  },
  contributionBarFill: {
    height: "100%",
    backgroundColor: Theme.textPrimary,
    borderRadius: 3,
  },
  contributionValue: { alignItems: "flex-end" },
  contributionAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  fleetList: { paddingHorizontal: 0, paddingBottom: 16 },
  fleetBigCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 16,
  },
  fleetBigCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  fleetBigCardName: {
    fontSize: 20,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  fleetBigCardMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  fleetBigCardRight: { alignItems: "flex-end" },
  fleetBigCardMargin: {
    fontSize: 22,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  fleetBigCardGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingTop: 12,
  },
  fleetBigCardGridRight: { alignItems: "flex-end" },
  fleetBigCardAmount: { fontSize: 18, fontWeight: "400", color: Theme.textPrimary },
  fleetBigCardExp: { fontSize: 18, fontWeight: "400", color: Theme.teslaRed },
});
