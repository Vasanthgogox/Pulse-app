import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useInvoiceCalc } from "@/features/invoicing/hooks/useInvoiceCalc";
import type {
    AdditionalCharge,
    InvoicingTripView,
} from "@/features/invoicing/services/invoicing.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface InvoicePreviewPanelProps {
  onClose?: () => void;
  onPreview: (params: any) => void; // Changed from onFinalize to onPreview
  isFinalizing: boolean; // This will now represent the state of PDF generation/navigation
  activeClient: string | null;
  selectedTrips: InvoicingTripView[];
  isStandalone?: boolean;
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
  isFinalizing,
  activeClient,
  selectedTrips,
  isStandalone = false,
}: InvoicePreviewPanelProps) {
  const insets = useSafeAreaInsets();
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

  // Calculations are needed here for display, but will be re-calculated in the PDF screen
  const calculations = useInvoiceCalc(selectedTrips, {
    includeGst,
    gstRate,
    includeFuel,
    fuelRate,
    additionalCharges,
  });

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
    if (selectedTrips.length === 0) return;

    const params = {
      activeClient: activeClient || "",
      selectedTripIds: JSON.stringify(selectedTrips.map((t) => t.id)),
      paymentTerms,
      notes,
      includeGst: includeGst.toString(),
      gstRate: gstRate.toString(),
      includeFuel: includeFuel.toString(),
      fuelRate: fuelRate.toString(),
      additionalCharges: JSON.stringify(additionalCharges),
    };
    onPreview(params);
  };

  return (
    <View
      style={[
        styles.sheet,
        !isStandalone && { paddingTop: insets.top > 0 ? insets.top : 16 },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Invoice Draft{" "}
            <Text style={{ color: Theme.textMuted }}>#INV-DRAFT</Text>
          </Text>
        </View>
        {onClose && (
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            disabled={isFinalizing}
          >
            <FontAwesome name="times" size={20} color={Theme.textPrimaryDark} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        {...tabBarScrollProps}
      >
        {/* Header Info */}
        <View style={styles.rowLayout}>
          <View style={styles.colLayout}>
            <Text style={styles.sectionLabel}>Billing Address</Text>
            <View style={styles.infoCard}>
              {activeClient ? (
                <>
                  <Text style={styles.clientName}>{activeClient}</Text>
                  <Text style={styles.clientAddress}>Corporate House, HQ</Text>
                  <Text style={styles.clientAddress}>
                    City Center, State - 000000
                  </Text>
                </>
              ) : (
                <Text style={styles.clientAddress}>Select a client...</Text>
              )}
            </View>
          </View>
          <View style={styles.colLayout}>
            <Text style={styles.sectionLabel}>Tax Details</Text>
            <View style={styles.infoCard}>
              <Text style={styles.taxText}>
                <Text style={styles.taxLabel}>GSTIN</Text> 24AAA CA000 1Z1
              </Text>
              <Text style={styles.taxText}>
                <Text style={styles.taxLabel}>PAN</Text> AAAC0000A
              </Text>
              <Text style={styles.taxText}>
                <Text style={styles.taxLabel}>State</Text> 24
              </Text>
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
                    color={Theme.errorText || "#dc2626"}
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
          {selectedTrips.map((trip) => {
            const tripCharges = additionalCharges.filter(
              (c) => c.tripId === trip.id,
            );
            return (
              <View key={trip.id} style={styles.tripItemWrapper}>
                <View style={styles.tripItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tripItemTitle}>
                      <Text style={{ color: Theme.primary }}>{trip.id}</Text>{" "}
                      <Text style={{ color: Theme.textMuted }}>•</Text>{" "}
                      {trip.date}
                    </Text>
                    <Text style={styles.tripItemRoute} numberOfLines={1}>
                      {trip.route}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.tripItemAmount}>
                      {formatCurrency(trip.amount)}
                    </Text>
                    <Pressable
                      onPress={() => handleAddCharge(trip.id)}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={styles.addTripChargeText}>+ Adjust</Text>
                    </Pressable>
                  </View>
                </View>
                {tripCharges.map((charge) => (
                  <View key={charge.id} style={styles.tripChargeRow}>
                    <View style={styles.chargeContentCol}>
                      <TextInput
                        style={styles.chargeInput}
                        value={charge.description}
                        onChangeText={(t) =>
                          handleUpdateCharge(charge.id, "description", t)
                        }
                        placeholder="Trip adjustment..."
                        placeholderTextColor={Theme.textMuted}
                      />
                    </View>
                    <View style={styles.chargeActionsRow}>
                      <View style={styles.chargeTypeToggle}>
                        <Pressable
                          style={[
                            styles.chargeTypeBtn,
                            charge.amount >= 0 ? styles.chargeTypeBtnAdd : null,
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
                              charge.amount >= 0
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
                            charge.amount < 0
                              ? styles.chargeTypeBtnMinus
                              : null,
                          ]}
                          onPress={() =>
                            handleUpdateCharge(
                              charge.id,
                              "amount",
                              -Math.abs(charge.amount),
                            )
                          }
                        >
                          <Text
                            style={[
                              styles.chargeTypeText,
                              charge.amount < 0
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
                            const isNeg = charge.amount < 0;
                            handleUpdateCharge(
                              charge.id,
                              "amount",
                              isNeg ? -val : val,
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
                          color={Theme.errorText || "#dc2626"}
                        />
                      </Pressable>
                    </View>
                  </View>
                ))}
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
          <View style={[styles.calcRow, { marginBottom: 16 }]}>
            <Text style={styles.calcLabelSubtotal}>Subtotal</Text>
            <Text style={styles.calcValSubtotal}>
              {formatCurrency(calculations.subtotal)}
            </Text>
          </View>
          {calculations.fuelSurcharge > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Fuel Surcharge ({fuelRate}%)</Text>
              <Text style={styles.calcVal}>
                {formatCurrency(calculations.fuelSurcharge)}
              </Text>
            </View>
          )}
          {calculations.sgst > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>
                SGST ({calculations.sgstRate}%)
              </Text>
              <Text style={styles.calcVal}>
                {formatCurrency(calculations.sgst)}
              </Text>
            </View>
          )}
          {calculations.cgst > 0 && (
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>
                CGST ({calculations.cgstRate}%)
              </Text>
              <Text style={styles.calcVal}>
                {formatCurrency(calculations.cgst)}
              </Text>
            </View>
          )}
          <View style={styles.calcSubtotal} />
          <View style={styles.calcTotalRow}>
            <View>
              <Text style={styles.calcTotalLabel}>Total Amount</Text>
              <Text style={styles.calcTotalSub}>
                Inc. all taxes & surcharges
              </Text>
            </View>
            <Text style={styles.calcTotalVal}>
              {formatCurrency(calculations.totalAmount)}
            </Text>
          </View>
        </View>

        {/* Annexure Preview */}
        {selectedTrips.length > 0 && (
          <View style={styles.annexureBlock}>
            <View style={styles.annexureHeader}>
              <FontAwesome
                name="shield"
                size={14}
                color="#34d399"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.annexureTitle}>Annexure Intelligence</Text>
            </View>
            <View style={styles.annexureRow}>
              <Text style={styles.annexureLabel}>LR Scope:</Text>
              <Text style={styles.annexureValue} numberOfLines={1}>
                {selectedTrips.map((t) => t.id).join(", ")}
              </Text>
            </View>
            <View style={styles.annexureRow}>
              <Text style={styles.annexureLabel}>Asset Fleet:</Text>
              <Text style={styles.annexureValue} numberOfLines={1}>
                {Array.from(
                  new Set(selectedTrips.map((t) => t.details || "N/A")),
                ).join(", ")}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: isStandalone
              ? Layout.demoTabBarScrollBottomInset + 12
              : insets.bottom + 16,
          },
        ]}
      >
        <Pressable
          style={[
            styles.footerBtnPrimary,
            (isFinalizing || selectedTrips.length === 0) && styles.btnDisabled,
          ]}
          onPress={handleInitiatePreview}
          disabled={isFinalizing || selectedTrips.length === 0}
        >
          {isFinalizing ? (
            <ActivityIndicator color={Theme.buttonPrimaryText} size="small" />
          ) : (
            <>
              <FontAwesome
                name="file-text"
                size={14}
                color={Theme.buttonPrimaryText}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.footerBtnPrimaryText}>Issue Invoice</Text>
            </>
          )}
        </Pressable>
      </View>
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
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    paddingTop: 12,
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerSub: { fontSize: 12, color: Theme.textMuted, marginTop: 4 },
  closeBtn: { padding: 8 },

  body: { flex: 1, backgroundColor: Theme.screenBackground },
  bodyContent: {
    padding: Layout.screenPaddingHorizontal,
    paddingBottom: 40,
    paddingTop: 16,
  },

  rowLayout: { flexDirection: "row", gap: 16, marginBottom: 24 },
  colLayout: { flex: 1 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },

  infoCard: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
  },
  clientName: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  clientAddress: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    marginBottom: 2,
  },

  taxText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  taxLabel: { color: Theme.textMuted, textTransform: "uppercase" },

  configBlock: { marginBottom: 24 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
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
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "rgba(26,35,126,0.05)",
    borderRadius: 4,
  },
  addChargeText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
  },

  chargeRow: {
    flexDirection: "row",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
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
    maxWidth: 170,
  },
  chargeInput: {
    width: "100%",
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    padding: 0,
    margin: 0,
  },
  chargeHint: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 2,
  },

  chargeTypeToggle: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  chargeTypeBtn: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
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
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  chargeTypeTextAdd: { color: "#059669" },
  chargeTypeTextMinus: { color: "#dc2626" },

  chargeAmountWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    width: 72,
  },
  chargeCurrencySymbol: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    marginRight: 2,
  },
  chargeAmountInput: {
    width: 44,
    fontSize: 11,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    padding: 0,
    margin: 0,
  },
  removeChargeBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,38,38,0.08)",
  },

  tripsList: { marginBottom: 24 },
  emptyTrips: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
  },
  emptyTripsText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tripItemWrapper: { marginBottom: 12 },
  tripItem: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripItemTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  tripItemRoute: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tripItemAmount: {
    fontSize: 13,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  addTripChargeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
  },

  tripChargeRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
    marginLeft: 24,
    alignItems: "center",
    gap: 6,
  },

  calcBlock: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calcLabel: { fontSize: 12, color: Theme.textSecondary, fontWeight: "600" },
  calcVal: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  calcSubtotal: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 8,
    marginVertical: 8,
  },
  calcLabelSubtotal: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  calcValSubtotal: {
    fontSize: 13,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  calcTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
  },
  calcTotalLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  calcTotalSub: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginTop: 2,
  },
  calcTotalVal: {
    fontSize: 24,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.primary,
  },

  annexureBlock: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
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
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 16,
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
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  settingsSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 120,
  },
  settingsSelectWrap: {
    position: "relative",
    alignItems: "flex-end",
    zIndex: 1000,
  },
  settingsSelectText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  notesInput: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    color: Theme.textPrimaryDark,
    minHeight: 60,
    textAlignVertical: "top",
    position: "relative",
    zIndex: 1,
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
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  checkboxLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  rateInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rateInput: {
    width: 36,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    padding: 0,
    margin: 0,
  },
  rateSuffix: {
    fontSize: 10,
    fontWeight: "800",
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
  footerBtnOutline: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
  },
  footerBtnOutlineText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  footerBtnPrimary: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 1,
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
    borderRadius: 12,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  termOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  termOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  termOptionActive: { color: Theme.primary, fontWeight: "800" },
  webTermsDropdown: {
    position: "absolute" as any,
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
