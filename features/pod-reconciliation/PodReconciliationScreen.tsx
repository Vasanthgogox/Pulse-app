/**
 * POD Reconciliation Screen — adapted from cashflow PodReconciliation.tsx.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogIncomingPodsScreen } from "../log-pods/LogIncomingPodsScreen";
import { PodValidationView } from "./components/PodValidationView";
import {
    usePodReconciliationSummaryQuery,
    usePodReconciliationTripsQuery,
} from "./lib/usePodReconciliationQueries";
import type {
    PodReconciliationTripView,
    PodTab,
} from "./services/podReconciliationService";

function canAccessPodManagement(
  profile: ReturnType<typeof useAuth>["profile"],
): boolean {
  if (!profile || profile.role === "driver") return false;
  const caps = getCapabilitiesFromProfile(profile);
  return (
    caps.includes("finance_view") ||
    caps.includes("finance_manage") ||
    caps.includes("dispatch") ||
    caps.includes("dispatch_for_own_fleet")
  );
}

export function PodReconciliationScreen() {
  const insets = useSafeAreaInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const { profile } = useAuth();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const [activeTab, setActiveTab] = useState<PodTab>("pod_pending");
  const [financeTab, setFinanceTab] = useState<"OVERVIEW" | "LOG_INCOMING">(
    "OVERVIEW",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState("All");
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] =
    useState<PodReconciliationTripView | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">(
    Platform.OS === "web" ? "table" : "cards",
  );
  const [sortKey, setSortKey] = useState<
    | "id"
    | "trip_date"
    | "client_name"
    | "vendor_name"
    | "amount"
    | "invoice_status_display"
  >("trip_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<{
    trip_status: string[];
    pod_status: string[];
    invoice_status_1: string[];
  }>({
    trip_status: [],
    pod_status: [],
    invoice_status_1: [],
  });

  const {
    data: trips = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = usePodReconciliationTripsQuery(
    orgId,
    activeTab,
    searchTerm,
    regionFilter,
  );

  const { data: summaryData } = usePodReconciliationSummaryQuery(orgId);

  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024;
  const isMediumScreen = width >= 768;
  const allowed = canAccessPodManagement(profile);

  const regions = [
    "All",
    "HYDERABAD",
    "CHENNAI",
    "BANGALORE",
    "PONDICHERRY",
    "Gummidipondi",
    "MUMBAI",
    "KOLKATA",
    "DELHI",
    "AHMEDABAD",
  ];

  const formatCurrencySimple = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return "₹" + amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };
  const totalPending = formatCurrencySimple(summaryData?.pod_pending_sum || 0);
  const totalInvoiced = formatCurrencySimple(summaryData?.invoiced_sum || 0);

  const safeDateText = (value: string | null | undefined): string => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const getTripStatusLabel = (trip: PodReconciliationTripView): string =>
    (trip.trip_status || "").trim() || "Not Set";
  const getPodStatusLabel = (trip: PodReconciliationTripView): string => {
    const pod = (trip.pod_status || "").trim();
    if (pod) return pod;
    return trip.invoice_status_display === "Invoice Pending"
      ? "Pending"
      : "Not Set";
  };
  const getInvStatusLabel = (trip: PodReconciliationTripView): string => {
    const inv = (trip.invoice_status_1 || "").trim();
    if (inv) return inv;
    return trip.invoice_status_display === "Invoice Pending"
      ? "Pending"
      : "Not Set";
  };

  const sortTrips = (items: PodReconciliationTripView[]) => {
    const cloned = [...items];
    cloned.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";
      switch (sortKey) {
        case "amount":
          left = Number(a.amount || 0);
          right = Number(b.amount || 0);
          break;
        case "trip_date":
          left = new Date(a.trip_date || a.date || "").getTime() || 0;
          right = new Date(b.trip_date || b.date || "").getTime() || 0;
          break;
        case "id":
          left = (a.id || "").toLowerCase();
          right = (b.id || "").toLowerCase();
          break;
        case "client_name":
          left = (a.client_name || "").toLowerCase();
          right = (b.client_name || "").toLowerCase();
          break;
        case "vendor_name":
          left = (a.vendor_name || "").toLowerCase();
          right = (b.vendor_name || "").toLowerCase();
          break;
        case "invoice_status_display":
          left = (a.invoice_status_display || "").toLowerCase();
          right = (b.invoice_status_display || "").toLowerCase();
          break;
      }
      if (left < right) return sortDirection === "asc" ? -1 : 1;
      if (left > right) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return cloned;
  };

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const tripStatusOk =
        columnFilters.trip_status.length === 0 ||
        columnFilters.trip_status.includes(getTripStatusLabel(trip));
      const podStatusOk =
        columnFilters.pod_status.length === 0 ||
        columnFilters.pod_status.includes(getPodStatusLabel(trip));
      const invStatusOk =
        columnFilters.invoice_status_1.length === 0 ||
        columnFilters.invoice_status_1.includes(getInvStatusLabel(trip));
      return tripStatusOk && podStatusOk && invStatusOk;
    });
  }, [trips, columnFilters]);

  const sortedTrips = useMemo(
    () => sortTrips(filteredTrips),
    [filteredTrips, sortKey, sortDirection],
  );
  const totalPages = Math.max(1, Math.ceil(sortedTrips.length / pageSize));
  const paginatedTrips = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return sortedTrips.slice(start, start + pageSize);
  }, [sortedTrips, page, pageSize, totalPages]);

  const toggleSort = (
    key:
      | "id"
      | "trip_date"
      | "client_name"
      | "vendor_name"
      | "amount"
      | "invoice_status_display",
  ) => {
    setPage(1);
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const uniqueValues = useMemo(() => {
    const summarize = (values: string[]) => {
      const counts = new Map<string, number>();
      values
        .filter((v) => v && v.trim() !== "")
        .forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
      return Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, count }));
    };
    return {
      trip_status: summarize(trips.map((t) => getTripStatusLabel(t))),
      pod_status: summarize(trips.map((t) => getPodStatusLabel(t))),
      invoice_status_1: summarize(trips.map((t) => getInvStatusLabel(t))),
    };
  }, [trips]);

  const toggleColumnFilterValue = (
    key: "trip_status" | "pod_status" | "invoice_status_1",
    value: string,
  ) => {
    setPage(1);
    setColumnFilters((prev) => {
      const has = prev[key].includes(value);
      return {
        ...prev,
        [key]: has
          ? prev[key].filter((v) => v !== value)
          : [...prev[key], value],
      };
    });
  };

  const activeFilterCount =
    columnFilters.trip_status.length +
    columnFilters.pod_status.length +
    columnFilters.invoice_status_1.length;

  const clearAllColumnFilters = () => {
    setColumnFilters({
      trip_status: [],
      pod_status: [],
      invoice_status_1: [],
    });
    setPage(1);
  };

  const handleExportCsv = () => {
    const rows = sortedTrips.map((item) => ({
      trip_id: item.id || "",
      trip_date: safeDateText(item.trip_date || item.date),
      client_name: item.client_name || "",
      vendor_name: item.vendor_name || "",
      lr_no: item.lr_numbers?.join(" | ") || "",
      pp_location: item.pp_location || "",
      drop_point: item.drop_point || "",
      value_inr: item.amount || 0,
      trip_status: item.trip_status || "",
      pod_status: item.pod_status || "",
      pod_date: safeDateText(item.pod_received_date),
      inv_status_1: item.invoice_status_1 || "",
      invoice_no: item.invoice_no || "",
      queue_status: item.invoice_status_display || "",
    }));
    const headers = Object.keys(rows[0] || {});
    if (headers.length === 0) {
      Alert.alert("Export", "No rows available for export.");
      return;
    }
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const value = String((r as Record<string, unknown>)[h] ?? "");
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pod_reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }
    Alert.alert("Export", "CSV export is available on web.");
  };

  if (!allowed) {
    return (
      <View
        style={[
          styles.blocked,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={styles.blockedTitle}>Not available</Text>
        <Text style={styles.blockedBody}>
          Your account does not have access to manage PODs.
        </Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (orgLoading || !orgId)
    return (
      <CenteredLoadingView
        message={orgLoading ? "Loading..." : "No organization"}
      />
    );

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          flexDirection: "column",
        },
      ]}
    >
      <View style={styles.financeHeader}>
        <View style={styles.financeHeaderInner}>
          <View
            style={[
              styles.financeTopTabs,
              !isMediumScreen && styles.financeTopTabsMobile,
            ]}
          >
            <Pressable
              style={styles.financeBack}
              onPress={() => router.back()}
              hitSlop={12}
            >
              <FontAwesome name="arrow-left" size={16} color="#fff" />
            </Pressable>
            {isMediumScreen ? (
              <View style={styles.financeTabsGroup}>
                <Pressable
                  style={[
                    styles.financeTabBtn,
                    activeTab === "pod_pending" && styles.financeTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("pod_pending")}
                >
                  <Text
                    style={[
                      styles.financeTabText,
                      activeTab === "pod_pending" &&
                        styles.financeTabTextActive,
                    ]}
                  >
                    Pending ({summaryData?.pod_pending_count || 0})
                  </Text>
                  {activeTab === "pod_pending" ? (
                    <View style={styles.financeTabUnderline} />
                  ) : null}
                </Pressable>
                <Pressable
                  style={[
                    styles.financeTabBtn,
                    activeTab === "received" && styles.financeTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("received")}
                >
                  <Text
                    style={[
                      styles.financeTabText,
                      activeTab === "received" && styles.financeTabTextActive,
                    ]}
                  >
                    Received ({summaryData?.received_count || 0})
                  </Text>
                  {activeTab === "received" ? (
                    <View style={styles.financeTabUnderline} />
                  ) : null}
                </Pressable>
                <Pressable
                  style={[
                    styles.financeTabBtn,
                    activeTab === "approved" && styles.financeTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("approved")}
                >
                  <Text
                    style={[
                      styles.financeTabText,
                      activeTab === "approved" && styles.financeTabTextActive,
                    ]}
                  >
                    Ready ({summaryData?.approved_count || 0})
                  </Text>
                  {activeTab === "approved" ? (
                    <View style={styles.financeTabUnderline} />
                  ) : null}
                </Pressable>
                <Pressable
                  style={[
                    styles.financeTabBtn,
                    activeTab === "invoiced" && styles.financeTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("invoiced")}
                >
                  <Text
                    style={[
                      styles.financeTabText,
                      activeTab === "invoiced" && styles.financeTabTextActive,
                    ]}
                  >
                    Invoiced ({summaryData?.invoiced_count || 0})
                  </Text>
                  {activeTab === "invoiced" ? (
                    <View style={styles.financeTabUnderline} />
                  ) : null}
                </Pressable>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.financeTabsScrollMobile}
              >
                <Pressable
                  style={[
                    styles.financeTabBtn,
                    styles.financeTabBtnMobile,
                    activeTab === "pod_pending" && styles.financeTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("pod_pending")}
                >
                  <Text
                    style={[
                      styles.financeTabText,
                      styles.financeTabTextMobile,
                      activeTab === "pod_pending" &&
                        styles.financeTabTextActive,
                    ]}
                  >
                    Pending ({summaryData?.pod_pending_count || 0})
                  </Text>
                  {activeTab === "pod_pending" ? (
                    <View style={styles.financeTabUnderline} />
                  ) : null}
                </Pressable>
                <Pressable
                  style={[
                    styles.financeTabBtn,
                    styles.financeTabBtnMobile,
                    activeTab === "received" && styles.financeTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("received")}
                >
                  <Text
                    style={[
                      styles.financeTabText,
                      styles.financeTabTextMobile,
                      activeTab === "received" && styles.financeTabTextActive,
                    ]}
                  >
                    Received ({summaryData?.received_count || 0})
                  </Text>
                  {activeTab === "received" ? (
                    <View style={styles.financeTabUnderline} />
                  ) : null}
                </Pressable>
                <Pressable
                  style={[
                    styles.financeTabBtn,
                    styles.financeTabBtnMobile,
                    activeTab === "approved" && styles.financeTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("approved")}
                >
                  <Text
                    style={[
                      styles.financeTabText,
                      styles.financeTabTextMobile,
                      activeTab === "approved" && styles.financeTabTextActive,
                    ]}
                  >
                    Ready ({summaryData?.approved_count || 0})
                  </Text>
                  {activeTab === "approved" ? (
                    <View style={styles.financeTabUnderline} />
                  ) : null}
                </Pressable>
                <Pressable
                  style={[
                    styles.financeTabBtn,
                    styles.financeTabBtnMobile,
                    activeTab === "invoiced" && styles.financeTabBtnActive,
                  ]}
                  onPress={() => setActiveTab("invoiced")}
                >
                  <Text
                    style={[
                      styles.financeTabText,
                      styles.financeTabTextMobile,
                      activeTab === "invoiced" && styles.financeTabTextActive,
                    ]}
                  >
                    Invoiced ({summaryData?.invoiced_count || 0})
                  </Text>
                  {activeTab === "invoiced" ? (
                    <View style={styles.financeTabUnderline} />
                  ) : null}
                </Pressable>
              </ScrollView>
            )}
          </View>
          <View
            style={[
              styles.financeTotalsRow,
              !isMediumScreen && styles.financeTotalsRowMobile,
            ]}
          >
            <View>
              <Text style={styles.financeTotalsLabel}>TOTAL PENDING</Text>
              <Text style={styles.financeTotalsValue}>{totalPending}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.financeTotalsLabel, { color: "#6ee7b7" }]}>
                TOTAL INVOICED
              </Text>
              <Text style={styles.financeTotalsValue}>{totalInvoiced}</Text>
            </View>
          </View>
          <View
            style={[
              styles.financeActionRow,
              !isMediumScreen && styles.financeActionRowMobile,
            ]}
          >
            {financeTab === "OVERVIEW" ? (
              <View
                style={[
                  styles.financeActionRight,
                  !isMediumScreen && styles.financeActionRightMobile,
                ]}
              >
                <Pressable
                  style={styles.financePrimaryBtn}
                  onPress={() => setFinanceTab("LOG_INCOMING")}
                >
                  <FontAwesome name="plus" size={12} color="#fff" />
                  <Text style={styles.financePrimaryBtnText}>
                    LOG INCOMING PODs
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {financeTab === "LOG_INCOMING" ? (
        <View style={{ flex: 1 }}>
          <LogIncomingPodsScreen embedded />
        </View>
      ) : (
        <>
          <View style={styles.metricsContainer}>
            {/*
        <View style={styles.velocityBanner}>
          <View style={styles.velocityBannerIcon}>
            <FontAwesome name="line-chart" size={16} color={Theme.primary} />
          </View>
          <View style={styles.velocityBannerTextWrap}>
            <Text style={styles.velocityTitle}>Weekly Reconciliation Velocity</Text>
            <Text style={styles.velocityText}>
              You've cleared 18% more PODs this week compared to the previous cycle. Efficiency is trending upward.
            </Text>
          </View>
        </View>

        <View style={styles.agingRow}>
          <View style={styles.agingHeader}>
            <Text style={styles.agingTitle}>TODAY</Text>
            <Text style={styles.agingSubTitle}>Pending Value by Aging</Text>
          </View>
          <View style={styles.agingBlocks}>
            <View style={styles.agingBlock}>
              <Text style={styles.agingBlockLabel}>0-7 Days</Text>
              <Text style={styles.agingBlockVal}>₹ 98.0 L</Text>
            </View>
            <View style={styles.agingDivider} />
            <View style={styles.agingBlock}>
              <Text style={styles.agingBlockLabel}>8-15 Days</Text>
              <Text style={styles.agingBlockVal}>₹ 65.4 L</Text>
            </View>
            <View style={styles.agingDivider} />
            <View style={styles.agingBlock}>
              <Text style={styles.agingBlockLabel}>15+ Days</Text>
              <Text style={[styles.agingBlockVal, { color: "#b00020" }]}>₹ 54.5 L</Text>
            </View>
          </View>
        </View>
        */}

            {isMediumScreen ? (
              <View style={styles.metricsGrid}>
                <View style={styles.metricsGridItem}>
                  <MetricCard
                    label="POD Pending"
                    value={formatCurrencySimple(
                      summaryData?.pod_pending_sum || 0,
                    )}
                    count={summaryData?.pod_pending_count || 0}
                    color="#b00020"
                    icon="warning"
                  />
                </View>
                <View style={styles.metricsGridItem}>
                  <MetricCard
                    label="Needs Action"
                    value={formatCurrencySimple(summaryData?.received_sum || 0)}
                    count={summaryData?.received_count || 0}
                    color="#b45309"
                    icon="inbox"
                  />
                </View>
                <View style={styles.metricsGridItem}>
                  <MetricCard
                    label="Ready for Invoice"
                    value={formatCurrencySimple(summaryData?.approved_sum || 0)}
                    count={summaryData?.approved_count || 0}
                    color="#059669"
                    icon="check-circle"
                  />
                </View>
                <View style={styles.metricsGridItem}>
                  <MetricCard
                    label="Invoiced"
                    value={formatCurrencySimple(summaryData?.invoiced_sum || 0)}
                    count={summaryData?.invoiced_count || 0}
                    color={Theme.primary}
                    icon="file-text-o"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.metricsGridMobile}>
                <View
                  style={[
                    styles.metricsGridItemMobile,
                    width < 390 && styles.metricsGridItemMobileNarrow,
                  ]}
                >
                  <MetricCard
                    compact
                    label="POD Pending"
                    value={formatCurrencySimple(
                      summaryData?.pod_pending_sum || 0,
                    )}
                    count={summaryData?.pod_pending_count || 0}
                    color="#b00020"
                    icon="warning"
                  />
                </View>
                <View
                  style={[
                    styles.metricsGridItemMobile,
                    width < 390 && styles.metricsGridItemMobileNarrow,
                  ]}
                >
                  <MetricCard
                    compact
                    label="Needs Action"
                    value={formatCurrencySimple(summaryData?.received_sum || 0)}
                    count={summaryData?.received_count || 0}
                    color="#b45309"
                    icon="inbox"
                  />
                </View>
                <View
                  style={[
                    styles.metricsGridItemMobile,
                    width < 390 && styles.metricsGridItemMobileNarrow,
                  ]}
                >
                  <MetricCard
                    compact
                    label="Ready for Invoice"
                    value={formatCurrencySimple(summaryData?.approved_sum || 0)}
                    count={summaryData?.approved_count || 0}
                    color="#059669"
                    icon="check-circle"
                  />
                </View>
                <View
                  style={[
                    styles.metricsGridItemMobile,
                    width < 390 && styles.metricsGridItemMobileNarrow,
                  ]}
                >
                  <MetricCard
                    compact
                    label="Invoiced"
                    value={formatCurrencySimple(summaryData?.invoiced_sum || 0)}
                    count={summaryData?.invoiced_count || 0}
                    color={Theme.primary}
                    icon="file-text-o"
                  />
                </View>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.mainColumn}>
              <View style={styles.filtersArea}>
                <View style={styles.searchBox}>
                  <FontAwesome
                    name="search"
                    size={14}
                    color={Theme.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search Trip ID, Client, LR..."
                    placeholderTextColor={Theme.textMuted}
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                  />
                  {searchTerm !== "" && (
                    <Pressable onPress={() => setSearchTerm("")}>
                      <FontAwesome
                        name="times-circle"
                        size={16}
                        color={Theme.textMuted}
                      />
                    </Pressable>
                  )}
                </View>
                <Pressable
                  style={styles.regionFilter}
                  onPress={() => setRegionModalOpen(true)}
                >
                  <FontAwesome
                    name="map-marker"
                    size={14}
                    color={Theme.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.regionFilterText}>
                    {regionFilter === "All" ? "Region: All" : regionFilter}
                  </Text>
                  <FontAwesome
                    name="chevron-down"
                    size={10}
                    color={Theme.textMuted}
                    style={{ marginLeft: 6 }}
                  />
                </Pressable>
                {isMediumScreen && (
                  <View style={styles.viewModeWrap}>
                    <Pressable
                      style={[
                        styles.viewModeBtn,
                        viewMode === "cards" && styles.viewModeBtnActive,
                      ]}
                      onPress={() => setViewMode("cards")}
                    >
                      <FontAwesome
                        name="th-large"
                        size={12}
                        color={viewMode === "cards" ? "#fff" : Theme.textMuted}
                      />
                      <Text
                        style={[
                          styles.viewModeText,
                          viewMode === "cards" && styles.viewModeTextActive,
                        ]}
                      >
                        Cards
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.viewModeBtn,
                        viewMode === "table" && styles.viewModeBtnActive,
                      ]}
                      onPress={() => setViewMode("table")}
                    >
                      <FontAwesome
                        name="table"
                        size={12}
                        color={viewMode === "table" ? "#fff" : Theme.textMuted}
                      />
                      <Text
                        style={[
                          styles.viewModeText,
                          viewMode === "table" && styles.viewModeTextActive,
                        ]}
                      >
                        Table
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={styles.contentArea}>
                {isLoading && !isRefetching ? (
                  <ActivityIndicator
                    size="large"
                    color={Theme.primary}
                    style={{ marginTop: 40 }}
                  />
                ) : isError ? (
                  <View style={styles.errorArea}>
                    <Text style={styles.errorText}>Could not load data</Text>
                    {error && (
                      <Text style={styles.errorDetail}>
                        {(error as any).message || String(error)}
                      </Text>
                    )}
                    <Pressable
                      style={styles.retryBtn}
                      onPress={() => refetch()}
                    >
                      <Text style={styles.retryBtnText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : trips.length === 0 ? (
                  <View style={styles.empty}>
                    <FontAwesome
                      name="folder-open-o"
                      size={48}
                      color={Theme.borderMedium}
                    />
                    <Text style={styles.emptyTitle}>
                      No trips in this queue
                    </Text>
                    <Text style={styles.emptySub}>
                      Try adjusting your filters or tab selection.
                    </Text>
                  </View>
                ) : viewMode === "table" && isMediumScreen ? (
                  <View style={styles.tableWrap}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator
                      {...tabBarScrollProps}
                    >
                      <View style={styles.tableInner}>
                        <View style={styles.tableHeadRow}>
                          <TableHeaderCell
                            label="Trip ID"
                            onPress={() => toggleSort("id")}
                            id="id"
                            sortKey={sortKey}
                            sortDirection={sortDirection}
                          />
                          <TableHeaderCell
                            label="Trip Date"
                            onPress={() => toggleSort("trip_date")}
                            id="trip_date"
                            sortKey={sortKey}
                            sortDirection={sortDirection}
                          />
                          <TableHeaderCell
                            label="Client Name"
                            onPress={() => toggleSort("client_name")}
                            id="client_name"
                            sortKey={sortKey}
                            sortDirection={sortDirection}
                          />
                          <TableHeaderCell
                            label="Vendor Name"
                            onPress={() => toggleSort("vendor_name")}
                            id="vendor_name"
                            sortKey={sortKey}
                            sortDirection={sortDirection}
                          />
                          <TableHeaderCell label="LR No" />
                          <TableHeaderCell label="PP Location" />
                          <TableHeaderCell label="Drop Point" />
                          <TableHeaderCell
                            label="Value (₹)"
                            onPress={() => toggleSort("amount")}
                            align="right"
                            id="amount"
                            sortKey={sortKey}
                            sortDirection={sortDirection}
                          />
                          <TableHeaderCell label="Trip Status" />
                          <TableHeaderCell
                            label="POD Status"
                            onPress={() => toggleSort("invoice_status_display")}
                            id="invoice_status_display"
                            sortKey={sortKey}
                            sortDirection={sortDirection}
                          />
                          <TableHeaderCell label="POD Date" />
                          <TableHeaderCell label="Inv Status 1" />
                          <TableHeaderCell label="Invoice No" />
                          <TableHeaderCell label="Actions" align="right" />
                        </View>
                        {paginatedTrips.map((item, index) => (
                          <View
                            key={item.internal_id}
                            style={[
                              styles.tableRow,
                              index % 2 === 0
                                ? styles.tableRowEven
                                : styles.tableRowOdd,
                            ]}
                          >
                            <TableCell
                              text={item.id || "—"}
                              mono
                              strong
                              color={Theme.primary}
                            />
                            <TableCell
                              text={safeDateText(item.trip_date || item.date)}
                            />
                            <TableCell text={item.client_name || "—"} strong />
                            <TableCell text={item.vendor_name || "—"} />
                            <TableCell
                              text={
                                item.lr_numbers?.length
                                  ? item.lr_numbers.length > 1
                                    ? `${item.lr_numbers[0]} +${item.lr_numbers.length - 1}`
                                    : item.lr_numbers[0]
                                  : "—"
                              }
                              mono
                            />
                            <TableCell text={item.pp_location || "—"} />
                            <TableCell text={item.drop_point || "—"} />
                            <TableCell
                              text={(item.amount || 0).toLocaleString()}
                              mono
                              strong
                              align="right"
                            />
                            <TableCell text={getTripStatusLabel(item)} />
                            <TableStatusCell trip={item} />
                            <TableCell
                              text={safeDateText(item.pod_received_date)}
                            />
                            <TableCell text={getInvStatusLabel(item)} />
                            <TableCell text={item.invoice_no || "—"} mono />
                            <TableActionCell
                              trip={item}
                              onReview={() => {
                                setSelectedTrip(item);
                                setValidationModalOpen(true);
                              }}
                              onLog={() => router.push("/log-incoming-pods")}
                              onOpenInvoicing={() =>
                                router.push("/invoicing-execute")
                              }
                            />
                          </View>
                        ))}
                      </View>
                    </ScrollView>

                    <View style={styles.tableFooter}>
                      <Text style={styles.tableFooterText}>
                        Showing{" "}
                        {sortedTrips.length === 0
                          ? 0
                          : Math.min(
                              (page - 1) * pageSize + 1,
                              sortedTrips.length,
                            )}
                        -{Math.min(page * pageSize, sortedTrips.length)} of{" "}
                        {sortedTrips.length}
                      </Text>
                      <View style={styles.tableFooterControls}>
                        <Pressable
                          style={styles.tablePagerBtn}
                          onPress={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          <FontAwesome
                            name="chevron-left"
                            size={12}
                            color={
                              page <= 1
                                ? Theme.borderMedium
                                : Theme.textPrimaryDark
                            }
                          />
                        </Pressable>
                        <Text style={styles.tablePagerText}>
                          Page {Math.min(page, totalPages)} / {totalPages}
                        </Text>
                        <Pressable
                          style={styles.tablePagerBtn}
                          onPress={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                          }
                          disabled={page >= totalPages}
                        >
                          <FontAwesome
                            name="chevron-right"
                            size={12}
                            color={
                              page >= totalPages
                                ? Theme.borderMedium
                                : Theme.textPrimaryDark
                            }
                          />
                        </Pressable>
                        <View style={styles.pageSizeWrap}>
                          {[20, 50, 100].map((size) => (
                            <Pressable
                              key={size}
                              style={[
                                styles.pageSizeBtn,
                                pageSize === size && styles.pageSizeBtnActive,
                              ]}
                              onPress={() => {
                                setPageSize(size as 20 | 50 | 100);
                                setPage(1);
                              }}
                            >
                              <Text
                                style={[
                                  styles.pageSizeText,
                                  pageSize === size &&
                                    styles.pageSizeTextActive,
                                ]}
                              >
                                {size}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <ScrollView
                    refreshControl={
                      <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={refetch}
                        tintColor={Theme.primary}
                      />
                    }
                    {...tabBarScrollProps}
                    contentContainerStyle={[
                      styles.listContent,
                      {
                        paddingBottom: Math.max(
                          40,
                          insets.bottom +
                            Layout.demoTabBarScrollBottomInset +
                            12,
                        ),
                      },
                    ]}
                  >
                    <View
                      style={
                        isLargeScreen
                          ? styles.gridContainer
                          : isMediumScreen
                            ? styles.gridContainerTablet
                            : styles.listContainerMobile
                      }
                    >
                      {trips.map((item) => (
                        <View
                          key={item.internal_id}
                          style={
                            isLargeScreen
                              ? styles.gridItem
                              : isMediumScreen
                                ? styles.gridItemTablet
                                : undefined
                          }
                        >
                          <TripRowItem
                            trip={item}
                            onPress={() => {
                              setSelectedTrip(item);
                              setValidationModalOpen(true);
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>
            </View>
          </View>
        </>
      )}

      {validationModalOpen && (
        <PodValidationView
          trip={selectedTrip}
          onClose={() => {
            setValidationModalOpen(false);
            setSelectedTrip(null);
          }}
        />
      )}

      <Modal visible={regionModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Region</Text>
            <FlatList
              data={regions}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setRegionFilter(item);
                    setRegionModalOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalRowText,
                      regionFilter === item && {
                        color: Theme.primary,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {item}
                  </Text>
                  {regionFilter === item && (
                    <FontAwesome name="check" size={16} color={Theme.primary} />
                  )}
                </Pressable>
              )}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setRegionModalOpen(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={filtersModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.modalTitle}>Table Filters</Text>
              {activeFilterCount > 0 ? (
                <Pressable onPress={clearAllColumnFilters}>
                  <Text style={styles.clearFiltersText}>Clear all</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView>
              <FilterSection
                title="Trip Status"
                values={uniqueValues.trip_status}
                selected={columnFilters.trip_status}
                onToggle={(v) => toggleColumnFilterValue("trip_status", v)}
              />
              <FilterSection
                title="POD Status"
                values={uniqueValues.pod_status}
                selected={columnFilters.pod_status}
                onToggle={(v) => toggleColumnFilterValue("pod_status", v)}
              />
              <FilterSection
                title="Inv Status 1"
                values={uniqueValues.invoice_status_1}
                selected={columnFilters.invoice_status_1}
                onToggle={(v) => toggleColumnFilterValue("invoice_status_1", v)}
              />
            </ScrollView>
            {activeFilterCount > 0 ? (
              <View style={styles.activeFiltersWrap}>
                <Text style={styles.activeFiltersTitle}>Active filters</Text>
                <View style={styles.filterChipsWrap}>
                  {columnFilters.trip_status.map((v) => (
                    <Pressable
                      key={`trip-${v}`}
                      style={styles.activeFilterChip}
                      onPress={() => toggleColumnFilterValue("trip_status", v)}
                    >
                      <Text
                        style={styles.activeFilterChipText}
                      >{`Trip: ${v} x`}</Text>
                    </Pressable>
                  ))}
                  {columnFilters.pod_status.map((v) => (
                    <Pressable
                      key={`pod-${v}`}
                      style={styles.activeFilterChip}
                      onPress={() => toggleColumnFilterValue("pod_status", v)}
                    >
                      <Text
                        style={styles.activeFilterChipText}
                      >{`POD: ${v} x`}</Text>
                    </Pressable>
                  ))}
                  {columnFilters.invoice_status_1.map((v) => (
                    <Pressable
                      key={`inv-${v}`}
                      style={styles.activeFilterChip}
                      onPress={() =>
                        toggleColumnFilterValue("invoice_status_1", v)
                      }
                    >
                      <Text
                        style={styles.activeFilterChipText}
                      >{`Inv1: ${v} x`}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <Pressable
              style={styles.modalClose}
              onPress={() => setFiltersModalOpen(false)}
            >
              <Text style={styles.modalCloseText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FilterSection({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: Array<{ value: string; count: number }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionTitle}>{title}</Text>
      {values.length === 0 ? (
        <Text style={styles.filterSectionEmpty}>No values</Text>
      ) : (
        <View style={styles.filterChipsWrap}>
          {values.map(({ value, count }) => {
            const active = selected.includes(value);
            return (
              <Pressable
                key={value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => onToggle(value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {`${value} (${count})`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function TableHeaderCell({
  label,
  onPress,
  align = "left",
  id,
  sortKey,
  sortDirection,
}: {
  label: string;
  onPress?: () => void;
  align?: "left" | "right";
  id?:
    | "id"
    | "trip_date"
    | "client_name"
    | "vendor_name"
    | "amount"
    | "invoice_status_display";
  sortKey?:
    | "id"
    | "trip_date"
    | "client_name"
    | "vendor_name"
    | "amount"
    | "invoice_status_display";
  sortDirection?: "asc" | "desc";
}) {
  const isSorted = Boolean(id && sortKey === id);
  const content = (
    <View
      style={[
        styles.tableHeadLabelWrap,
        align === "right" && styles.tableHeadLabelWrapRight,
      ]}
    >
      <Text
        style={[styles.tableHeadText, align === "right" && styles.textRight]}
      >
        {label}
      </Text>
      {onPress ? (
        <FontAwesome
          name={
            isSorted
              ? sortDirection === "asc"
                ? "sort-up"
                : "sort-down"
              : "sort"
          }
          size={10}
          color={isSorted ? Theme.primary : Theme.textMuted}
        />
      ) : null}
    </View>
  );
  return (
    <View
      style={[styles.tableHeadCell, align === "right" && styles.tableCellRight]}
    >
      {onPress ? (
        <Pressable onPress={onPress} style={styles.tableHeadPressable}>
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
}

function TableCell({
  text,
  mono,
  strong,
  color,
  align = "left",
}: {
  text: string;
  mono?: boolean;
  strong?: boolean;
  color?: string;
  align?: "left" | "right";
}) {
  return (
    <View
      style={[styles.tableCell, align === "right" && styles.tableCellRight]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.tableCellText,
          mono && styles.tableCellMono,
          strong && styles.tableCellStrong,
          align === "right" && styles.textRight,
          color ? { color } : null,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function TableStatusCell({ trip }: { trip: PodReconciliationTripView }) {
  const status = trip.invoice_status_display || "Invoice Pending";
  const isPartial =
    status === "Invoice Pending" &&
    trip.lr_numbers.length > 1 &&
    trip.trip_pods.length > 0 &&
    trip.trip_pods.length < trip.lr_numbers.length;
  const badgeText = isPartial ? "Partial" : status;
  const badgeStyle =
    status === "Invoiced"
      ? styles.tableBadgeInvoiced
      : status === "Ready for Invoice"
        ? styles.tableBadgeReady
        : status === "Received"
          ? styles.tableBadgeReceived
          : styles.tableBadgePending;

  return (
    <View style={styles.tableCell}>
      <View style={[styles.tableStatusBadge, badgeStyle]}>
        <Text style={styles.tableStatusBadgeText}>{badgeText}</Text>
      </View>
      {trip.lr_numbers.length > 0 && (
        <Text style={styles.tableStatusMeta}>
          {trip.trip_pods.length}/{trip.lr_numbers.length}
        </Text>
      )}
    </View>
  );
}

function TableActionCell({
  trip,
  onReview,
  onLog,
  onOpenInvoicing,
}: {
  trip: PodReconciliationTripView;
  onReview: () => void;
  onLog: () => void;
  onOpenInvoicing: () => void;
}) {
  let label = "View";
  let onPress = onReview;
  let toneStyle = styles.tableActionDefault;
  if (trip.invoice_status_display === "Invoice Pending") {
    label = "Log";
    onPress = onLog;
    toneStyle = styles.tableActionPending;
  } else if (trip.invoice_status_display === "Received") {
    label = "Review";
    onPress = onReview;
    toneStyle = styles.tableActionReceived;
  } else if (trip.invoice_status_display === "Invoiced") {
    label = "View";
    onPress = onOpenInvoicing;
    toneStyle = styles.tableActionDefault;
  }

  return (
    <View style={[styles.tableCell, styles.tableCellRight]}>
      <Pressable style={[styles.tableActionBtn, toneStyle]} onPress={onPress}>
        <Text style={styles.tableActionText}>{label}</Text>
      </Pressable>
    </View>
  );
}

function MetricCard({
  label,
  value,
  count,
  color,
  icon,
  compact = false,
}: {
  label: string;
  value: string;
  count: number;
  color: string;
  icon: any;
  compact?: boolean;
}) {
  return (
    <View style={[styles.metricCard, { borderColor: `${color}20` }]}>
      <View style={[styles.metricHeader, { backgroundColor: `${color}08` }]} />
      <View
        style={[
          styles.metricCardInner,
          compact && styles.metricCardInnerCompact,
        ]}
      >
        <View style={styles.metricHeaderRow}>
          <Text style={styles.metricLabel}>{label}</Text>
          <FontAwesome name={icon} size={16} color={color} />
        </View>
        <Text
          style={[styles.metricValue, compact && styles.metricValueCompact]}
        >
          {value}
        </Text>
        <Text
          style={[styles.metricSub, compact && styles.metricSubCompact]}
          numberOfLines={2}
        >
          {label === "POD Pending"
            ? "Not invoiced due to POD missing"
            : label === "Needs Action"
              ? "POD received, needs validation"
              : label === "Ready for Invoice"
                ? "POD received & ready for invoice"
                : "POD received & invoiced"}
        </Text>
        <View
          style={[styles.metricFooter, compact && styles.metricFooterCompact]}
        >
          <Text
            style={[styles.metricCount, compact && styles.metricCountCompact]}
          >
            {count} Trips
          </Text>
          <Text style={[styles.metricStatusTag, { color }]}>
            {label === "POD Pending"
              ? "Priority"
              : label === "Needs Action"
                ? "In Queue"
                : label === "Ready for Invoice"
                  ? "Actionable"
                  : "Settled"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function TabButton({ active, label, onPress }: any) {
  return (
    <Pressable
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
        {label}
      </Text>
      {active ? <View style={styles.tabBtnUnderline} /> : null}
    </Pressable>
  );
}

function TripRowItem({
  trip,
  onPress,
}: {
  trip: PodReconciliationTripView;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tripRow} onPress={onPress}>
      <View style={styles.tripRowTop}>
        <Text style={styles.tripId}>{trip.id}</Text>
        <Text style={styles.tripDate}>
          {new Date(trip.date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}
        </Text>
      </View>
      <View style={styles.tripRowMiddle}>
        <Text style={styles.clientName} numberOfLines={1}>
          {trip.client_name}
        </Text>
        <Text style={styles.tripAmount}>₹{trip.amount.toLocaleString()}</Text>
      </View>
      <View style={styles.tripRowBottom}>
        <View style={styles.routeContainer}>
          <FontAwesome name="map-marker" size={12} color={Theme.textMuted} />
          <Text style={styles.routeText} numberOfLines={1}>
            {trip.pp_location} ➔ {trip.drop_point}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                trip.invoice_status_display === "Invoiced"
                  ? "rgba(26,35,126,0.1)"
                  : trip.invoice_status_display === "Ready for Invoice"
                    ? "rgba(5,150,105,0.1)"
                    : trip.invoice_status_display === "Received"
                      ? "rgba(180,83,9,0.1)"
                      : "rgba(176,0,32,0.1)",
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              {
                color:
                  trip.invoice_status_display === "Invoiced"
                    ? Theme.primary
                    : trip.invoice_status_display === "Ready for Invoice"
                      ? "#059669"
                      : trip.invoice_status_display === "Received"
                        ? "#b45309"
                        : "#b00020",
              },
            ]}
          >
            {trip.invoice_status_display}
          </Text>
        </View>
      </View>
      {trip.lr_numbers.length > 0 && (
        <View style={styles.lrContainer}>
          <Text style={styles.lrLabel}>LRs: </Text>
          <Text style={styles.lrText} numberOfLines={1}>
            {trip.trip_pods.length}/{trip.lr_numbers.length} received
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    ...Platform.select({ web: { overflow: "hidden" } }),
  },
  financeHeader: {
    backgroundColor: Theme.darkBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.separatorDark,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  financeHeaderInner: {
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
  },
  financeTopTabs: {
    minHeight: 40,
    position: "relative",
    alignItems: "center",
  },
  financeTopTabsMobile: {
    minHeight: 0,
    paddingTop: 2,
    paddingBottom: 6,
    paddingLeft: 0,
    alignItems: "stretch",
    justifyContent: "center",
  },
  financeTabsGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 120,
  },
  financeTabsScroll: {
    gap: 8,
    paddingRight: 6,
  },
  financeTabsScrollMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 40,
    paddingRight: 8,
    paddingBottom: 2,
  },
  financeTabBtn: {
    minHeight: 24,
    minWidth: 180,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingBottom: 6,
    position: "relative",
  },
  financeTabBtnMobile: {
    minWidth: 136,
    minHeight: 22,
    paddingHorizontal: 6,
  },
  financeTabBtnActive: {},
  financeBack: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    alignItems: "center",
    justifyContent: "center",
  },
  financeTabText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: Theme.textOnDarkMuted,
  },
  financeTabTextMobile: {
    fontSize: 7,
    letterSpacing: 1.2,
  },
  financeTabTextActive: { color: Theme.textOnDark },
  financeTabUnderline: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: Theme.teslaRed,
  },
  financeTotalsRow: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  financeTotalsRowMobile: {
    marginTop: 6,
  },
  financeTotalsLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: Theme.teslaRed,
  },
  financeTotalsValue: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
  financeActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "flex-end",
  },
  financeActionRowMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  financeActionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  financeActionRightMobile: {
    justifyContent: "space-between",
  },
  financePrimaryBtn: {
    height: 34,
    borderRadius: 8,
    backgroundColor: Theme.teslaRed,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  financePrimaryBtnText: {
    color: Theme.textOnDark,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  mainColumn: {
    flexDirection: "column",
    height: "100%",
    flex: 1,
    width: "100%",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    flexWrap: "wrap",
    gap: 12,
    width: "100%",
  },
  topBarLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  iconBtn: { padding: 8, marginLeft: -8 },
  topTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8,
    gap: 12,
    flexShrink: 1,
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: Theme.textPrimaryDark },
  topSub: { fontSize: 11, color: Theme.textMuted, marginTop: 2, flexShrink: 1 },
  topBarRight: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  logPodsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  logPodsBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  velocityBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: "rgba(26,35,126,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(26,35,126,0.1)",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  velocityBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(26,35,126,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  velocityBannerTextWrap: { flex: 1 },
  velocityTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.primary,
    marginBottom: 4,
  },
  velocityText: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 18,
  },

  agingRow: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  agingHeader: { marginBottom: 12 },
  agingTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  agingSubTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  agingBlocks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  agingBlock: { flex: 1, alignItems: "center" },
  agingBlockLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  agingBlockVal: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  agingDivider: {
    width: 1,
    height: 24,
    backgroundColor: Theme.borderMedium,
  },

  metricsContainer: { paddingVertical: 16, width: "100%" },
  metricsScroll: { paddingHorizontal: 16, gap: 16 },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  metricsGridItem: {
    width: "24%",
    minWidth: 220,
    flexGrow: 1,
  },
  metricsGridMobile: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
  },
  metricsGridItemMobile: {
    width: "48.5%",
  },
  metricsGridItemMobileNarrow: {
    width: "100%",
  },
  metricCard: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  metricHeader: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  metricCardInner: {
    padding: 20,
  },
  metricCardInnerCompact: {
    padding: 12,
  },
  metricHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  metricValueCompact: {
    fontSize: 20,
    marginBottom: 6,
  },
  metricSub: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontWeight: "700",
    marginBottom: 16,
    height: 28,
  },
  metricSubCompact: {
    fontSize: 9,
    marginBottom: 10,
    height: 24,
  },
  metricFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingTop: 16,
  },
  metricFooterCompact: {
    paddingTop: 10,
  },
  metricCount: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricCountCompact: {
    fontSize: 9,
  },
  metricStatusTag: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },

  tabsContainer: {
    backgroundColor: Theme.darkBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.separatorDark,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.separatorDark,
    width: "100%",
  },
  tabsInner: {
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
  },
  tabsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    alignItems: "center",
  },
  tabBtn: {
    minHeight: 30,
    justifyContent: "center",
    position: "relative",
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  tabBtnActive: {},
  tabBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tabBtnTextActive: { color: Theme.textOnDark },
  tabBtnUnderline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: Theme.teslaRed,
  },

  filtersArea: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    width: "100%",
    flexWrap: "wrap",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    padding: 0,
    fontWeight: "600",
  },
  regionFilter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  regionFilterText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  viewModeWrap: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  viewModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  viewModeBtnActive: {
    backgroundColor: Theme.primary,
  },
  viewModeText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  viewModeTextActive: {
    color: "#fff",
  },
  tableUtilityBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableUtilityText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },

  contentArea: { flex: 1, backgroundColor: "#f8f9fa", width: "100%" },
  tableWrap: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    overflow: "hidden",
  },
  tableInner: {
    minWidth: 1560,
  },
  tableHeadRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderMedium,
  },
  tableHeadCell: {
    width: 120,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    justifyContent: "center",
  },
  tableHeadPressable: {
    alignSelf: "stretch",
  },
  tableHeadText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableHeadLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tableHeadLabelWrapRight: {
    alignSelf: "flex-end",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tableRowEven: {
    backgroundColor: Theme.cardWhite,
  },
  tableRowOdd: {
    backgroundColor: Theme.surface,
  },
  tableCell: {
    width: 120,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    justifyContent: "center",
    minHeight: 48,
  },
  tableCellRight: {
    alignItems: "flex-end",
  },
  tableCellText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tableCellMono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  tableCellStrong: {
    fontWeight: "800",
  },
  textRight: {
    textAlign: "right",
  },
  tableStatusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  tableStatusBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  tableStatusMeta: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  tableBadgePending: {
    backgroundColor: "rgba(176,0,32,0.1)",
  },
  tableBadgeReceived: {
    backgroundColor: "rgba(180,83,9,0.1)",
  },
  tableBadgeReady: {
    backgroundColor: "rgba(5,150,105,0.1)",
  },
  tableBadgeInvoiced: {
    backgroundColor: "rgba(26,35,126,0.1)",
  },
  tableActionBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  tableActionText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  tableActionPending: {
    borderColor: "rgba(26,35,126,0.25)",
    backgroundColor: "rgba(26,35,126,0.05)",
  },
  tableActionReceived: {
    borderColor: "rgba(180,83,9,0.25)",
    backgroundColor: "rgba(180,83,9,0.05)",
  },
  tableActionDefault: {
    borderColor: "rgba(5,150,105,0.25)",
    backgroundColor: "rgba(5,150,105,0.05)",
  },
  tableFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.surface,
  },
  tableFooterText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  tableFooterControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tablePagerBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  tablePagerText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  pageSizeWrap: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    overflow: "hidden",
    marginLeft: 6,
  },
  pageSizeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.cardWhite,
  },
  pageSizeBtnActive: {
    backgroundColor: Theme.primary,
  },
  pageSizeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  pageSizeTextActive: {
    color: "#fff",
  },
  listContent: { padding: 16, paddingBottom: 40 },
  listContainerMobile: { gap: 12 },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  gridItem: {
    width: "33.333%",
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  gridContainerTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  gridItemTablet: {
    width: "50%",
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  tripRow: {
    backgroundColor: Theme.cardWhite,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tripRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tripId: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.primary,
  },
  tripDate: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  tripRowMiddle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  clientName: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    flex: 1,
    marginRight: 12,
  },
  tripAmount: {
    fontSize: 14,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  tripRowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  routeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  routeText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  lrContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
  },
  lrLabel: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  lrText: { fontSize: 10, fontWeight: "700", color: Theme.textPrimaryDark },

  empty: { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    color: Theme.textMuted,
    marginTop: 8,
    textAlign: "center",
  },

  errorArea: { alignItems: "center", marginTop: 40 },
  errorText: { fontSize: 14, color: Theme.textMuted, marginBottom: 4 },
  errorDetail: {
    fontSize: 12,
    color: "#b00020",
    marginBottom: 12,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  retryBtn: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: "#fff", fontWeight: "700" },

  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    margin: 16,
    color: Theme.textPrimaryDark,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  modalRowText: { fontSize: 15, color: Theme.textPrimaryDark },
  modalClose: { marginTop: 16, alignItems: "center", padding: 16 },
  modalCloseText: { fontSize: 16, fontWeight: "700", color: Theme.primary },
  filterModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 16,
  },
  clearFiltersText: {
    color: Theme.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterSectionEmpty: {
    fontSize: 12,
    color: Theme.textMuted,
  },
  activeFiltersWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  activeFiltersTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  activeFilterChip: {
    borderRadius: 999,
    backgroundColor: "rgba(26,35,126,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeFilterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  filterChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.cardWhite,
  },
  filterChipActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  filterChipTextActive: {
    color: "#fff",
  },

  blocked: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  blockedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  blockedBody: { fontSize: 14, color: Theme.textSecondary, marginBottom: 20 },
  blockedBtn: {
    alignSelf: "flex-start",
    backgroundColor: Theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  blockedBtnText: { color: "#fff", fontWeight: "700" },
});
