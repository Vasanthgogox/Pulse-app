import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { InvoiceTripCnDnGroup } from "@/features/invoicing/components/InvoiceTripCnDnGroup";
import { TripCompletionOrPodTags } from "@/features/trips/components/TripPodStatusTags";
import { tripIsDeliveredStatus } from "@/features/trips/services/tripDocumentLrPod.service";
import { useInvoiceDraftClientsQuery } from "@/features/invoicing/hooks/useInvoiceDraftClients";
import {
  invoiceOnlyCharges,
  invoiceTripAdjustedAmount,
  mergeInvoiceChargesWithTripCnDn,
} from "@/features/invoicing/services/invoiceCnDn.service";
import type {
  AdditionalCharge,
  InvoicePayload,
  InvoicingTripView,
} from "@/features/invoicing/services/invoicing.service";
import type { InvoiceIssuerIdentity } from "@/features/invoicing/services/invoiceIssuerIdentity.service";
import {
  buildInvoiceDraftModel,
  formatInvoicePreviewDate,
  invoiceDraftTaxDisplay,
  uniqueTripClientIds,
} from "@/features/invoicing/services/invoicePreviewModel.service";
import { ProvisionAdjustmentModal } from "@/features/trips/components/trip-detail/adjustment/ProvisionAdjustmentModal";
import {
  addTripAdjustment,
  updateTripAdjustment,
  type TripAdjustment,
} from "@/features/trips/services/tripAdjustments";
import {
  adjustmentsForTripId,
  useInvalidateTripFinanceAdjustments,
  useTripFinanceAdjustmentsMap,
} from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useMemo, useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface InvoicePreviewPanelProps {
  onClose?: () => void;
  onPreview: (params: Record<string, string>) => void; // Changed from onFinalize to onPreview
  /** Parent execute screen owns persist. Preview route stays mutation-free. */
  onIssue?: (args: { internalIds: string[]; payload: InvoicePayload }) => void;
  isFinalizing: boolean; // This will now represent the state of PDF generation/navigation
  isIssuing?: boolean;
  activeClient: string | null;
  selectedTrips: InvoicingTripView[];
  isStandalone?: boolean;
  issuer: InvoiceIssuerIdentity | null;
  workspaceOrgId?: string | null;
  previewExpanded?: boolean;
  onToggleExpand?: () => void;
  onEditClient?: (clientId: string) => void;
  /** UI gate only — does not change executeInvoiceCreation. */
  invoiceBuildBlockedReason?: string | null;
  /** UI gate only — Issue still revalidates policy in executeInvoiceCreation. */
  invoiceIssueBlockedReason?: string | null;
}

const PAYMENT_TERMS_OPTIONS = [
  "Due on Receipt",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
];

