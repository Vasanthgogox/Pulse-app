/**
 * Log incoming PODs — fleet ops. Ported from cashflow LogIncomingPodsPage (RN layout).
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { getCategoryLabel } from "@/constants/courierCategories";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PodAttachmentModal } from "@/features/log-pods/components/PodAttachmentModal";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import {
    useCourierPartnersQuery,
    useAddCourierPartnerMutation,
    useLogIncomingPodsMutation,
    useLogIncomingPodsTripsQuery,
    type LogPodsTripView,
} from "@/lib/queries/useLogIncomingPodsQueries";
import type {
    CourierPartnerRow,
    MappedPodAttachment,
} from "@/services/logPodsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function canAccessLogPods(
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

export function LogIncomingPodsScreen() {
  const insets = useSafeAreaInsets();
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
  } = useLogIncomingPodsTripsQuery(orgId);
  const { data: dbCourierPartners = [], isLoading: loadingCouriers } =
    useCourierPartnersQuery();
  const logMutation = useLogIncomingPodsMutation(orgId);
  const addCourierPartner = useAddCourierPartnerMutation();

  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedLRs, setSelectedLRs] = useState<Record<string, string[]>>({});
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [courierValue, setCourierValue] = useState("");
  const [customCourierName, setCustomCourierName] = useState("");
  const [courierModalOpen, setCourierModalOpen] = useState(false);
  const [courierSearch, setCourierSearch] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);

  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024;
  const isMediumScreen = width >= 768;

  const allowed = canAccessLogPods(profile);

  const handleAddCustomCourier = async () => {
    const name = courierSearch.trim();
    if (!name) return;
    try {
      const partner = await addCourierPartner.mutateAsync(name);
      if (partner) {
        setCourierValue(partner.value);
        setCustomCourierName('');
      } else {
        setCourierValue('custom');
        setCustomCourierName(name);
      }
      setCourierModalOpen(false);
      setCourierSearch('');
    } catch (e) {
      Alert.alert('Error', 'Could not add custom courier partner.');
    }
  };

  const courierLabel = useMemo(() => {
    if (courierValue === "custom") {
      return customCourierName || "Custom courier";
    }
    const match = dbCourierPartners.find((p) => p.value === courierValue);
    return match ? match.label : "";
  }, [courierValue, customCourierName, dbCourierPartners]);

  const suppliers = useMemo(() => {
    return Array.from(new Set(allTrips.map((t) => t.supplier_name))).filter(
      Boolean,
    ) as string[];
  }, [allTrips]);

  const supplierTrips = useMemo(() => {
    let trips = selectedSupplier
      ? allTrips.filter((t) => t.supplier_name === selectedSupplier)
      : allTrips;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const qNoSpace = q.replace(/\s+/g, "");
      trips = trips.filter(
        (t) =>
          (t.id && t.id.toLowerCase().includes(q)) ||
          (t.from && t.from.toLowerCase().includes(q)) ||
          (t.to && t.to.toLowerCase().includes(q)) ||
          (t.client && t.client.toLowerCase().includes(q)) ||
          (t.supplier_name && t.supplier_name.toLowerCase().includes(q)) ||
          (t.date && t.date.toLowerCase().includes(q)) ||
          (t.lrNumbers &&
            t.lrNumbers.some((lr) => {
              const l = lr.toLowerCase();
              return (
                l.includes(q) || l.includes(qNoSpace) || qNoSpace.includes(l)
              );
            })),
      );
    }
    return trips;
  }, [allTrips, selectedSupplier, searchQuery]);

  const totalDisplayLRs = useMemo(() => {
    const allLrs = new Set<string>();
    supplierTrips.forEach((t) => {
      t.lrNumbers.forEach((lr) => allLrs.add(lr));
    });
    return allLrs.size;
  }, [supplierTrips]);

  const totalSelectedPODs = useMemo(
    () => Object.values(selectedLRs).reduce((sum, arr) => sum + arr.length, 0),
    [selectedLRs],
  );

  const toggleTrip = useCallback((internalId: string, lrNumbers: string[]) => {
    setSelectedLRs((prev) => {
      const next = { ...prev };
      if (next[internalId] && next[internalId].length === lrNumbers.length) {
        delete next[internalId];
      } else {
        next[internalId] = [...lrNumbers];
      }
      return next;
    });
  }, []);

  const toggleLR = useCallback((internalId: string, lr: string) => {
    setSelectedLRs((prev) => {
      const next = { ...prev };
      const current = next[internalId] || [];
      if (current.includes(lr)) {
        next[internalId] = current.filter((l) => l !== lr);
        if (next[internalId].length === 0) delete next[internalId];
      } else {
        next[internalId] = [...current, lr];
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const isAllSelected = supplierTrips.every((t) => {
      const pendingLRs =
        t.lrNumbers.length > 0
          ? t.lrNumbers.filter((lr) => !t.receivedLRs.includes(lr))
          : ["N/A"];
      return (
        pendingLRs.length === 0 ||
        (selectedLRs[t.internal_id] &&
          selectedLRs[t.internal_id].length === pendingLRs.length)
      );
    });

    if (isAllSelected) {
      setSelectedLRs({});
    } else {
      const next: Record<string, string[]> = {};
      supplierTrips.forEach((t) => {
        const pendingLRs =
          t.lrNumbers.length > 0
            ? t.lrNumbers.filter((lr) => !t.receivedLRs.includes(lr))
            : ["N/A"];
        if (pendingLRs.length > 0) next[t.internal_id] = [...pendingLRs];
      });
      setSelectedLRs(next);
    }
  }, [supplierTrips, selectedLRs]);

  const runLog = useCallback(
    async (mappedAttachments: MappedPodAttachment[]) => {
      if (
        !courierValue ||
        (courierValue === "custom" && !customCourierName.trim())
      ) {
        Alert.alert(
          "Courier required",
          "Select a courier partner or enter a custom name.",
        );
        return;
      }
      if (totalSelectedPODs === 0) {
        Alert.alert("Selection required", "Select at least one LR to log.");
        return;
      }
      try {
        setAttachmentModalOpen(false);
        const result = await logMutation.mutateAsync({
          selectedLRs,
          allTrips,
          courierValue,
          customCourierName,
          trackingId,
          dbCourierPartners,
          mappedAttachments,
        });
        if (
          result &&
          "attachmentWarning" in result &&
          result.attachmentWarning
        ) {
          Alert.alert("Notice", result.attachmentWarning);
        }
        setSelectedLRs({});
        setCourierValue("");
        setCustomCourierName("");
        setTrackingId("");
        setCourierSearch("");
        router.back();
      } catch (e) {
        Alert.alert(
          "Error",
          e instanceof Error ? e.message : "Failed to log PODs",
        );
      }
    },
    [
      allTrips,
      courierValue,
      customCourierName,
      dbCourierPartners,
      logMutation,
      router,
      selectedLRs,
      totalSelectedPODs,
      trackingId,
    ],
  );

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.toLowerCase().includes(q));
  }, [suppliers, supplierSearch]);

  const courierSections = useMemo((): {
    title: string;
    data: CourierPartnerRow[];
  }[] => {
    const q = courierSearch.toLowerCase().trim();
    let list = dbCourierPartners;
    if (q) {
      list = list.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.value.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q)),
      );
    }
    const byCat = new Map<string, CourierPartnerRow[]>();
    list.forEach((p) => {
      const cat =
        p.category === "other" || p.is_custom ? "other" : p.category || "other";
      const arr = byCat.get(cat) ?? [];
      arr.push(p);
      byCat.set(cat, arr);
    });

    const sections = Array.from(byCat.entries())
      .filter(([, data]) => data.length > 0)
      .map(([category, data]) => ({
        title:
          category === "other" ? "Custom / Other" : getCategoryLabel(category),
        data,
      }));

    sections.sort((a, b) => {
      if (a.title === "Custom / Other") return 1;
      if (b.title === "Custom / Other") return -1;
      return a.title.localeCompare(b.title);
    });

    return sections;
  }, [dbCourierPartners, courierSearch]);

  const openLogFlow = useCallback(() => {
    if (
      !courierValue ||
      (courierValue === "custom" && !customCourierName.trim())
    ) {
      Alert.alert(
        "Courier required",
        "Select a courier partner or enter a custom name.",
      );
      return;
    }
    if (totalSelectedPODs === 0) {
      Alert.alert("Selection required", "Select at least one POD (LR) to log.");
      return;
    }
    setAttachmentModalOpen(true);
  }, [courierValue, customCourierName, totalSelectedPODs]);

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
          Your account does not have access to log incoming PODs.
        </Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (orgLoading || !orgId) {
    return (
      <CenteredLoadingView
        message={orgLoading ? "Loading organization…" : "No organization"}
      />
    );
  }

  if (isLoading || loadingCouriers) {
    return <CenteredLoadingView message="Loading trips and couriers…" />;
  }

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

  const renderSidebarContent = () => (
    <>
      <Text style={styles.sectionTitle}>Courier Information</Text>
      <Text style={styles.sectionLabel}>Supplier / Transporter</Text>
      <Pressable
        style={styles.selectRow}
        onPress={() => setSupplierModalOpen(true)}
      >
        <Text style={styles.selectRowText} numberOfLines={1}>
          {selectedSupplier || "All suppliers"}
        </Text>
        <FontAwesome name="chevron-down" size={14} color={Theme.textMuted} />
      </Pressable>

      <Text style={styles.sectionLabel}>Courier Partner</Text>
      <Pressable
        style={styles.selectRow}
        onPress={() => setCourierModalOpen(true)}
      >
        <Text style={styles.selectRowText} numberOfLines={1}>
          {courierLabel || "Select courier partner…"}
        </Text>
        {loadingCouriers ? (
          <ActivityIndicator size="small" color={Theme.primary} />
        ) : (
          <FontAwesome name="chevron-down" size={14} color={Theme.textMuted} />
        )}
      </Pressable>

      {courierValue === "custom" && (
        <TextInput
          style={styles.input}
          placeholder="Custom courier name"
          placeholderTextColor={Theme.textMuted}
          value={customCourierName}
          onChangeText={setCustomCourierName}
        />
      )}

      <Text style={styles.sectionLabel}>Tracking Number / AWB</Text>
      <TextInput
        style={[
          styles.input,
          { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
        ]}
        placeholder="Enter tracking ID"
        placeholderTextColor={Theme.textMuted}
        value={trackingId}
        onChangeText={setTrackingId}
        autoCapitalize="none"
      />

      <View style={styles.summaryContainer}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Trips Selected</Text>
            <Text style={styles.summaryVal}>
              {Object.keys(selectedLRs).length}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>PODs Selected</Text>
            <Text style={styles.summaryVal}>{totalSelectedPODs}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Courier Details</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {courierValue && trackingId ? (
                <>
                  <FontAwesome
                    name="check-circle"
                    size={12}
                    color="#1a7f4c"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.summaryVal, { color: "#1a7f4c" }]}>
                    Provided
                  </Text>
                </>
              ) : (
                <>
                  <FontAwesome
                    name="exclamation-circle"
                    size={12}
                    color="#b45309"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.summaryVal, { color: "#b45309" }]}>
                    Pending
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </View>
    </>
  );

  const renderMainContentHeader = () => (
    <View style={styles.mainHeader}>
      <View style={styles.mainHeaderLeft}>
        <Text style={styles.mainHeaderTitle}>Select Trips for POD Logging</Text>
        <View style={styles.countRow}>
          <Text style={styles.countBadge}>{supplierTrips.length} Trips</Text>
          <Text style={styles.countBadgePrimary}>
            {totalDisplayLRs} Unique LRs
          </Text>
        </View>
        <View style={styles.headerDivider} />
        <Pressable style={styles.selectAllGroup} onPress={handleSelectAll}>
          <View style={styles.selectAllCheckbox}>
            {supplierTrips.length > 0 &&
            supplierTrips.every((t) => {
              const pendingLRs =
                t.lrNumbers.length > 0
                  ? t.lrNumbers.filter((lr) => !t.receivedLRs.includes(lr))
                  : ["N/A"];
              return (
                pendingLRs.length === 0 ||
                (selectedLRs[t.id] &&
                  selectedLRs[t.id].length === pendingLRs.length)
              );
            }) ? (
              <FontAwesome name="check" size={10} color={Theme.primary} />
            ) : null}
          </View>
          <Text style={styles.selectAllText}>Select All</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <FontAwesome
          name="search"
          size={16}
          color={Theme.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search trip ID or route..."
          placeholderTextColor={Theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
    </View>
  );

  const renderTripsGrid = () => (
    <View style={styles.gridContainer}>
      {supplierTrips.length === 0 ? (
        <View style={styles.empty}>
          <FontAwesome name="truck" size={48} color={Theme.borderMedium} />
          <Text style={styles.emptyTitle}>No trips found</Text>
          <Text style={styles.emptySub}>
            Try adjusting your supplier or search filters.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {supplierTrips.map((t) => (
            <View
              key={t.internal_id}
              style={[
                styles.gridItem,
                isLargeScreen
                  ? styles.gridItemLarge
                  : isMediumScreen
                    ? styles.gridItemMedium
                    : styles.gridItemSmall,
              ]}
            >
              <TripCard
                trip={t}
                selectedSupplier={selectedSupplier}
                selectedForTrip={selectedLRs[t.internal_id] || []}
                onToggleTrip={() => {
                  const pendingLRs =
                    t.lrNumbers.length > 0
                      ? t.lrNumbers.filter((lr) => !t.receivedLRs.includes(lr))
                      : ["N/A"];
                  if (pendingLRs.length > 0)
                    toggleTrip(t.internal_id, pendingLRs);
                }}
                onToggleLR={(lr) => toggleLR(t.internal_id, lr)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityLabel="Back"
          >
            <FontAwesome name="arrow-left" size={20} color={Theme.textMuted} />
          </Pressable>
          <View style={styles.topTitleWrap}>
            <View style={styles.iconBox}>
              <FontAwesome name="archive" size={20} color={Theme.primary} />
            </View>
            <View>
              <Text style={styles.topTitle}>Log Incoming PODs</Text>
              <Text style={styles.topSub}>
                Select trips and enter incoming courier details
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.topBarRight}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.cancelBtn}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.headerLogBtn,
              (!courierValue ||
                (courierValue === "custom" && !customCourierName.trim()) ||
                totalSelectedPODs === 0 ||
                logMutation.isPending) &&
                styles.headerLogBtnDisabled,
            ]}
            onPress={openLogFlow}
            disabled={
              !courierValue ||
              (courierValue === "custom" && !customCourierName.trim()) ||
              totalSelectedPODs === 0 ||
              logMutation.isPending
            }
          >
            {logMutation.isPending ? (
              <>
                <ActivityIndicator
                  color={Theme.buttonPrimaryText}
                  size="small"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.headerLogBtnText}>Logging...</Text>
              </>
            ) : (
              <Text style={styles.headerLogBtnText}>
                Log {totalSelectedPODs} PODs
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.contentArea}>
        {isMediumScreen ? (
          <View style={styles.splitLayout}>
            <View style={styles.sidebar}>
              <ScrollView contentContainerStyle={styles.sidebarScroll}>
                {renderSidebarContent()}
              </ScrollView>
            </View>
            <View style={styles.mainArea}>
              {renderMainContentHeader()}
              <ScrollView contentContainerStyle={styles.mainScroll}>
                {renderTripsGrid()}
              </ScrollView>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
            <View style={styles.mobileConfig}>{renderSidebarContent()}</View>
            <View style={styles.mobileMainHeader}>
              {renderMainContentHeader()}
            </View>
            <View style={styles.mobileGridArea}>{renderTripsGrid()}</View>
          </ScrollView>
        )}
      </View>

      {!isMediumScreen && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={[
              styles.logBtn,
              (!courierValue ||
                (courierValue === "custom" && !customCourierName.trim()) ||
                totalSelectedPODs === 0 ||
                logMutation.isPending) &&
                styles.logBtnDisabled,
            ]}
            onPress={openLogFlow}
            disabled={
              !courierValue ||
              (courierValue === "custom" && !customCourierName.trim()) ||
              totalSelectedPODs === 0 ||
              logMutation.isPending
            }
          >
            {logMutation.isPending ? (
              <ActivityIndicator color={Theme.buttonPrimaryText} />
            ) : (
              <Text style={styles.logBtnText}>
                Log {totalSelectedPODs} PODs
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <Modal visible={supplierModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Supplier</Text>
            <TextInput
              style={styles.input}
              placeholder="Search…"
              placeholderTextColor={Theme.textMuted}
              value={supplierSearch}
              onChangeText={setSupplierSearch}
            />
            <FlatList
              data={["", ...filteredSuppliers]}
              keyExtractor={(item) => item || "__all__"}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSelectedSupplier(item);
                    setSelectedLRs({});
                    setSupplierModalOpen(false);
                    setSupplierSearch("");
                  }}
                >
                  <Text style={styles.modalRowText}>
                    {item ? item : "All suppliers"}
                  </Text>
                  {selectedSupplier === item ? (
                    <FontAwesome name="check" size={16} color={Theme.primary} />
                  ) : null}
                </Pressable>
              )}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setSupplierModalOpen(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={courierModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>Courier partner</Text>
            <TextInput
              style={styles.input}
              placeholder="Search or add new…"
              placeholderTextColor={Theme.textMuted}
              value={courierSearch}
              onChangeText={setCourierSearch}
            />

            <ScrollView style={{ flex: 1, marginTop: 8 }} contentContainerStyle={{ paddingBottom: 24 }}>
              {courierSearch.trim() !== "" &&
                !dbCourierPartners.some(
                  (p) =>
                    p.label.toLowerCase() ===
                    courierSearch.trim().toLowerCase(),
                ) && (
                  <Pressable
                    style={[
                      styles.modalRow,
                      {
                        backgroundColor: Theme.primary + '10',
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 14,
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: Theme.primary + '30',
                      }
                    ]}
                    onPress={handleAddCustomCourier}
                    disabled={addCourierPartner.isPending}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      {addCourierPartner.isPending ? (
                        <ActivityIndicator size="small" color={Theme.primary} />
                      ) : (
                        <FontAwesome
                          name="plus-circle"
                          size={18}
                          color={Theme.primary}
                        />
                      )}
                      <Text
                        style={[
                          styles.modalRowText,
                          {
                            marginLeft: 12,
                            fontWeight: "600",
                            color: Theme.primary,
                          },
                        ]}
                      >
                        Add "{courierSearch.trim()}" as new partner
                      </Text>
                    </View>
                  </Pressable>
                )}

              {courierSections.length > 0 ? (
                courierSections.map((section, idx) => (
                  <View key={section.title || idx}>
                    <Text style={styles.sectionHeader}>{section.title}</Text>
                    {section.data.map((item) => (
                      <Pressable
                        key={item.value}
                        style={styles.modalRow}
                        onPress={() => {
                          setCourierValue(item.value);
                          setCustomCourierName("");
                          setCourierModalOpen(false);
                          setCourierSearch("");
                        }}
                      >
                        <Text style={styles.modalRowText}>{item.label}</Text>
                        {courierValue === item.value ? (
                          <FontAwesome
                            name="check"
                            size={16}
                            color={Theme.primary}
                          />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ))
              ) : (
                <View style={{ paddingVertical: 40, paddingHorizontal: 20, alignItems: "center" }}>
                  <FontAwesome name="truck" size={40} color={Theme.textMuted} style={{ opacity: 0.3, marginBottom: 16 }} />
                  <Text style={[styles.emptyCourier, { marginBottom: 8, padding: 0, fontWeight: '600', color: Theme.textPrimaryDark }]}>
                    {courierSearch.trim()
                      ? "No courier partners match your search."
                      : "No active courier partners found."}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      color: Theme.textSecondary,
                      textAlign: "center",
                      lineHeight: 20,
                    }}
                  >
                    {courierSearch.trim()
                      ? "Tap the button above to add this new partner to your directory."
                      : "Type a name in the search bar above to add a new courier partner for this POD."}
                  </Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              style={styles.modalClose}
              onPress={() => setCourierModalOpen(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PodAttachmentModal
        visible={attachmentModalOpen}
        onClose={() => setAttachmentModalOpen(false)}
        onSuccess={(mapped) => runLog(mapped)}
        onSkip={() => runLog([])}
        selectedCount={totalSelectedPODs}
        selectedLRs={selectedLRs}
      />
    </View>
  );
}

function TripCard({
  trip,
  selectedSupplier,
  selectedForTrip,
  onToggleTrip,
  onToggleLR,
}: {
  trip: LogPodsTripView;
  selectedSupplier: string;
  selectedForTrip: string[];
  onToggleTrip: () => void;
  onToggleLR: (lr: string) => void;
}) {
  const pendingLRs =
    trip.lrNumbers.length > 0
      ? trip.lrNumbers.filter((lr) => !trip.receivedLRs.includes(lr))
      : ["N/A"];
  const isFullySelected =
    selectedForTrip.length > 0 && selectedForTrip.length === pendingLRs.length;
  const isPartiallySelected =
    selectedForTrip.length > 0 && selectedForTrip.length < pendingLRs.length;
  const hasSelection = selectedForTrip.length > 0;

  return (
    <View style={[styles.card, hasSelection && styles.cardSelected]}>
      <Pressable style={styles.cardTop} onPress={onToggleTrip}>
        <View style={styles.cardTopLeft}>
          <View
            style={[
              styles.checkBox,
              hasSelection && styles.checkBoxOn,
              isPartiallySelected && styles.checkBoxPartial,
            ]}
          >
            {isFullySelected ? (
              <FontAwesome name="check" size={12} color="#fff" />
            ) : isPartiallySelected ? (
              <Text style={styles.dash}>—</Text>
            ) : null}
          </View>
          <Text style={styles.tripId}>{trip.id}</Text>
        </View>
        <Text style={styles.tripDate}>{trip.date}</Text>
      </Pressable>
      <View style={styles.cardBody}>
        <Text style={styles.routeLabel}>Route</Text>
        <Text style={styles.routeText} numberOfLines={2}>
          {trip.from} → {trip.to}
        </Text>
        {!selectedSupplier ? (
          <>
            <Text style={styles.routeLabel}>Supplier</Text>
            <Text style={styles.supplierText} numberOfLines={1}>
              {trip.supplier_name}
            </Text>
          </>
        ) : null}
        <Text style={styles.lrLabel}>LR numbers</Text>
        {trip.lrNumbers.map((lr) => {
          const isReceived = trip.receivedLRs.includes(lr);
          const isLrSelected = selectedForTrip.includes(lr);
          if (isReceived) {
            return (
              <View key={lr} style={styles.lrReceived}>
                <FontAwesome name="check-circle" size={14} color="#1a7f4c" />
                <Text style={styles.lrReceivedText}>{lr}</Text>
              </View>
            );
          }
          return (
            <Pressable
              key={lr}
              style={styles.lrRow}
              onPress={() => onToggleLR(lr)}
            >
              <View style={[styles.lrCheck, isLrSelected && styles.lrCheckOn]}>
                {isLrSelected ? (
                  <FontAwesome name="check" size={10} color="#fff" />
                ) : null}
              </View>
              <Text style={[styles.lrText, isLrSelected && styles.lrTextOn]}>
                {lr}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  topBarLeft: { flexDirection: "row", alignItems: "center" },
  iconBtn: { padding: 8, marginLeft: -8 },
  topTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(26,35,126,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: Theme.textPrimaryDark },
  topSub: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelText: { fontSize: 14, fontWeight: "600", color: Theme.textMuted },
  headerLogBtn: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  headerLogBtnDisabled: { opacity: 0.5 },
  headerLogBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 14,
    fontWeight: "700",
  },

  contentArea: { flex: 1 },
  splitLayout: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 320,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  sidebarScroll: { padding: 24 },
  mainArea: { flex: 1, backgroundColor: "#f8f9fa" },
  mainHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  mainHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 24 },
  mainHeaderTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  headerDivider: { width: 1, height: 16, backgroundColor: Theme.borderMedium },
  selectAllGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectAllCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  selectAllText: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  mainScroll: { padding: 32 },

  mobileConfig: { padding: Layout.screenPaddingHorizontal, paddingTop: 16 },
  mobileMainHeader: {
    padding: Layout.screenPaddingHorizontal,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  mobileGridArea: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 24,
  },

  gridContainer: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  gridItem: { marginBottom: 16 },
  gridItemLarge: { width: "23%", minWidth: 260 },
  gridItemMedium: { width: "31%", minWidth: 260 },
  gridItemSmall: { width: "100%" },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
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
    marginBottom: 10,
  },
  selectRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    marginBottom: 20,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  summaryContainer: {
    padding: 24,
    backgroundColor: "rgba(248, 249, 250, 0.5)",
    marginHorizontal: -24,
    marginTop: 8,
  },
  summary: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: "rgba(26,35,126,0.06)",
    borderWidth: 1,
    borderColor: "rgba(26,35,126,0.12)",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.primary,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  summaryLabel: { fontSize: 13, color: Theme.textSecondary },
  summaryVal: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: Theme.cardWhite,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  countRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  countBadge: {
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Theme.surfaceGray,
    color: Theme.textMuted,
  },
  countBadgePrimary: {
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(26,35,126,0.1)",
    color: Theme.primary,
  },
  selectAllBtn: { marginLeft: "auto" },
  selectAllText: { fontSize: 12, fontWeight: "800", color: Theme.primary },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    marginBottom: 10,
    backgroundColor: Theme.cardWhite,
  },
  cardSelected: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(26,35,126,0.03)",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardTopLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  checkBoxPartial: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  dash: { color: "#fff", fontSize: 12, fontWeight: "800" },
  tripId: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 14,
    fontWeight: "800",
  },
  tripDate: { fontSize: 10, fontWeight: "800", color: Theme.textMuted },
  cardBody: { paddingLeft: 30 },
  routeLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  routeText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  supplierText: { fontSize: 12, marginBottom: 6 },
  lrLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 4,
  },
  lrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  lrCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  lrCheckOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  lrText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  lrTextOn: { color: Theme.primary },
  lrReceived: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    opacity: 0.55,
    paddingVertical: 4,
  },
  lrReceivedText: {
    fontSize: 12,
    textDecorationLine: "line-through",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 12,
  },
  emptySub: { fontSize: 13, color: Theme.textMuted, marginTop: 4 },
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
  logBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  logBtnDisabled: { opacity: 0.45 },
  logBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 16,
    fontWeight: "800",
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
    padding: 16,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
    color: Theme.textPrimaryDark,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  modalRowText: { flex: 1, fontSize: 15, color: Theme.textPrimaryDark },
  modalClose: { marginTop: 12, alignItems: "center", padding: 12 },
  modalCloseText: { fontSize: 16, fontWeight: "700", color: Theme.primary },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    marginTop: 8,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  emptyCourier: {
    padding: 16,
    fontSize: 14,
    color: Theme.textMuted,
    textAlign: "center",
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
  blockedBtnText: { color: Theme.buttonPrimaryText, fontWeight: "700" },
});
