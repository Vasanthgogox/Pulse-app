/**
 * Invoicing Execute Screen — adapted from cashflow InvoicingCenter / ClientSidebar / TripList.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { InvoicePreviewPanel } from "@/features/invoicing/components/InvoicePreviewPanel";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import {
    useExecuteInvoiceMutation,
    useInvoicingExecuteTripsQuery,
    usePodReconciliationSummaryQuery,
} from "@/lib/queries/useInvoicingExecuteQueries";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
    type ViewStyle,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function canAccessInvoicing(
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

export function InvoicingExecuteScreen() {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const { profile } = useAuth();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const {
    data: allTrips = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useInvoicingExecuteTripsQuery(orgId);
  const { data: summaryData } = usePodReconciliationSummaryQuery(orgId);
  const executeMutation = useExecuteInvoiceMutation(orgId);

  const [activeClient, setActiveClient] = useState<string | null>(null);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const { width } = useWindowDimensions();
  /** Below this width: stacked mobile wizard (matches POD / preview column split). */
  const INVOICING_DESKTOP_MIN = 1024;
  const isLargeScreen = width >= INVOICING_DESKTOP_MIN;
  const allowed = canAccessInvoicing(profile);
  const mobileBottomPad = layout.scrollBottomPadding(16);

  const formatCurrencySimple = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return "₹" + amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const clientStats = useMemo(() => {
    const map = new Map<
      string,
      { name: string; approved: number; received: number; pending: number }
    >();
    allTrips.forEach((t) => {
      if (!map.has(t.client)) {
        map.set(t.client, {
          name: t.client,
          approved: 0,
          received: 0,
          pending: 0,
        });
      }
      const c = map.get(t.client)!;
      if (t.status === "approved") c.approved++;
      else if (t.status === "received") c.received++;
      else if (t.status === "pending") c.pending++;
    });

    let clients = Array.from(map.values());
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      clients = clients.filter((c) => c.name.toLowerCase().includes(q));
    }
    return clients.sort(
      (a, b) => b.approved - a.approved || b.received - a.received,
    );
  }, [allTrips, clientSearch]);

  const clientTrips = useMemo(() => {
    if (!activeClient) return [];

    const parseDate = (dateStr: string) => {
      // Very basic date parser assuming YYYY-MM-DD or DD/MM/YYYY for simplicity here
      const [p1, p2, p3] = dateStr.includes("/")
        ? dateStr.split("/")
        : dateStr.split("-");
      if (dateStr.includes("/")) {
        // DD/MM/YYYY -> YYYY-MM-DD
        return new Date(`${p3}-${p2}-${p1}`);
      }
      return new Date(dateStr);
    };

    const sDate = startDate ? parseDate(startDate) : null;
    const eDate = endDate ? parseDate(endDate) : null;
    if (eDate) eDate.setHours(23, 59, 59, 999);

    const q = searchQuery.toLowerCase().trim();

    return allTrips
      .filter((t) => {
        if (t.client !== activeClient) return false;

        const supplier = (t.supplier_name || "").toLowerCase();
        if (
          q &&
          !t.id.toLowerCase().includes(q) &&
          !t.route.toLowerCase().includes(q) &&
          !supplier.includes(q)
        )
          return false;

        const tripDate = new Date(t.date);
        if (sDate && tripDate < sDate) return false;
        if (eDate && tripDate > eDate) return false;

        return true;
      })
      .sort((a, b) => {
        // Sort: Approved first, then Received, then Pending
        const statusOrder = {
          approved: 0,
          received: 1,
          pending: 2,
          warning: 3,
          blocked: 4,
        };
        return statusOrder[a.status] - statusOrder[b.status];
      });
  }, [allTrips, activeClient, searchQuery, startDate, endDate]);

  const tripsById = useMemo(() => {
    const map = new Map();
    for (const t of allTrips) map.set(t.id, t);
    return map;
  }, [allTrips]);

  const selectedTrips = useMemo(() => {
    return selectedTripIds.map((id) => tripsById.get(id)).filter(Boolean);
  }, [tripsById, selectedTripIds]);

  const invoiceableTrips = useMemo(
    () => clientTrips.filter((t) => t.status === "approved"),
    [clientTrips],
  );
  const allClientTripsSelected =
    invoiceableTrips.length > 0 &&
    invoiceableTrips.every((t) => selectedTripIds.includes(t.id));

  useEffect(() => {
    const allowedIds = new Set(invoiceableTrips.map((t) => t.id));
    setSelectedTripIds((prev) => prev.filter((id) => allowedIds.has(id)));
  }, [invoiceableTrips]);

  useEffect(() => {
    const restoreDraft = async () => {
      if (!orgId || draftRestored) return;
      try {
        const raw = await AsyncStorage.getItem(`invoicing_execute_draft_${orgId}`);
        if (!raw) {
          setDraftRestored(true);
          return;
        }
        const parsed = JSON.parse(raw) as {
          activeClient?: string;
          selectedTripIds?: string[];
          clientSearch?: string;
          searchQuery?: string;
          startDate?: string;
          endDate?: string;
          step?: 0 | 1 | 2;
        };

        if (parsed.activeClient) setActiveClient(parsed.activeClient);
        if (Array.isArray(parsed.selectedTripIds)) {
          const approvedIds = new Set(
            allTrips.filter((t) => t.status === "approved").map((t) => t.id),
          );
          setSelectedTripIds(parsed.selectedTripIds.filter((id) => approvedIds.has(id)));
        }
        if (typeof parsed.clientSearch === "string") setClientSearch(parsed.clientSearch);
        if (typeof parsed.searchQuery === "string") setSearchQuery(parsed.searchQuery);
        if (typeof parsed.startDate === "string") setStartDate(parsed.startDate);
        if (typeof parsed.endDate === "string") setEndDate(parsed.endDate);
        if (parsed.step === 0 || parsed.step === 1 || parsed.step === 2) setStep(parsed.step);
        if (typeof (parsed as { savedAt?: string }).savedAt === "string") {
          setDraftSavedAt((parsed as { savedAt?: string }).savedAt ?? null);
        }
      } catch {
        // Ignore draft restore errors.
      } finally {
        setDraftRestored(true);
      }
    };
    restoreDraft();
  }, [orgId, draftRestored, allTrips]);

  useEffect(() => {
    const persistDraft = async () => {
      if (!orgId || !draftRestored) return;
      try {
        await AsyncStorage.setItem(
          `invoicing_execute_draft_${orgId}`,
          JSON.stringify({
            activeClient,
            selectedTripIds,
            clientSearch,
            searchQuery,
            startDate,
            endDate,
            step,
            savedAt: new Date().toISOString(),
          }),
        );
        setDraftSavedAt(new Date().toISOString());
      } catch {
        // Ignore draft persistence errors.
      }
    };
    persistDraft();
  }, [
    orgId,
    draftRestored,
    activeClient,
    selectedTripIds,
    clientSearch,
    searchQuery,
    startDate,
    endDate,
    step,
  ]);

  const handleToggleTrip = useCallback((id: string) => {
    const trip = tripsById.get(id);
    if (!trip || trip.status !== "approved") {
      Alert.alert(
        "Not invoiceable",
        "Only trips with Approved status can be selected for invoice issuance.",
      );
      return;
    }
    setSelectedTripIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }, [tripsById]);

  const handleSelectAll = useCallback(() => {
    const invoiceableTrips = clientTrips.filter((t) => t.status === "approved");

    if (invoiceableTrips.length === 0) {
      return;
    }

    const allInvoiceableSelected = invoiceableTrips.every((t) =>
      selectedTripIds.includes(t.id),
    );

    if (allInvoiceableSelected) {
      const ids = invoiceableTrips.map((t) => t.id);
      setSelectedTripIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      const ids = invoiceableTrips.map((t) => t.id);
      setSelectedTripIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  }, [clientTrips, selectedTripIds]);

  const selectClient = (clientName: string) => {
    setActiveClient(clientName);
    setSelectedTripIds([]);
    setStep(1);
  };

  const handlePreview = useCallback(
    (params: any) => {
      router.push({
        pathname: "/invoicing/pdf-preview",
        params: {
          ...params,
        },
      });
    },
    [router],
  );

  const exportTripsToCsv = useCallback(
    (trips: any[], kind: "selected" | "filtered") => {
      if (!trips.length) {
        Alert.alert("Export", "No trips to export.");
        return;
      }
      const rows = trips.map((t) => ({
        trip_id: t?.id ?? "",
        internal_id: t?.internal_id ?? "",
        client: t?.client ?? "",
        date: t?.date ?? "",
        supplier: t?.supplier_name ?? "",
        route: t?.route ?? "",
        amount_inr: t?.amount ?? 0,
        status: t?.status ?? "",
      }));
      const headers = Object.keys(rows[0] || {});
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

      const slug = (activeClient || "export").replace(/[^\w\-]+/g, "_").slice(0, 48);
      const filename = `invoicing_${kind}_${slug}_${new Date().toISOString().slice(0, 10)}.csv`;

      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      Alert.alert("Export", "CSV export is available on web.");
    },
    [activeClient],
  );

  const handleBulkActions = useCallback(() => {
    if (!activeClient) {
      Alert.alert("Bulk actions", "Select a strategic partner first.");
      return;
    }
    if (clientTrips.length === 0) {
      Alert.alert("Bulk actions", "No trips in the current view.");
      return;
    }
    Alert.alert(
      "Bulk actions",
      `${invoiceableTrips.length}/${clientTrips.length} approved in view · ${selectedTripIds.length} selected`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Select all in view",
          onPress: () => handleSelectAll(),
        },
        {
          text: "Clear selection",
          onPress: () => setSelectedTripIds([]),
        },
        {
          text: "Reset invoice draft",
          onPress: async () => {
            setSelectedTripIds([]);
            setSearchQuery("");
            setStartDate("");
            setEndDate("");
            setClientSearch("");
            setActiveClient(null);
            setStep(0);
            setDraftSavedAt(null);
            if (orgId) {
              await AsyncStorage.removeItem(`invoicing_execute_draft_${orgId}`);
            }
          },
        },
        {
          text: "Export filtered list",
          onPress: () => exportTripsToCsv(clientTrips, "filtered"),
        },
      ],
    );
  }, [
    activeClient,
    clientTrips,
    selectedTripIds.length,
    invoiceableTrips.length,
    handleSelectAll,
    exportTripsToCsv,
    orgId,
  ]);

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
          Your account does not have access to execute invoices.
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
  if (isLoading)
    return <CenteredLoadingView message="Syncing with Supabase..." />;
  if (isError) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.blockedTitle}>Could not load data</Text>
        <Text style={styles.blockedBody}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
        <Pressable style={styles.blockedBtn} onPress={() => refetch()}>
          <Text style={styles.blockedBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const renderPartnerList = () => (
    <FlatList
      data={clientStats}
      keyExtractor={(item) => item.name}
      {...tabBarScrollProps}
      contentContainerStyle={{
        paddingBottom: isLargeScreen ? 0 : mobileBottomPad,
      }}
      renderItem={({ item: client }) => (
        <Pressable
          style={[
            styles.clientRow,
            activeClient === client.name && styles.clientRowActive,
          ]}
          onPress={() => selectClient(client.name)}
        >
          {activeClient === client.name && (
            <View style={styles.clientRowIndicator} />
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.clientRowTop}>
              <Text
                style={[
                  styles.clientName,
                  activeClient === client.name && { color: Theme.primary },
                ]}
              >
                {client.name}
              </Text>
              {client.approved > 0 ? (
                <Text style={styles.tagApproved}>Invoice Pending</Text>
              ) : client.received > 0 ? (
                <Text style={styles.tagReceived}>Audit Required</Text>
              ) : client.pending > 0 ? (
                <Text style={styles.tagPending}>POD Pending</Text>
              ) : (
                <Text style={styles.tagSettled}>Settled</Text>
              )}
            </View>
            <View style={styles.clientRowBottom}>
              <View style={styles.clientBilled}>
                <View style={styles.dot} />
                <Text style={styles.clientBilledText}>
                  Last Billed: Today
                </Text>
              </View>
              <FontAwesome
                name="chevron-right"
                size={12}
                color={
                  activeClient === client.name
                    ? Theme.primary
                    : Theme.textMuted
                }
              />
            </View>
          </View>
        </Pressable>
      )}
    />
  );

  const renderSidebar = () => (
    <>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarTitle}>Strategic Partners</Text>
        <Text style={styles.sidebarBadge}>{clientStats.length} Online</Text>
      </View>
      <View style={styles.sidebarSearch}>
        <FontAwesome
          name="search"
          size={14}
          color={Theme.textMuted}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.sidebarInput}
          placeholder="Search partners..."
          placeholderTextColor={Theme.textMuted}
          value={clientSearch}
          onChangeText={setClientSearch}
        />
      </View>
      {renderPartnerList()}
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.financeHeader}>
        <View style={styles.financeHeaderInner}>
          <View style={[styles.heroRow, !isLargeScreen && styles.heroRowMobile]}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>Revenue & Invoicing</Text>
              <Text style={styles.heroSub}>Execute invoices for confirmed trips</Text>
              {draftSavedAt ? (
                <Text style={styles.heroDraftMeta}>
                  Draft auto-saved:{" "}
                  {new Date(draftSavedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              ) : null}
            </View>

            {isLargeScreen ? (
              <View style={styles.kpiRowDesktop}>
                <View style={styles.kpiBlock}>
                  <Text style={styles.kpiLabelRed}>POD Pending</Text>
                  <Text style={styles.kpiValue}>
                    {formatCurrencySimple(summaryData?.pod_pending_sum || 0)}
                  </Text>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiBlock}>
                  <Text style={styles.kpiLabelMuted}>Needs Action</Text>
                  <Text style={styles.kpiValueMuted}>
                    {formatCurrencySimple(summaryData?.received_sum || 0)}
                  </Text>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiBlock}>
                  <Text style={styles.kpiLabelGreen}>Ready</Text>
                  <Text style={styles.kpiValueGreen}>
                    {formatCurrencySimple(summaryData?.approved_sum || 0)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {!isLargeScreen ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.kpiScrollMobile}
              contentContainerStyle={styles.kpiRow}
            >
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabelRed}>POD Pending</Text>
                <Text style={styles.kpiValue}>
                  {formatCurrencySimple(summaryData?.pod_pending_sum || 0)}
                </Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabelMuted}>Needs Action</Text>
                <Text style={styles.kpiValueMuted}>
                  {formatCurrencySimple(summaryData?.received_sum || 0)}
                </Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabelGreen}>Ready</Text>
                <Text style={styles.kpiValueGreen}>
                  {formatCurrencySimple(summaryData?.approved_sum || 0)}
                </Text>
              </View>
            </ScrollView>
          ) : null}

          {isLargeScreen ? (
            <View style={styles.invHeaderToolbar}>
              <View
                style={[
                  styles.invHeaderSearchWrap,
                  Platform.OS === "web" && styles.invHeaderSearchWrapWeb,
                ]}
              >
                <FontAwesome
                  name="search"
                  size={12}
                  color={Theme.textOnDarkMuted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={[
                    styles.invHeaderSearchInput,
                    Platform.OS === "web" && styles.invHeaderSearchInputWeb,
                  ]}
                  placeholder="Search transactions..."
                  placeholderTextColor={Theme.textOnDarkMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={120}
                />
              </View>

              <View style={styles.invHeaderToolbarActions}>
                <View style={styles.invHeaderDateWrap}>
                  <FontAwesome
                    name="calendar"
                    size={12}
                    color={Theme.textOnDarkMuted}
                    style={{ marginRight: 6 }}
                  />
                  <TextInput
                    style={styles.invHeaderDateInput}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={Theme.textOnDarkMuted}
                    value={startDate}
                    onChangeText={setStartDate}
                  />
                  <Text style={styles.invHeaderDateTo}>TO</Text>
                  <TextInput
                    style={styles.invHeaderDateInput}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={Theme.textOnDarkMuted}
                    value={endDate}
                    onChangeText={setEndDate}
                  />
                  {startDate || endDate ? (
                    <Pressable
                      onPress={() => {
                        setStartDate("");
                        setEndDate("");
                      }}
                      style={{ marginLeft: 6 }}
                    >
                      <FontAwesome
                        name="times"
                        size={12}
                        color={Theme.textOnDarkMuted}
                      />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.contentArea}>
        {isLargeScreen ? (
          <View style={styles.splitLayout}>
            <View style={styles.sidebar}>{renderSidebar()}</View>
            <View
              style={[
                styles.mainArea,
                isLargeScreen && {
                  borderRightWidth: 1,
                  borderRightColor: Theme.borderLight,
                },
              ]}
            >
              <TripListContent
                tabBarScrollProps={tabBarScrollProps}
                isDesktopTripTable={isLargeScreen}
                clientTrips={clientTrips}
                activeClient={activeClient}
                selectedTripIds={selectedTripIds}
                allSelected={allClientTripsSelected}
                onSelectAll={handleSelectAll}
                onToggleTrip={handleToggleTrip}
                onBulkMenuPress={handleBulkActions}
                isTripInvoiceable={(trip: any) => trip?.status === "approved"}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
                isRefetching={isRefetching}
                refetch={refetch}
                mobileBottomPad={mobileBottomPad}
              />
            </View>
            {isLargeScreen && (
              <View style={styles.rightPanel}>
                <InvoicePreviewPanel
                  onPreview={handlePreview}
                  isFinalizing={executeMutation.isPending} // Still represents pending state for now
                  activeClient={activeClient}
                  selectedTrips={selectedTrips}
                  isStandalone={true}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {step === 0 && (
              <View style={styles.mobileStepContainer}>
                <Text
                  style={[styles.sectionLabel, styles.mobilePartnerSectionLabel]}
                >
                  Select Strategic Partner
                </Text>
                <View style={styles.invMobilePartnerToolbar}>
                  <View
                    style={[
                      styles.invMobilePartnerSearchWrap,
                      Platform.OS === "web" &&
                        styles.invMobilePartnerSearchWrapWeb,
                    ]}
                  >
                    <FontAwesome
                      name="search"
                      size={12}
                      color={Theme.textMuted}
                      style={{ marginRight: 8 }}
                    />
                    <TextInput
                      style={styles.invMobilePartnerSearchInput}
                      placeholder="Search partners..."
                      placeholderTextColor={Theme.textMuted}
                      value={clientSearch}
                      onChangeText={setClientSearch}
                    />
                  </View>
                  <View style={styles.invMobilePartnerBadge}>
                    <Text style={styles.sidebarBadge}>
                      {clientStats.length} Online
                    </Text>
                  </View>
                </View>
                {renderPartnerList()}
              </View>
            )}

            {step === 1 && (
              <View style={styles.mobileStepContainer}>
                <View style={styles.mobileConfig}>
                  <Text style={styles.sectionLabel}>Strategic Partner</Text>
                  <Pressable
                    style={styles.selectRow}
                    onPress={() => setStep(0)}
                  >
                    <Text style={styles.selectRowText} numberOfLines={1}>
                      {activeClient || "Select a client..."}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: Theme.primary,
                        fontWeight: "700",
                      }}
                    >
                      Change
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.mobileGridArea}>
                  <TripListContent
                    tabBarScrollProps={tabBarScrollProps}
                    isDesktopTripTable={isLargeScreen}
                    clientTrips={clientTrips}
                    activeClient={activeClient}
                    selectedTripIds={selectedTripIds}
                    allSelected={allClientTripsSelected}
                    onSelectAll={handleSelectAll}
                    onToggleTrip={handleToggleTrip}
                    onBulkMenuPress={handleBulkActions}
                    isTripInvoiceable={(trip: any) => trip?.status === "approved"}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    startDate={startDate}
                    setStartDate={setStartDate}
                    endDate={endDate}
                    setEndDate={setEndDate}
                    isRefetching={isRefetching}
                    refetch={refetch}
                  />
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.mobileStepContainer}>
                <View style={styles.mobileConfig}>
                  <Pressable
                    style={styles.selectRow}
                    onPress={() => setStep(1)}
                  >
                    <FontAwesome
                      name="arrow-left"
                      size={14}
                      color={Theme.textMuted}
                    />
                    <Text
                      style={[styles.selectRowText, { marginLeft: 8 }]}
                      numberOfLines={1}
                    >
                      Back to Trips ({selectedTripIds.length} selected)
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <InvoicePreviewPanel
                    onPreview={handlePreview}
                    isFinalizing={executeMutation.isPending}
                    activeClient={activeClient}
                    selectedTrips={selectedTrips}
                    isStandalone={true}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {!isLargeScreen && step === 1 && (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: layout.scrollBottomPadding(8),
            },
          ]}
        >
          <Pressable
            style={[
              styles.footerBtn,
              selectedTripIds.length === 0 && styles.footerBtnDisabled,
            ]}
            onPress={() => setStep(2)}
            disabled={selectedTripIds.length === 0}
          >
            <Text style={styles.footerBtnText}>
              Configure Invoice ({selectedTripIds.length})
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function TripListContent({
  tabBarScrollProps,
  isDesktopTripTable,
  clientTrips,
  activeClient,
  selectedTripIds,
  allSelected,
  onSelectAll,
  onToggleTrip,
  onBulkMenuPress,
  isTripInvoiceable,
  searchQuery,
  setSearchQuery,
  isRefetching,
  refetch,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  mobileBottomPad,
}: any) {
  const filterRow = (
    <>
      <View
        style={[
          styles.searchRow,
          !isDesktopTripTable && styles.searchRowMobileInline,
        ]}
      >
        <FontAwesome
          name="search"
          size={14}
          color={Theme.textMuted}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions..."
          placeholderTextColor={Theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View
        style={[
          styles.dateFilterContainer,
          !isDesktopTripTable && styles.dateFilterMobileInline,
        ]}
      >
        <View style={styles.dateRow}>
          <FontAwesome
            name="calendar"
            size={12}
            color={Theme.textMuted}
            style={{ marginRight: 6 }}
          />
          <TextInput
            style={styles.dateInput}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={Theme.textMuted}
            value={startDate}
            onChangeText={setStartDate}
          />
          <Text style={styles.dateToText}>TO</Text>
          <TextInput
            style={styles.dateInput}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={Theme.textMuted}
            value={endDate}
            onChangeText={setEndDate}
          />
          {startDate || endDate ? (
            <Pressable
              onPress={() => {
                setStartDate("");
                setEndDate("");
              }}
              style={{ marginLeft: 4 }}
            >
              <FontAwesome name="times" size={12} color={Theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <View
        style={[
          styles.listHeader,
          !isDesktopTripTable && styles.listHeaderMobile,
        ]}
      >
        <View style={styles.listHeaderTextCol}>
          <Text style={styles.listHeaderTitle}>Ready-to-Invoice Trips</Text>
          <Text style={styles.listHeaderSub} numberOfLines={1}>
            Partner:{" "}
            <Text style={{ color: Theme.primary }}>
              {activeClient || "None Selected"}
            </Text>
          </Text>
          <Text style={styles.listHeaderRule}>Approved status only</Text>
        </View>
        <Pressable
          style={
            isDesktopTripTable ? styles.bulkActionBtn : styles.bulkActionBtnMobile
          }
          onPress={() => onBulkMenuPress?.()}
          accessibilityRole="button"
          accessibilityLabel="Bulk actions"
        >
          {isDesktopTripTable ? (
            <Text style={styles.bulkActionText}>Bulk Action</Text>
          ) : (
            <FontAwesome name="sliders" size={14} color="#fff" />
          )}
        </Pressable>
      </View>
      {!isDesktopTripTable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.listFiltersScrollMobile}
          contentContainerStyle={styles.listFiltersScrollMobileContent}
        >
          {filterRow}
        </ScrollView>
      ) : null}

      {isDesktopTripTable ? (
        <View style={styles.tableHeader}>
          <Pressable style={styles.selectAllGroup} onPress={onSelectAll}>
            <View style={styles.selectAllCheckbox}>
              {allSelected && (
                <FontAwesome name="check" size={10} color={Theme.primary} />
              )}
            </View>
          </Pressable>
          <Text style={[styles.tableHeaderText, { width: 100 }]}>Date / ID</Text>
          <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Supplier</Text>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Route</Text>
          <Text
            style={[styles.tableHeaderText, { width: 80, textAlign: "right" }]}
          >
            Freight
          </Text>
          <Text
            style={[styles.tableHeaderText, { width: 60, textAlign: "right" }]}
          >
            Extras
          </Text>
          <Text
            style={[styles.tableHeaderText, { width: 80, textAlign: "center" }]}
          >
            Status
          </Text>
        </View>
      ) : null}

      <FlatList
        data={clientTrips}
        keyExtractor={(item) => item.id}
        {...tabBarScrollProps}
        refreshing={isRefetching}
        onRefresh={refetch}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: isDesktopTripTable
            ? Layout.scrollBottomPadding(24)
            : mobileBottomPad + 84,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <FontAwesome
              name="folder-open-o"
              size={40}
              color={Theme.borderMedium}
            />
            <Text style={styles.emptyTitle}>No Active Transactions</Text>
            <Text style={styles.emptySubTitle}>
              Only approved trips are selectable for invoice issuance.
            </Text>
          </View>
        }
        renderItem={({ item: trip }) => {
          const isInvoiceable = Boolean(isTripInvoiceable?.(trip));
          const isSelected = selectedTripIds.includes(trip.id);
          if (!isDesktopTripTable) {
            return (
              <Pressable
                style={[
                  styles.tripCardMobile,
                  isSelected && styles.tripCardMobileSelected,
                  !isInvoiceable && styles.tripRowDisabled,
                ]}
                onPress={() => onToggleTrip(trip.id)}
              >
                <View style={styles.tripCardMobileTop}>
                  <View>
                    <Text style={styles.tripId}>{trip.id}</Text>
                    <Text style={styles.tripDate}>
                      {new Date(trip.date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkBox,
                      isSelected && styles.checkBoxOn,
                    ]}
                  >
                    {isSelected ? (
                      <FontAwesome name="check" size={10} color="#fff" />
                    ) : null}
                  </View>
                </View>
                <Text style={styles.tripSupplier} numberOfLines={1}>
                  {trip.supplier_name}
                </Text>
                <Text style={styles.tripRoute} numberOfLines={1}>
                  {trip.route}
                </Text>
                <View style={styles.tripCardMobileBottom}>
                  <Text style={styles.tripAmount}>₹{trip.amount.toLocaleString()}</Text>
                  {trip.status === "approved" ? (
                    <Text style={styles.listTagApproved}>Approved</Text>
                  ) : trip.status === "received" ? (
                    <Text style={styles.listTagReceived}>Received</Text>
                  ) : (
                    <Text style={styles.listTagPending}>Pending</Text>
                  )}
                </View>
                {!isInvoiceable ? (
                  <Text style={styles.nonInvoiceableHint}>
                    Only approved trips can be issued as invoice.
                  </Text>
                ) : null}
              </Pressable>
            );
          }
          return (
            <Pressable
              style={[
                styles.tripTableRow,
                isSelected && styles.tripTableRowSelected,
                !isInvoiceable && styles.tripRowDisabled,
              ]}
              onPress={() => onToggleTrip(trip.id)}
            >
              <View style={styles.selectAllGroup}>
                <View
                  style={[
                    styles.checkBox,
                    isSelected && styles.checkBoxOn,
                    !isInvoiceable && styles.checkBoxDisabled,
                  ]}
                >
                  {isSelected && (
                    <FontAwesome name="check" size={10} color="#fff" />
                  )}
                </View>
              </View>

              <View style={{ width: 100 }}>
                <Text style={styles.tripDate}>
                  {new Date(trip.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
                <Text style={styles.tripId}>{trip.id}</Text>
              </View>

              <View style={{ flex: 1.5 }}>
                <Text style={styles.tripSupplier} numberOfLines={1}>
                  {trip.supplier_name}
                </Text>
              </View>

              <View style={{ flex: 2 }}>
                <Text style={styles.tripRoute} numberOfLines={1}>
                  {trip.route}
                </Text>
                <Text style={styles.tripDetails} numberOfLines={1}>
                  {trip.details || "Vehicle N/A"}
                </Text>
              </View>

              <View style={{ width: 80, alignItems: "flex-end" }}>
                <Text style={styles.tripAmount}>
                  ₹{trip.amount.toLocaleString()}
                </Text>
              </View>

              <View style={{ width: 60, alignItems: "flex-end" }}>
                <Text style={styles.tripExtras}>₹0</Text>
              </View>

              <View style={{ width: 80, alignItems: "center" }}>
                {trip.status === "approved" ? (
                  <Text style={styles.listTagApproved}>Approved</Text>
                ) : trip.status === "received" ? (
                  <Text style={styles.listTagReceived}>Received</Text>
                ) : (
                  <Text style={styles.listTagPending}>Pending</Text>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.surfaceGray },
  financeHeader: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  financeHeaderInner: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "center",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  heroRowMobile: {
    alignItems: "flex-start",
  },
  heroTextWrap: {
    minWidth: 0,
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  heroSub: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textOnDarkMuted,
    fontWeight: "600",
  },
  heroDraftMeta: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiRow: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 0,
    gap: 12,
    paddingTop: 12,
    paddingBottom: 6,
    paddingRight: Layout.screenPaddingHorizontal,
  },
  kpiScrollMobile: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    ...Platform.select({
      web: {
        overflowX: "auto" as const,
      },
    }),
  },
  invHeaderToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 10,
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.separatorDark,
  },
  invHeaderSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 0,
    minWidth: 0,
  },
  invHeaderSearchWrapWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as ViewStyle,
  invHeaderSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.textOnDark,
    paddingVertical: 0,
  },
  invHeaderSearchInputWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as any,
  invHeaderToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  invHeaderDateWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    borderRadius: 11,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
  },
  invHeaderDateInput: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    padding: 0,
    margin: 0,
    minWidth: 86,
    textTransform: "uppercase",
    ...Platform.select({
      web: { outlineStyle: "none" } as any,
    }),
  },
  invHeaderDateTo: {
    marginHorizontal: 8,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1,
  },
  kpiRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
  },
  kpiBlock: {
    minWidth: 108,
  },
  kpiLabelRed: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: Theme.teslaRed,
  },
  kpiLabelMuted: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: Theme.textOnDarkMuted,
  },
  kpiLabelGreen: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#6ee7b7",
  },
  kpiValue: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
  kpiValueMuted: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "900",
    color: Theme.textOnDarkMuted,
  },
  kpiValueGreen: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "900",
    color: "#6ee7b7",
  },
  kpiDivider: {
    width: 1,
    height: 36,
    backgroundColor: Theme.separatorDark,
  },
  topBarLeft: { flexDirection: "row", alignItems: "center" },
  iconBtn: { padding: 8, marginLeft: -8 },
  topTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8,
    gap: 12,
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: Theme.textPrimaryDark },
  topSub: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  statBox: { alignItems: "flex-end" },
  statLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statValError: { fontSize: 13, fontWeight: "800", color: "#b00020" },
  statValWarn: { fontSize: 13, fontWeight: "800", color: "#b45309" },
  statValOk: { fontSize: 13, fontWeight: "800", color: "#059669" },

  contentArea: { flex: 1, backgroundColor: Theme.surfaceGray },
  splitLayout: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 280,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  mainArea: { flex: 1, backgroundColor: Theme.surfaceGray },
  rightPanel: { width: 360, backgroundColor: Theme.screenBackground },

  sidebarHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(248,250,252,0.5)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sidebarTitle: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: Theme.textMuted,
  },
  sidebarBadge: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    textTransform: "uppercase",
  },
  sidebarSearch: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
  },
  sidebarInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },

  clientRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    backgroundColor: Theme.screenBackground,
  },
  clientRowActive: { backgroundColor: "rgba(79,70,229,0.03)" },
  clientRowIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Theme.primary,
  },
  clientRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  clientName: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  tagApproved: {
    fontSize: 9,
    fontWeight: "800",
    color: "#059669",
    backgroundColor: "rgba(5,150,105,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
  },
  tagReceived: {
    fontSize: 9,
    fontWeight: "800",
    color: "#2563eb",
    backgroundColor: "rgba(37,99,235,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
  },
  tagPending: {
    fontSize: 9,
    fontWeight: "800",
    color: "#b45309",
    backgroundColor: "rgba(180,83,9,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
  },
  tagSettled: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    backgroundColor: Theme.surfaceBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
  },
  clientRowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clientBilled: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
  },
  clientBilledText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  mobileStepContainer: { flex: 1, backgroundColor: Theme.screenBackground },
  mobilePartnerSectionLabel: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    marginBottom: 8,
  },
  invMobilePartnerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  invMobilePartnerSearchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 11,
  },
  invMobilePartnerSearchWrapWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as ViewStyle,
  invMobilePartnerSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: Platform.OS === "web" ? 8 : 6,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  invMobilePartnerBadge: {
    flexShrink: 0,
    justifyContent: "center",
  },
  mobileConfig: {
    padding: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    marginBottom: 16,
  },
  selectRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  mobileGridArea: { flex: 1, backgroundColor: "#f8f9fa" },

  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(248,250,252,0.3)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  listHeaderMobile: {
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
  },
  listHeaderTextCol: {
    flex: 1,
    minWidth: 0,
  },
  listHeaderTitle: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: Theme.textMuted,
  },
  listHeaderSub: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    marginTop: 2,
  },
  listHeaderRule: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  bulkActionBtn: {
    backgroundColor: Theme.textPrimaryDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  bulkActionText: {
    color: Theme.buttonPrimaryText,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bulkActionBtnMobile: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  listFilters: {
    padding: 16,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  searchRow: {
    flex: 1,
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchRowMobileInline: {
    flex: 0,
    flexGrow: 0,
    width: 220,
    minWidth: 200,
    maxWidth: 280,
  },
  listFiltersScrollMobile: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    ...Platform.select({
      web: {
        overflowX: "auto" as const,
      },
    }),
  },
  listFiltersScrollMobileContent: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 0,
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingRight: Layout.screenPaddingHorizontal + 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    padding: 0,
    margin: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },

  dateFilterContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateFilterMobileInline: {
    flexShrink: 0,
  },
  dateRow: { flexDirection: "row", alignItems: "center" },
  dateInput: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    padding: 0,
    margin: 0,
    minWidth: 80,
    textTransform: "uppercase",
  },
  dateToText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    marginHorizontal: 8,
    textTransform: "uppercase",
  },

  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(248,250,252,0.5)",
    gap: 12,
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  selectAllGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
  },
  selectAllCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },

  tripTableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  tripTableRowSelected: { backgroundColor: "rgba(79,70,229,0.03)" },
  tripRowDisabled: { opacity: 0.6 },
  tripCardMobile: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  tripCardMobileSelected: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.05)",
  },
  tripCardMobileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tripCardMobileBottom: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nonInvoiceableHint: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },

  checkBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  checkBoxDisabled: {
    backgroundColor: Theme.surfaceBorder,
    borderColor: Theme.borderLight,
  },

  tripDate: { fontSize: 11, fontWeight: "800", color: Theme.textPrimaryDark },
  tripId: {
    fontSize: 9,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
  },
  tripSupplier: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tripRoute: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  tripDetails: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tripAmount: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  tripExtras: {
    fontSize: 9,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textMuted,
  },

  listTagPending: {
    fontSize: 8,
    fontWeight: "800",
    color: "#b45309",
    backgroundColor: "rgba(180,83,9,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: "rgba(180,83,9,0.2)",
  },
  listTagApproved: {
    fontSize: 8,
    fontWeight: "800",
    color: "#059669",
    backgroundColor: "rgba(5,150,105,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: "rgba(5,150,105,0.2)",
  },
  listTagReceived: {
    fontSize: 8,
    fontWeight: "800",
    color: "#2563eb",
    backgroundColor: "rgba(37,99,235,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.2)",
  },
  listTagSettled: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    backgroundColor: Theme.surfaceBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },

  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  emptySubTitle: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  footerBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  footerBtnDisabled: { opacity: 0.5 },
  footerBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    margin: 16,
    color: Theme.textPrimaryDark,
  },
  modalClose: { marginTop: 16, alignItems: "center", padding: 16 },
  modalCloseText: { fontSize: 16, fontWeight: "700", color: Theme.primary },

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
  blockedBtnText: { color: Theme.buttonPrimaryText, fontWeight: "700" },
});