export function InvoicePreviewPanel({
  onClose,
  onPreview, // Changed from onFinalize
  onIssue,
  isFinalizing,
  isIssuing = false,
  activeClient,
  selectedTrips,
  isStandalone = false,
  issuer,
  workspaceOrgId = null,
  previewExpanded = false,
  onToggleExpand,
  onEditClient,
  invoiceBuildBlockedReason = null,
  invoiceIssueBlockedReason = null,
}: InvoicePreviewPanelProps) {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();

  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [notes, setNotes] = useState("");

  const [includeGst, setIncludeGst] = useState(false);
  const [gstRate, setGstRate] = useState(5);
  const [includeFuel, setIncludeFuel] = useState(false);
  const [fuelRate, setFuelRate] = useState(2.5);
  const [additionalCharges, setAdditionalCharges] = useState<
    AdditionalCharge[]
  >([]);
  const [previewDate] = useState(() => formatInvoicePreviewDate(new Date()));
  const [cnDnTrip, setCnDnTrip] = useState<InvoicingTripView | null>(null);
  const [cnDnEdit, setCnDnEdit] = useState<TripAdjustment | null>(null);
  const [showSplit, setShowSplit] = useState(true);

  const selectedTripInternalIds = useMemo(
    () => selectedTrips.map((t) => t.internal_id).filter(Boolean),
    [selectedTrips],
  );
  const { record: tripAdjustmentsRecord } = useTripFinanceAdjustmentsMap(
    workspaceOrgId,
    selectedTripInternalIds,
  );
  const invalidateTripAdjustments = useInvalidateTripFinanceAdjustments();

  const clientIds = useMemo(
    () => uniqueTripClientIds(selectedTrips),
    [selectedTrips],
  );
  const { data: fetchedClients = [] } = useInvoiceDraftClientsQuery(
    workspaceOrgId,
    clientIds,
  );

  const invoiceConfig = useMemo(
    () => ({
      includeGst,
      gstRate,
      includeFuel,
      fuelRate,
      additionalCharges: mergeInvoiceChargesWithTripCnDn(
        additionalCharges,
        selectedTrips,
        tripAdjustmentsRecord,
      ),
    }),
    [
      additionalCharges,
      fuelRate,
      gstRate,
      includeFuel,
      includeGst,
      selectedTrips,
      tripAdjustmentsRecord,
    ],
  );

  const draft = useMemo(() => {
    if (!issuer || selectedTrips.length === 0) return null;
    return buildInvoiceDraftModel({
      issuer,
      trips: selectedTrips,
      config: invoiceConfig,
      previewDate,
      paymentTerms,
      notes,
      fetchedClients,
      displayNameFallback: activeClient,
    });
  }, [
    activeClient,
    fetchedClients,
    invoiceConfig,
    issuer,
    notes,
    paymentTerms,
    previewDate,
    selectedTrips,
  ]);

  const taxDisplay = draft ? invoiceDraftTaxDisplay(draft.tax) : null;

  const handleAddCharge = useCallback((tripId?: string) => {
    setAdditionalCharges((prev) => {
      if (!tripId) {
        const hasEmptyGlobal = prev.some(
          (c) => !c.tripId && c.description.trim() === "" && Math.abs(c.amount) === 0,
        );
        if (hasEmptyGlobal) return prev;
      }
      return [
        ...prev,
        { id: Date.now().toString(), description: "", amount: 0, tripId },
      ];
    });
  }, []);

  const handleUpdateCharge = useCallback(
    (id: string, field: "description" | "amount", value: string | number) => {
      setAdditionalCharges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
      );
    },
    [],
  );

  const handleRemoveCharge = useCallback((id: string) => {
    setAdditionalCharges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const closeCnDnModal = useCallback(() => {
    setCnDnTrip(null);
    setCnDnEdit(null);
  }, []);

  const handleSaveTripCnDn = useCallback(
    async (params: {
      type: "revenue" | "cost";
      impact: "plus" | "minus";
      amount: number;
      reason: string;
    }) => {
      const tripId = cnDnTrip?.internal_id?.trim();
      const orgId = workspaceOrgId?.trim();
      if (!tripId || !orgId) {
        Alert.alert(
          "Credit / debit note",
          "This trip is not linked, so the note cannot be saved to finance.",
        );
        return;
      }
      await addTripAdjustment(
        tripId,
        {
          type: "revenue",
          impact: params.impact,
          amount: params.amount,
          reason: params.reason,
        },
        { organizationId: orgId, missionKey: cnDnTrip?.id ?? null },
      );
      await invalidateTripAdjustments();
    },
    [cnDnTrip, invalidateTripAdjustments, workspaceOrgId],
  );

  const handleUpdateTripCnDn = useCallback(
    async (
      adjustmentId: string,
      params: {
        type: "revenue" | "cost";
        impact: "plus" | "minus";
        amount: number;
        reason: string;
      },
    ) => {
      const tripId = cnDnTrip?.internal_id?.trim();
      if (!tripId) return;
      await updateTripAdjustment(tripId, adjustmentId, {
        type: "revenue",
        impact: params.impact,
        amount: params.amount,
        reason: params.reason,
      });
      await invalidateTripAdjustments();
    },
    [cnDnTrip, invalidateTripAdjustments],
  );

  const formatCurrency = (val: number) => {
    return (
      "₹" +
      val.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  const handleInitiatePreview = async () => {
    if (invoiceBuildBlockedReason) return;
    if (selectedTrips.length === 0) return;

    const params = {
      activeClient: activeClient || "",
      selectedTripIds: JSON.stringify(
        selectedTrips.map((t) => t.internal_id || t.id),
      ),
      paymentTerms,
      notes,
      includeGst: includeGst.toString(),
      gstRate: gstRate.toString(),
      includeFuel: includeFuel.toString(),
      fuelRate: fuelRate.toString(),
      additionalCharges: JSON.stringify(invoiceOnlyCharges(additionalCharges)),
      previewDate,
      showSplit: showSplit ? "true" : "false",
    };
    onPreview(params);
  };

  const issueBlocked =
    !onIssue ||
    isIssuing ||
    isFinalizing ||
    selectedTrips.length === 0 ||
    Boolean(invoiceBuildBlockedReason) ||
    Boolean(invoiceIssueBlockedReason) ||
    !draft ||
    draft.tax.status === "blocked";

  const handleIssueInvoice = () => {
    if (issueBlocked || !onIssue || !draft) return;
    const internalIds = selectedTrips
      .map((t) => t.internal_id || t.id)
      .filter((id) => Boolean(id));
    if (internalIds.length === 0) return;
    onIssue({
      internalIds,
      payload: {
        notes,
        paymentTerms,
        includeGst,
        gstRate,
        includeFuel,
        fuelRate,
        additionalCharges: invoiceOnlyCharges(additionalCharges),
        clientName: activeClient ?? undefined,
        calculations: {
          subtotal: draft.tax.taxable_base,
          sgst: draft.tax.sgst_amount,
          cgst: draft.tax.cgst_amount,
          totalAmount: draft.tax.total_amount,
        },
      },
    });
  };

  return (
    <View
      style={[
        styles.sheet,
        !isStandalone && { paddingTop: insets.top > 0 ? insets.top : 16 },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>
            Invoice draft{" "}
            <Text style={styles.headerDraftTag}>#Draft</Text>
          </Text>
          <Text style={styles.headerSub}>
            Preview date {previewDate} · Invoice number assigned on issue
          </Text>
        </View>
        <View style={styles.headerActions}>
          {onToggleExpand ? (
            <Pressable
              style={styles.headerIconBtn}
              onPress={onToggleExpand}
              accessibilityRole="button"
              accessibilityLabel={
                previewExpanded ? "Restore preview size" : "Expand preview"
              }
            >
              <FontAwesome
                name={previewExpanded ? "compress" : "expand"}
                size={16}
                color={Theme.textPrimaryDark}
              />
            </Pressable>
          ) : null}
          {onClose ? (
            <Pressable
              style={styles.headerIconBtn}
              onPress={onClose}
              disabled={isFinalizing}
            >
              <FontAwesome
                name="times"
                size={18}
                color={Theme.textPrimaryDark}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          previewExpanded && styles.bodyContentExpanded,
        ]}
        {...tabBarScrollProps}
      >
        <View
          style={[
            styles.document,
            previewExpanded && styles.documentExpanded,
          ]}
        >
        {/* Header Info — issuer from active workspace; client name only (no fabricated address). */}
        <View style={styles.rowLayout}>
          <View style={styles.colLayout}>
            <Text style={styles.sectionLabel}>Issuer</Text>
            <View style={styles.infoCard}>
              {issuer ? (
                <>
                  <Text style={styles.clientName}>{issuer.businessName}</Text>
                  {issuer.addressLines.map((line) => (
                    <Text key={line} style={styles.clientAddress}>
                      {line}
                    </Text>
                  ))}
                </>
              ) : (
                <Text style={styles.clientAddress}>
                  Workspace identity unavailable
                </Text>
              )}
            </View>
          </View>
          <View style={styles.colLayout}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Bill to</Text>
              {draft?.client.client_id && onEditClient ? (
                <Pressable
                  style={styles.editClientBtn}
                  onPress={() => onEditClient(draft.client.client_id!)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit client details"
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <FontAwesome name="pencil" size={12} color={Theme.primary} />
                  <Text style={styles.editClientBtnText}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.infoCard}>
              {draft?.client.display_name ? (
                <>
                  <Text style={styles.clientName}>
                    {draft.client.legal_name || draft.client.display_name}
                  </Text>
                  {draft.client.billing_address ? (
                    <Text style={styles.clientAddress}>
                      {draft.client.billing_address}
                    </Text>
                  ) : null}
                  {draft.client.state ? (
                    <Text style={styles.clientAddress}>{draft.client.state}</Text>
                  ) : null}
                  {draft.client.gstin ? (
                    <Text style={styles.clientAddress}>
                      GSTIN {draft.client.gstin}
                    </Text>
                  ) : null}
                  {draft.client.pan ? (
                    <Text style={styles.clientAddress}>
                      PAN {draft.client.pan}
                    </Text>
                  ) : null}
                  {draft.client.email ? (
                    <Text style={styles.clientAddress}>{draft.client.email}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.clientAddress}>Select a client...</Text>
              )}
            </View>
          </View>
        </View>
        <View style={styles.rowLayout}>
          <View style={styles.colLayout}>
            <Text style={styles.sectionLabel}>Issuer tax details</Text>
            <View style={styles.infoCard}>
              {issuer?.pan ? (
                <Text style={styles.taxText}>
                  <Text style={styles.taxLabel}>PAN</Text> {issuer.pan}
                </Text>
              ) : null}
              {issuer?.gstNotApplicable ? (
                <Text style={styles.taxText}>
                  <Text style={styles.taxLabel}>GST</Text> Not applicable
                </Text>
              ) : issuer?.gstin ? (
                <Text style={styles.taxText}>
                  <Text style={styles.taxLabel}>GSTIN</Text> {issuer.gstin}
                </Text>
              ) : null}
              {issuer?.state ? (
                <Text style={styles.taxText}>
                  <Text style={styles.taxLabel}>State</Text> {issuer.state}
                </Text>
              ) : null}
              {!issuer?.pan && !issuer?.gstin && !issuer?.gstNotApplicable && !issuer?.state ? (
                <Text style={styles.clientAddress}>No tax identifiers on file</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Line Items */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Invoice Details</Text>
          <Pressable
            style={styles.addChargeBtn}
            onPress={() => handleAddCharge()}
          >
            <FontAwesome name="plus" size={12} color={Theme.textPrimaryDark} />
            <Text style={styles.addChargeText}>Add Custom Charge</Text>
          </Pressable>
        </View>

        {/* Global Charges */}
        {additionalCharges
          .filter((c) => !c.tripId)
          .map((charge) => (
            <View key={charge.id} style={styles.chargeRow}>
              <View style={styles.chargeContentCol}>
                <TextInput
                  style={styles.chargeInput}
                  value={charge.description}
                  onChangeText={(t) =>
                    handleUpdateCharge(charge.id, "description", t)
                  }
                  placeholder="Charge description..."
                  placeholderTextColor={Theme.textMuted}
                />
                <Text style={styles.chargeHint} numberOfLines={1}>
                  Global Adjustment
                </Text>
              </View>
              <View style={styles.chargeActionsRow}>
                <View style={styles.chargeTypeToggle}>
                  <Pressable
                    style={[
                      styles.chargeTypeBtn,
                      !Object.is(charge.amount, -0) && charge.amount >= 0
                        ? styles.chargeTypeBtnAdd
                        : null,
                    ]}
                    onPress={() =>
                      handleUpdateCharge(
                        charge.id,
                        "amount",
                        Math.abs(charge.amount),
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.chargeTypeText,
                        !Object.is(charge.amount, -0) && charge.amount >= 0
                          ? styles.chargeTypeTextAdd
                          : null,
                      ]}
                    >
                      Add
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.chargeTypeBtn,
                      Object.is(charge.amount, -0) || charge.amount < 0
                        ? styles.chargeTypeBtnMinus
                        : null,
                    ]}
                    onPress={() =>
                      handleUpdateCharge(
                        charge.id,
                        "amount",
                        Object.is(charge.amount, 0)
                          ? -0
                          : -Math.abs(charge.amount),
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.chargeTypeText,
                        Object.is(charge.amount, -0) || charge.amount < 0
                          ? styles.chargeTypeTextMinus
                          : null,
                      ]}
                    >
                      Minus
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.chargeAmountWrapper}>
                  <Text style={styles.chargeCurrencySymbol}>₹</Text>
                  <TextInput
                    style={styles.chargeAmountInput}
                    value={Math.abs(charge.amount).toString()}
                    onChangeText={(t) => {
                      const val = parseFloat(t) || 0;
                      const isNeg =
                        Object.is(charge.amount, -0) || charge.amount < 0;
                      handleUpdateCharge(
                        charge.id,
                        "amount",
                        isNeg ? (val === 0 ? -0 : -val) : val,
                      );
                    }}
                    keyboardType="numeric"
                  />
                </View>
                <Pressable
                  style={styles.removeChargeBtn}
                  onPress={() => handleRemoveCharge(charge.id)}
                >
                  <FontAwesome
                    name="times"
                    size={12}
                    color={Theme.negative || "#dc2626"}
                  />
                </Pressable>
              </View>
            </View>
          ))}

        <View style={styles.tripsList}>
          {selectedTrips.length === 0 && (
            <View style={styles.emptyTrips}>
              <FontAwesome
                name="file-text-o"
                size={24}
                color={Theme.borderMedium}
                style={{ marginBottom: 8 }}
              />
              <Text style={styles.emptyTripsText}>No context selected</Text>
            </View>
          )}
          {selectedTrips.length > 0 ? (
            <View style={styles.splitToggleRow}>
              <Pressable
                style={[styles.splitToggleBtn, showSplit && styles.splitToggleBtnOn]}
                onPress={() => setShowSplit(true)}
                accessibilityRole="button"
                accessibilityState={{ selected: showSplit }}
                accessibilityLabel="Show split"
              >
                <Text
                  style={[
                    styles.splitToggleText,
                    showSplit && styles.splitToggleTextOn,
                  ]}
                >
                  Show split
                </Text>
              </Pressable>
              <Pressable
                style={[styles.splitToggleBtn, !showSplit && styles.splitToggleBtnOn]}
                onPress={() => setShowSplit(false)}
                accessibilityRole="button"
                accessibilityState={{ selected: !showSplit }}
                accessibilityLabel="No split"
              >
                <Text
                  style={[
                    styles.splitToggleText,
                    !showSplit && styles.splitToggleTextOn,
                  ]}
                >
                  No split
                </Text>
              </Pressable>
            </View>
          ) : null}
          {selectedTrips.map((trip) => {
            const tripNotes = adjustmentsForTripId(
              tripAdjustmentsRecord,
              trip.internal_id,
            );
            const revised = invoiceTripAdjustedAmount(trip.amount, tripNotes);
            const hasSplit = Math.abs(revised - trip.amount) >= 0.005;
            return (
              <View key={trip.id} style={styles.tripItemWrapper}>
                <View style={styles.tripItem}>
                  <View style={styles.tripItemMeta}>
                    <Text style={styles.tripItemTitle}>
                      <Text style={styles.tripItemId}>{trip.id}</Text>
                      <Text style={styles.tripItemDot}> · </Text>
                      <Text style={styles.tripItemDate}>{trip.date}</Text>
                    </Text>
                    <Text style={styles.tripItemRoute}>{trip.route}</Text>
                    <View style={styles.tripItemPodRow}>
                      <TripCompletionOrPodTags
                        compact
                        tripCompleted={tripIsDeliveredStatus(trip.tripStatus)}
                        softCopyReceived={Boolean(trip.digitalPodPresent)}
                        hardCopyReceived={Boolean(trip.physicalPodReceived)}
                      />
                    </View>
                  </View>
                  <View style={styles.tripItemAmounts}>
                    <Text style={styles.tripItemAmount}>
                      {formatCurrency(revised)}
                    </Text>
                    {showSplit && hasSplit ? (
                      <Text style={styles.tripItemBaseAmount}>
                        Freight {formatCurrency(trip.amount)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <InvoiceTripCnDnGroup
                  trip={trip}
                  adjustments={tripNotes}
                  showBreakdown={showSplit}
                  onAdd={() => {
                    setCnDnEdit(null);
                    setCnDnTrip(trip);
                  }}
                  onEdit={(adj) => {
                    setCnDnEdit(adj);
                    setCnDnTrip(trip);
                  }}
                />
              </View>
            );
          })}
        </View>

        {/* Invoice Settings */}
        <View style={styles.settingsBlock}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Payment Terms</Text>
            <View style={styles.settingsSelectWrap}>
              <Pressable
                style={styles.settingsSelect}
                onPress={() => setShowTermsModal((prev) => !prev)}
              >
                <Text style={styles.settingsSelectText}>{paymentTerms}</Text>
                <FontAwesome
                  name={showTermsModal ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={Theme.textMuted}
                />
              </Pressable>

              {Platform.OS === "web" ? (
                showTermsModal ? (
                  <View style={styles.webTermsDropdown}>
                    {PAYMENT_TERMS_OPTIONS.map((term) => (
                      <Pressable
                        key={term}
                        style={styles.termOption}
                        onPress={() => {
                          setPaymentTerms(term);
                          setShowTermsModal(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.termOptionText,
                            paymentTerms === term && styles.termOptionActive,
                          ]}
                        >
                          {term}
                        </Text>
                        {paymentTerms === term && (
                          <FontAwesome
                            name="check"
                            size={14}
                            color={Theme.primary}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                ) : null
              ) : (
                <Modal
                  visible={showTermsModal}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowTermsModal(false)}
                >
                  <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowTermsModal(false)}
                  >
                    <Pressable
                      style={styles.termsModalContent}
                      onPress={() => {}}
                    >
                      {PAYMENT_TERMS_OPTIONS.map((term) => (
                        <Pressable
                          key={term}
                          style={styles.termOption}
                          onPress={() => {
                            setPaymentTerms(term);
                            setShowTermsModal(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.termOptionText,
                              paymentTerms === term && styles.termOptionActive,
                            ]}
                          >
                            {term}
                          </Text>
                          {paymentTerms === term && (
                            <FontAwesome
                              name="check"
                              size={14}
                              color={Theme.primary}
                            />
                          )}
                        </Pressable>
                      ))}
                    </Pressable>
                  </Pressable>
                </Modal>
              )}
            </View>
          </View>

          <View style={styles.settingsCol}>
            <Text style={styles.settingsLabel}>Remarks / Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add special instructions, PO references..."
              placeholderTextColor={Theme.textMuted}
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.settingsToggles}>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setIncludeGst(!includeGst)}
            >
              <View
                style={[styles.checkbox, includeGst && styles.checkboxActive]}
              >
                {includeGst && (
                  <FontAwesome name="check" size={10} color="#fff" />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Apply GST</Text>
              {includeGst && (
                <View style={styles.rateInputWrap}>
                  <TextInput
                    style={styles.rateInput}
                    value={String(gstRate)}
                    onChangeText={(t) => setGstRate(Number.parseFloat(t) || 0)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.rateSuffix}>%</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setIncludeFuel(!includeFuel)}
            >
              <View
                style={[styles.checkbox, includeFuel && styles.checkboxActive]}
              >
                {includeFuel && (
                  <FontAwesome name="check" size={10} color="#fff" />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Fuel Surcharge</Text>
              {includeFuel && (
                <View style={styles.rateInputWrap}>
                  <TextInput
                    style={styles.rateInput}
                    value={String(fuelRate)}
                    onChangeText={(t) => setFuelRate(Number.parseFloat(t) || 0)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.rateSuffix}>%</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Calculations */}
        <View style={styles.calcBlock}>
          {taxDisplay?.warning ? (
            <Text style={styles.taxWarning}>{taxDisplay.warning}</Text>
          ) : null}
          {(taxDisplay?.rows ?? []).map((row) => (
            <View
              key={row.key}
              style={[
                styles.calcRow,
                row.key === "taxable" ? { marginBottom: 16 } : null,
              ]}
            >
              <Text
                style={
                  row.key === "taxable"
                    ? styles.calcLabelSubtotal
                    : styles.calcLabel
                }
              >
                {row.label}
              </Text>
              <Text
                style={
                  row.key === "taxable" ? styles.calcValSubtotal : styles.calcVal
                }
              >
                {row.value}
              </Text>
            </View>
          ))}
          <View style={styles.calcSubtotal} />
          <View style={styles.calcTotalRow}>
            <View>
              <Text style={styles.calcTotalLabel}>Total Amount</Text>
              <Text style={styles.calcTotalSub}>Draft — not issued</Text>
            </View>
            <Text style={styles.calcTotalVal}>
              {formatCurrency(draft?.tax.total_amount ?? 0)}
            </Text>
          </View>
        </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          invoiceBuildBlockedReason ? styles.footerBlocked : null,
          {
            paddingBottom: isStandalone
              ? layout.scrollBottomPadding(12)
              : insets.bottom + 16,
          },
        ]}
      >
        {invoiceBuildBlockedReason ? (
          <Text style={styles.buildGateReason}>{invoiceBuildBlockedReason}</Text>
        ) : invoiceIssueBlockedReason ? (
          <Text style={styles.buildGateReason}>{invoiceIssueBlockedReason}</Text>
        ) : null}
        <Pressable
          style={[
            styles.footerBtnSecondary,
            (isFinalizing ||
              isIssuing ||
              selectedTrips.length === 0 ||
              Boolean(invoiceBuildBlockedReason)) &&
              styles.btnDisabled,
          ]}
          onPress={handleInitiatePreview}
          disabled={
            isFinalizing ||
            isIssuing ||
            selectedTrips.length === 0 ||
            Boolean(invoiceBuildBlockedReason)
          }
          accessibilityLabel={invoiceBuildBlockedReason ?? "Preview draft"}
        >
          {isFinalizing ? (
            <LoadingIndicator color={Theme.textPrimaryDark} size="small" />
          ) : (
            <>
              <FontAwesome
                name="file-text"
                size={14}
                color={Theme.textPrimaryDark}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.footerBtnSecondaryText}>Preview draft</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[
            styles.footerBtnPrimary,
            issueBlocked && styles.btnDisabled,
          ]}
          onPress={handleIssueInvoice}
          disabled={issueBlocked}
          accessibilityLabel="Issue Invoice"
        >
          {isIssuing ? (
            <LoadingIndicator color={Theme.buttonPrimaryText} size="small" />
          ) : (
            <Text style={styles.footerBtnPrimaryText}>Issue Invoice</Text>
          )}
        </Pressable>
      </View>
      <ProvisionAdjustmentModal
        visible={cnDnTrip != null}
        side="client"
        onClose={closeCnDnModal}
        onSave={handleSaveTripCnDn}
        onUpdate={handleUpdateTripCnDn}
        editTarget={cnDnEdit}
        tripCode={cnDnTrip?.id}
        partyLabel={activeClient}
        clientName={activeClient || cnDnTrip?.client || "Client"}
        supplierName={cnDnTrip?.supplier_name || "Supplier"}
        sales={cnDnTrip?.amount ?? 0}
        adjSales={invoiceTripAdjustedAmount(
          cnDnTrip?.amount ?? 0,
          cnDnTrip
            ? adjustmentsForTripId(tripAdjustmentsRecord, cnDnTrip.internal_id)
            : [],
        )}
        cost={0}
        adjCost={0}
        revenueSideDelta={
          cnDnTrip
            ? invoiceTripAdjustedAmount(
                cnDnTrip.amount,
                adjustmentsForTripId(tripAdjustmentsRecord, cnDnTrip.internal_id),
              ) - cnDnTrip.amount
            : 0
        }
        costSideDelta={0}
        adjustments={
          cnDnTrip
            ? adjustmentsForTripId(tripAdjustmentsRecord, cnDnTrip.internal_id)
            : []
        }
        lineMetaLabel={(adj) =>
          (adj.reason ?? "").trim() ||
          (adj.impact === "minus" ? "Credit note" : "Debit note")
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.surface,
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    paddingTop: 12,
    minHeight: 68,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  headerDraftTag: {
    color: Theme.textMuted,
    fontWeight: "500",
  },
  headerSub: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerIconBtn: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
  },

  body: { flex: 1, backgroundColor: Theme.screenBackground },
  bodyContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 40,
    paddingTop: 16,
    flexGrow: 1,
  },
  bodyContentExpanded: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  document: {
    width: "100%",
    flexGrow: 1,
    alignSelf: "stretch",
  },
  documentExpanded: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },

  rowLayout: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 24,
    marginBottom: 20,
  },
  colLayout: { flex: 1, minWidth: 0 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  editClientBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  editClientBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.primary,
  },

  infoCard: {
    backgroundColor: Theme.cardWhite,
    paddingVertical: 4,
    paddingRight: 8,
    minHeight: 72,
  },
  clientName: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  clientAddress: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textRouteCard,
    marginBottom: 2,
    lineHeight: 17,
  },

  taxText: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
    lineHeight: 18,
  },
  taxLabel: { color: Theme.textMuted, fontWeight: "500" },

  configBlock: { marginBottom: 24 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    padding: 12,
    marginBottom: 8,
  },
  toggleText: { flex: 1, paddingRight: 16 },
  toggleTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  toggleSub: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  addChargeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.brandBlueWashSubtle,
    borderRadius: 8,
  },
  addChargeText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.primary,
  },

  chargeRow: {
    flexDirection: "row",
    backgroundColor: Theme.cardWhite,
    padding: 8,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  chargeContentCol: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 120,
    paddingRight: 6,
  },
  chargeActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    maxWidth: 220,
  },
  chargeInput: {
    width: "100%",
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    padding: 0,
    margin: 0,
  },
  chargeHint: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 2,
  },

  chargeTypeToggle: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 2,
  },
  chargeTypeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 32,
    borderRadius: 4,
    justifyContent: "center",
  },
  chargeTypeBtnAdd: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  chargeTypeBtnMinus: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  chargeTypeText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  chargeTypeTextAdd: { color: "#059669" },
  chargeTypeTextMinus: { color: "#dc2626" },

  chargeAmountWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 4,
    paddingVertical: 2,
    width: 72,
  },
  chargeCurrencySymbol: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginRight: 2,
  },
  chargeAmountInput: {
    width: 44,
    fontSize: 13,
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    padding: 0,
    margin: 0,
  },
  removeChargeBtn: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,38,38,0.08)",
    borderRadius: 8,
  },

  tripsList: { marginBottom: 24 },
  splitToggleRow: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    borderRadius: 999,
    padding: 3,
    marginBottom: 12,
    gap: 2,
  },
  splitToggleBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "transparent",
  },
  splitToggleBtnOn: {
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  splitToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  splitToggleTextOn: {
    color: Theme.textPrimaryDark,
  },
  emptyTrips: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  emptyTripsText: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  tripItemWrapper: { marginBottom: 12 },
  tripItem: {
    backgroundColor: Theme.cardWhite,
    paddingVertical: 12,
    paddingHorizontal: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripItemMeta: { flex: 1, minWidth: 0 },
  tripItemAmounts: { alignItems: "flex-end", flexShrink: 0 },
  tripItemTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
    lineHeight: 20,
  },
  tripItemId: { color: Theme.primary, fontWeight: "600" },
  tripItemDot: { color: Theme.textMuted, fontWeight: "400" },
  tripItemDate: { color: Theme.textRouteCard, fontWeight: "400" },
  tripItemRoute: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textRouteCard,
    lineHeight: 19,
  },
  tripItemPodRow: {
    marginTop: 6,
  },
  tripItemAmount: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  tripItemBaseAmount: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  adjustBtn: {
    marginTop: 4,
    minHeight: 32,
    justifyContent: "center",
  },
  addTripChargeText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.primary,
  },

  tripChargeRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 8,
    marginTop: 4,
    marginLeft: 24,
    alignItems: "center",
    gap: 6,
  },

  calcBlock: {
    backgroundColor: Theme.cardWhite,
    paddingVertical: 8,
    marginBottom: 24,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calcLabel: { fontSize: 13, color: Theme.textRouteCard, fontWeight: "400" },
  calcVal: {
    fontSize: 13,
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  calcSubtotal: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 8,
    marginVertical: 8,
  },
  calcLabelSubtotal: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  calcValSubtotal: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  taxWarning: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.warning,
    marginBottom: 12,
  },
  calcTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
  },
  calcTotalLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  calcTotalSub: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 2,
  },
  calcTotalVal: {
    fontSize: 22,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.primary,
  },

  annexureBlock: {
    backgroundColor: "#0f172a",
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  annexureHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  annexureTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  annexureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    alignItems: "center",
  },
  annexureLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  annexureValue: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#fff",
    flex: 1,
    textAlign: "right",
    marginLeft: 16,
  },

  settingsBlock: {
    backgroundColor: Theme.cardWhite,
    paddingVertical: 8,
    marginBottom: 24,
    position: "relative",
    overflow: "visible",
    zIndex: 10,
  },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    position: "relative",
    zIndex: 30,
  },
  settingsCol: {
    marginBottom: 16,
    position: "relative",
    zIndex: 1,
  },
  settingsLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginBottom: 6,
  },
  settingsSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: Layout.minTouchTargetSize,
    minWidth: 140,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  settingsSelectWrap: {
    position: "relative",
    alignItems: "flex-end",
    zIndex: 1000,
  },
  settingsSelectText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  notesInput: {
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    minHeight: 72,
    textAlignVertical: "top",
    position: "relative",
    zIndex: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  settingsToggles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 16,
    position: "relative",
    zIndex: 1,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: Layout.minTouchTargetSize,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: Theme.buttonPrimary,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimary,
  },
  rateInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rateInput: {
    width: 36,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    padding: 0,
    margin: 0,
  },
  rateSuffix: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textMuted,
    marginLeft: 2,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  footerBlocked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  buildGateReason: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  footerBtnOutline: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  footerBtnOutlineText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  footerBtnSecondary: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 14,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 10,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  footerBtnPrimary: {
    flex: 2,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 14,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 10,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerBtnPrimaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.buttonPrimaryText,
  },
  btnDisabled: { opacity: 0.5 },

  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  termsModalContent: {
    backgroundColor: Theme.cardWhite,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  termOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  termOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  termOptionActive: { color: Theme.primary, fontWeight: "600" },
  webTermsDropdown: {
    position: "absolute" as const,
    top: 44,
    right: 0,
    width: 120,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 24,
    zIndex: 9999,
  },
});
