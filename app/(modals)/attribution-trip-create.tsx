import { Avatar } from "@/components/Avatar";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import { DecimalKeypad } from "@/components/mobile-input/DecimalKeypad";
import { NumericDisplay } from "@/components/mobile-input/NumericDisplay";
import { applyKeypadPress, type KeypadKey } from "@/components/mobile-input/keypad";
import { WizardPartyContextRow } from "@/components/full-page-wizard";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  getClientsByOrganization,
  type ClientRow,
} from "@/features/clients/services/clients.service";
import * as driversService from "@/features/drivers/services/drivers.service";
import * as salaryRequestsService from "@/features/drivers/services/salaryRequests.service";
import * as tripsService from "@/features/trips/services/trips.service";
import { getFleetAvatarUriForOrg } from "@/features/vehicles/utils/fleetAvatar.util";
import { resolvePartyDisplayUri } from "@/lib/partyAvatarDisplay";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AttributionBundle = {
  request: salaryRequestsService.SalaryRequestWithDriverRow;
  sourceTrip: tripsService.TripRow;
  driver: driversService.DriverRow | null;
};

type WizardStep = "client" | "sale" | "review";

function formatTripDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AttributionTripCreateModal() {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { currentOrganization } = useOrganization();
  const { user, profile } = useAuth();

  const orgId = currentOrganization?.id ?? null;
  const userId = profile?.uid ?? user?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bundle, setBundle] = useState<AttributionBundle | null>(null);
  const [driverProfile, setDriverProfile] = useState<{
    avatarUrl?: string;
    avatarSeed?: string;
  } | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("client");
  const [clientMode, setClientMode] = useState<"shipper" | "existing">("shipper");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [saleValue, setSaleValue] = useState("");

  const loadClients = useCallback(async () => {
    if (!orgId) return;
    setClientsLoading(true);
    const res = await getClientsByOrganization(orgId);
    if (!res.error) {
      setClients(res.clients ?? []);
    }
    setClientsLoading(false);
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId || !requestId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const requestRes = await salaryRequestsService.getSalaryRequestByIdForOrganization(
      orgId,
      requestId,
    );
    if (requestRes.error || !requestRes.request) {
      setLoading(false);
      return;
    }
    const request = requestRes.request;
    const sourceTripId = String(request.trip_ids?.[0] ?? "").trim();
    if (!sourceTripId) {
      setLoading(false);
      return;
    }
    const [tripRes, driverRes, profileRes] = await Promise.all([
      tripsService.getTripById(sourceTripId),
      driversService.getDriverById(orgId, request.driver_id),
      driversService.getDriverProfileDisplay(request.driver_id),
    ]);
    if (!tripRes.trip) {
      setLoading(false);
      return;
    }
    setBundle({
      request,
      sourceTrip: tripRes.trip,
      driver: driverRes.driver ?? null,
    });
    setDriverProfile(
      profileRes.profile
        ? {
            avatarUrl: profileRes.profile.avatarUrl,
            avatarSeed: profileRes.profile.avatarSeed,
          }
        : null,
    );
    await loadClients();
    setLoading(false);
  }, [orgId, requestId, loadClients]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void loadClients();
    }, [loadClients]),
  );

  const shipperName = useMemo(() => {
    if (!bundle) return "Shipper";
    return String(bundle.sourceTrip.client_name ?? "").trim() || "Shipper";
  }, [bundle]);

  const shipperAvatarUri = useMemo(() => {
    if (!bundle) return null;
    const shipperOrgId = String(bundle.sourceTrip.organization_id ?? "");
    return getFleetAvatarUriForOrg(shipperOrgId, shipperName);
  }, [bundle, shipperName]);

  const driverAvatarUrl =
    (driverProfile?.avatarUrl ?? "").trim() ||
    (bundle?.driver?.avatar_url ?? "").trim() ||
    null;
  const driverAvatarSeed =
    (driverProfile?.avatarSeed ?? "").trim() ||
    (bundle?.driver?.avatar_seed ?? "").trim() ||
    null;

  const matchedShipperClient = useMemo(() => {
    const shipper = shipperName.trim().toLowerCase();
    if (!shipper) return null;
    return (
      clients.find((c) => String(c.name ?? "").trim().toLowerCase() === shipper) ?? null
    );
  }, [clients, shipperName]);

  useEffect(() => {
    if (clientMode !== "shipper") return;
    setSelectedClientId(matchedShipperClient?.id ?? null);
    if (matchedShipperClient?.name) {
      setClientName(matchedShipperClient.name);
    }
  }, [clientMode, matchedShipperClient?.id, matchedShipperClient?.name]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const openAddClientFlow = useCallback(() => {
    router.push({
      pathname: "/(modals)/add-client",
      params: {
        returnTo: `/(modals)/attribution-trip-create?requestId=${encodeURIComponent(
          String(requestId ?? ""),
        )}`,
        prefillOrganizationName: shipperName,
      },
    } as never);
  }, [router, requestId, shipperName]);

  const handleSubmit = useCallback(async () => {
    if (!bundle || !orgId || !userId || submitting) return;
    const effectiveClientName = String(selectedClient?.name ?? "").trim();
    const sale = Number(saleValue);
    if (!effectiveClientName) {
      Alert.alert(
        "Client required",
        "Select an existing client. If shipper is new, add it in Add Client with contact details first.",
      );
      return;
    }
    if (!Number.isFinite(sale) || sale <= 0) {
      Alert.alert("Sale value required", "Enter a valid sale value greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const source = bundle.sourceTrip;
      const historicalStartedAt =
        source.started_at ??
        source.pickup_date ??
        source.created_at ??
        null;
      const historicalCompletedAt =
        source.completed_at ??
        (tripsService.isTripCompleted(source) ? source.updated_at : null) ??
        source.pickup_date ??
        source.created_at ??
        null;
      const fleetDriverId =
        bundle.request.driver_id ??
        bundle.driver?.id ??
        source.driver_id ??
        undefined;
      const createRes = await tripsService.createTrip(orgId, userId, {
        pickup_area: source.pickup_area,
        drop_location: source.drop_location,
        pickup_lat: source.pickup_lat ?? undefined,
        pickup_lon: source.pickup_lon ?? undefined,
        drop_lat: source.drop_lat ?? undefined,
        drop_lon: source.drop_lon ?? undefined,
        distance:
          source.distance != null && Number.isFinite(Number(source.distance))
            ? Number(source.distance)
            : undefined,
        estimated_duration: source.estimated_duration ?? undefined,
        pickup_date: source.pickup_date ?? undefined,
        load_tons: source.load_tons ?? undefined,
        load_type: source.load_type ?? undefined,
        client_name: effectiveClientName,
        client_id: selectedClient?.id ?? undefined,
        client_price: sale,
        supplier_rate: Number(source.supplier_rate ?? 0) || 0,
        supplier_id: source.supplier_id ?? undefined,
        driver_id: fleetDriverId,
        vehicle_id: source.vehicle_id ?? undefined,
        vehicle_display_number: source.vehicle_display_number ?? undefined,
        status: "completed",
        started_at: historicalStartedAt,
        completed_at: historicalCompletedAt,
        skipAssignmentConflictCheck: true,
        notes: `Attributed trip from ${source.trip_number ?? source.id}`,
        owner_user_id: userId,
        created_by_user_id: userId,
        trip_payout_mode: source.trip_payout_mode ?? "asset",
      });
      if (createRes.error || !createRes.trip) {
        throw createRes.error ?? new Error("Could not create attributed trip.");
      }

      const sourcePrice = Number(source.client_price ?? 0);
      const explicitPercent = Number(bundle.driver?.commission_percent ?? 0);
      const derivedPercent =
        explicitPercent > 0
          ? explicitPercent
          : sourcePrice > 0
            ? (Number(bundle.request.amount ?? 0) / sourcePrice) * 100
            : 0;
      const driverCommission = Math.max(
        0,
        Math.round((sale * Math.max(0, derivedPercent)) / 100),
      );
      if (driverCommission > 0) {
        await tripsService.updateTripDriverCommission(createRes.trip.id, driverCommission);
      }

      const approveRes = await salaryRequestsService.updateSalaryRequestStatus(
        bundle.request.id,
        "approved",
      );
      if (approveRes.error) {
        throw approveRes.error;
      }

      Alert.alert("Trip created", "Attribution accepted and converted into a fleet trip.");
      router.replace("/(tabs)/trips");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not complete attribution.";
      Alert.alert("Could not complete", message);
    } finally {
      setSubmitting(false);
    }
  }, [
    bundle,
    orgId,
    userId,
    submitting,
    selectedClient?.id,
    selectedClient?.name,
    clientName,
    saleValue,
    router,
  ]);

  const canContinueFromClientStep =
    clientMode === "shipper" ? !!matchedShipperClient : !!selectedClientId;
  const canContinueFromSaleStep = Number(saleValue) > 0;

  const goBackInWizard = useCallback(() => {
    if (wizardStep === "review") {
      setWizardStep("sale");
      return;
    }
    if (wizardStep === "sale") {
      setWizardStep("client");
      return;
    }
    router.back();
  }, [wizardStep, router]);

  const handleSaleKey = useCallback((key: KeypadKey) => {
    setSaleValue((prev) => applyKeypadPress(prev, key, { maxDecimalPlaces: 2 }));
  }, []);

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top + 24 }]}>
        <LoadingIndicator color={Theme.primary} />
        <Text style={styles.loadingText}>Loading attribution request...</Text>
      </View>
    );
  }

  if (!bundle || !orgId || !requestId) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.emptyTitle}>Attribution request not found</Text>
        <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const source = bundle.sourceTrip;
  const driverName =
    String(bundle.driver?.name ?? "").trim() ||
    String(bundle.request.drivers?.name ?? "").trim() ||
    "Driver";
  const vehicleLabel =
    String(source.vehicle_display_number ?? "").trim() || "Assigned vehicle";
  const selectedClientNameForDisplay =
    selectedClient?.name ??
    (clientMode === "shipper" ? shipperName : "Select client");
  const clientAvatarUri = resolvePartyDisplayUri({
    avatarUrl: selectedClient?.avatar_url ?? null,
    avatarSeed: selectedClient?.avatar_seed ?? null,
    entityType: "client",
  });

  const driverPartyCell = {
    label: "Driver",
    name: driverName,
    entityType: "driver" as const,
    avatar: (
      <Avatar
        party={{
          type: "driver",
          name: driverName,
          avatarUrl: driverAvatarUrl,
          avatarSeed: driverAvatarSeed,
        }}
        size={34}
      />
    ),
  };

  const shipperPartyCell = {
    label: "Shipper",
    name: shipperName,
    entityType: "client" as const,
    avatarUrl: shipperAvatarUri,
  };

  const clientPartyCell = {
    label: "Client",
    name: selectedClientNameForDisplay,
    entityType: "client" as const,
    avatarUrl: clientAvatarUri,
    avatarSeed: selectedClient?.avatar_seed ?? null,
  };

  if (wizardStep === "sale") {
    return (
      <View style={styles.root}>
        <View
          style={[
            styles.salePageRoot,
            {
              paddingTop: insets.top + 6,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <View style={styles.headerBar}>
            <Pressable
              style={styles.headerBackBtn}
              onPress={goBackInWizard}
              accessibilityLabel="Back"
            >
              <Text style={styles.headerBackBtnText}>← Back</Text>
            </Pressable>
            <Text style={styles.headerStepText}>Step 2 of 3</Text>
          </View>

          <View style={styles.saleHeaderBlock}>
            <Text style={styles.title}>Sale Value</Text>
            <Text style={styles.subtitle}>
              Enter the billed sale value for this attributed trip.
            </Text>
          </View>

          <WizardPartyContextRow left={driverPartyCell} right={clientPartyCell} />

          <View style={styles.saleDisplayCard}>
            <Text style={styles.saleDisplayLabel}>Sale value (INR)</Text>
            <NumericDisplay
              rawValue={saleValue}
              type="currency"
              prefix="₹"
              placeholder="0"
              variant="hero"
            />
          </View>

          <View style={styles.salePageActions}>
            <Pressable style={styles.cancelBtn} onPress={goBackInWizard}>
              <Text style={styles.cancelBtnText}>Back</Text>
            </Pressable>
            <Pressable
              style={[
                styles.submitBtn,
                !canContinueFromSaleStep && styles.submitBtnDisabled,
              ]}
              disabled={!canContinueFromSaleStep}
              onPress={() => setWizardStep("review")}
            >
              <Text style={styles.submitBtnText}>Review</Text>
            </Pressable>
          </View>

          <View style={styles.salePageKeypadDock}>
            <DecimalKeypad
              onKey={handleSaleKey}
              showDecimal
              variant="pay"
              size="compact"
            />
          </View>
        </View>
      </View>
    );
  }

  const stepProgress = (
    <View style={styles.wizardStepRow}>
      {[
        { id: "client" as const, label: "Client" },
        { id: "sale" as const, label: "Sale" },
        { id: "review" as const, label: "Review" },
      ].map((step, idx) => {
        const done =
          (wizardStep === "sale" && step.id === "client") ||
          (wizardStep === "review" && (step.id === "client" || step.id === "sale"));
        const active = wizardStep === step.id;
        return (
          <View key={step.id} style={styles.wizardStepItem}>
            <View
              style={[
                styles.wizardStepCircle,
                active && styles.wizardStepCircleActive,
                done && styles.wizardStepCircleDone,
              ]}
            >
              <Text style={[styles.wizardStepCircleText, (active || done) && styles.wizardStepCircleTextActive]}>
                {idx + 1}
              </Text>
            </View>
            <Text style={[styles.wizardStepText, active && styles.wizardStepTextActive]}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );

  if (wizardStep === "client") {
    return (
      <View style={styles.root}>
        <View
          style={[
            styles.pageRoot,
            { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.headerBar}>
            <Pressable style={styles.headerBackBtn} onPress={goBackInWizard} accessibilityLabel="Back">
              <Text style={styles.headerBackBtnText}>← Back</Text>
            </Pressable>
            <Text style={styles.headerStepText}>Step 1 of 3</Text>
          </View>

          <View style={styles.pageHeaderBlock}>
            <Text style={styles.title}>Accept Attribution</Text>
            <Text style={styles.subtitle}>
              Select how this shipper maps to your client record.
            </Text>
          </View>

          {stepProgress}

          <ScrollView
            style={styles.stepScroll}
            contentContainerStyle={[styles.stepScrollContent, width >= 920 && styles.scrollBodyWide]}
            showsVerticalScrollIndicator={false}
          >
            <WizardPartyContextRow left={driverPartyCell} right={shipperPartyCell} />

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Route details</Text>
              <Text style={styles.blockLine}>{source.pickup_area} → {source.drop_location}</Text>
              <Text style={styles.blockMeta}>
                Date: {formatTripDate(source.pickup_date ?? source.created_at)} · Vehicle: {vehicleLabel}
              </Text>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Select client</Text>
              <View style={styles.modeRow}>
                <Pressable
                  style={[styles.modeChip, clientMode === "shipper" && styles.modeChipActive]}
                  onPress={() => {
                    setClientMode("shipper");
                    setClientName(shipperName);
                  }}
                >
                  <Text style={[styles.modeChipText, clientMode === "shipper" && styles.modeChipTextActive]}>
                    Mark as shipper
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeChip, clientMode === "existing" && styles.modeChipActive]}
                  onPress={() => setClientMode("existing")}
                >
                  <Text style={[styles.modeChipText, clientMode === "existing" && styles.modeChipTextActive]}>
                    Select existing client
                  </Text>
                </Pressable>
              </View>

              {clientMode === "shipper" ? (
                <>
                  <View style={styles.shipperMarkCard}>
                    <PartyAvatar name={shipperName} avatarUrl={shipperAvatarUri} entityType="client" size={30} shape="rounded" />
                    <View style={styles.partyTextWrap}>
                      <Text style={styles.partyLabel}>Shipper</Text>
                      <Text style={styles.partyName} numberOfLines={1}>{shipperName}</Text>
                      {matchedShipperClient == null ? (
                        <View style={styles.shipperNewBadge}>
                          <Text style={styles.shipperNewBadgeText}>CLIENT FROM SHIPPER (NEW)</Text>
                        </View>
                      ) : (
                        <View style={styles.shipperMappedBadge}>
                          <Text style={styles.shipperMappedBadgeText}>MAPPED TO EXISTING CLIENT</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {matchedShipperClient == null ? (
                    <View style={styles.shipperWarningCard}>
                      <Text style={styles.shipperWarningText}>
                        This shipper is not in your clients. Add it with contact details to continue.
                      </Text>
                      <Pressable style={styles.addClientBtn} onPress={openAddClientFlow}>
                        <Text style={styles.addClientBtnText}>+ Add shipper as client</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.hint}>
                      Existing client matched automatically. Continue to sale value.
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <TextInput
                    value={clientName}
                    onChangeText={setClientName}
                    placeholder="Search client"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.input}
                  />
                  <View style={styles.clientListWrap}>
                    {clientsLoading ? (
                      <View style={styles.clientLoadingWrap}>
                        <LoadingIndicator size="small" color={Theme.primary} />
                      </View>
                    ) : (
                      clients
                        .filter((c) =>
                          String(c.name ?? "").toLowerCase().includes(clientName.trim().toLowerCase()),
                        )
                        .slice(0, 20)
                        .map((client) => {
                          const selected = selectedClientId === client.id;
                          return (
                            <Pressable
                              key={client.id}
                              style={[styles.clientRow, selected && styles.clientRowSelected]}
                              onPress={() => {
                                setSelectedClientId(client.id);
                                setClientName(client.name ?? "");
                              }}
                            >
                              <PartyAvatar
                                name={client.name ?? "Client"}
                                avatarUrl={client.avatar_url ?? null}
                                avatarSeed={client.avatar_seed ?? null}
                                entityType="client"
                                size={30}
                                shape="rounded"
                              />
                              <View style={styles.partyTextWrap}>
                                <Text style={styles.partyName} numberOfLines={1}>{client.name ?? "Client"}</Text>
                                <Text style={styles.blockMeta} numberOfLines={1}>{client.phone ?? "—"}</Text>
                              </View>
                            </Pressable>
                          );
                        })
                    )}
                  </View>
                  <Pressable style={styles.addClientBtn} onPress={openAddClientFlow}>
                    <Text style={styles.addClientBtnText}>+ Add new client</Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>

          <View style={styles.footerBar}>
            <Pressable style={styles.cancelBtn} onPress={goBackInWizard}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, !canContinueFromClientStep && styles.submitBtnDisabled]}
              disabled={!canContinueFromClientStep}
              onPress={() => setWizardStep("sale")}
            >
              <Text style={styles.submitBtnText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (wizardStep === "review") {
    return (
      <View style={styles.root}>
        <View
          style={[
            styles.pageRoot,
            { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.headerBar}>
            <Pressable style={styles.headerBackBtn} onPress={goBackInWizard} accessibilityLabel="Back">
              <Text style={styles.headerBackBtnText}>← Back</Text>
            </Pressable>
            <Text style={styles.headerStepText}>Step 3 of 3</Text>
          </View>

          <View style={styles.pageHeaderBlock}>
            <Text style={styles.title}>Review & Create</Text>
            <Text style={styles.subtitle}>Confirm details before creating attributed fleet trip.</Text>
          </View>

          {stepProgress}

          <WizardPartyContextRow left={driverPartyCell} right={clientPartyCell} />

          <View style={styles.reviewSummaryCard}>
            <Text style={styles.blockTitle}>Trip summary</Text>
            <Text style={styles.reviewLine}>Sale value: ₹{Math.max(0, Number(saleValue) || 0).toLocaleString("en-IN")}</Text>
            <Text style={styles.reviewLine}>Route: {source.pickup_area} → {source.drop_location}</Text>
            <Text style={styles.reviewLine}>Vehicle: {vehicleLabel}</Text>
            <Text style={styles.reviewLine}>Date: {formatTripDate(source.pickup_date ?? source.created_at)}</Text>
          </View>

          <View style={styles.footerBar}>
            <Pressable style={styles.cancelBtn} onPress={goBackInWizard}>
              <Text style={styles.cancelBtnText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? "Creating..." : "Create trip & accept"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  pageRoot: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 12,
  },
  pageHeaderBlock: {
    gap: 4,
  },
  salePageRoot: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 12,
  },
  saleHeaderBlock: {
    gap: 6,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
  },
  loadingText: {
    color: Theme.textSecondary,
    fontSize: 13,
  },
  emptyTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 16,
    fontWeight: "700",
  },
  scrollBody: {
    paddingHorizontal: 16,
    gap: 12,
  },
  scrollBodyWide: {
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
  },
  headerBackBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBackBtnText: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  headerStepText: {
    color: Theme.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    color: Theme.textPrimaryDark,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: Theme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  wizardStepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  wizardStepItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  wizardStepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  wizardStepCircleActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  wizardStepCircleDone: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  wizardStepCircleText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  wizardStepCircleTextActive: {
    color: Theme.textOnPrimary,
  },
  wizardStepText: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "600",
  },
  wizardStepTextActive: {
    color: Theme.textPrimaryDark,
  },
  stepScroll: {
    flex: 1,
    minHeight: 0,
  },
  stepScrollContent: {
    gap: 12,
    paddingBottom: 6,
  },
  partyRow: {
    flexDirection: "row",
    gap: 10,
  },
  partyRowStack: {
    flexDirection: "column",
  },
  partyCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 10,
  },
  partyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  partyLabel: {
    color: Theme.textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: "700",
  },
  partyName: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  block: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 8,
  },
  blockTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 14,
    fontWeight: "700",
  },
  blockLine: {
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: "600",
  },
  blockMeta: {
    color: Theme.textSecondary,
    fontSize: 12,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  modeChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.08)",
  },
  modeChipText: {
    fontSize: 11,
    color: Theme.textSecondary,
    fontWeight: "700",
  },
  modeChipTextActive: {
    color: Theme.primary,
  },
  shipperMarkCard: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    padding: 10,
  },
  shipperNewBadge: {
    alignSelf: "flex-start",
    marginTop: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(99,102,241,0.10)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shipperNewBadgeText: {
    color: "#4f46e5",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  shipperMappedBadge: {
    alignSelf: "flex-start",
    marginTop: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.30)",
    backgroundColor: "rgba(79, 70, 229, 0.10)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shipperMappedBadgeText: {
    color: Theme.primary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  shipperWarningCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(238,242,255,0.9)",
    padding: 10,
    gap: 8,
  },
  shipperWarningText: {
    color: "#4338ca",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  inputLabel: {
    color: Theme.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  saleDisplayCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  saleDisplayLabel: {
    color: Theme.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  saleKeypadWrap: {
    marginTop: 2,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  salePageActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  salePageKeypadDock: {
    marginTop: "auto",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  reviewSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.22)",
    backgroundColor: "rgba(15,23,42,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  reviewPartyCard: {
    borderColor: "rgba(15,23,42,0.12)",
    backgroundColor: "rgba(15,23,42,0.03)",
  },
  reviewLine: {
    color: Theme.textPrimaryDark,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    color: Theme.textPrimaryDark,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clientListWrap: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    maxHeight: 280,
    overflow: "hidden",
  },
  clientLoadingWrap: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  clientRowSelected: {
    backgroundColor: "rgba(79, 70, 229, 0.08)",
    borderLeftWidth: 2,
    borderLeftColor: Theme.primary,
  },
  addClientBtn: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  addClientBtnText: {
    color: Theme.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  hint: {
    color: Theme.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  footerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 10,
  },
  cancelBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  submitBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: Theme.textOnPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
});
