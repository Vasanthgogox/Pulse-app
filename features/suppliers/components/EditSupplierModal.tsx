import { useLanguage } from "@/contexts/LanguageContext";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatMobileNumber } from "@/lib/format";
import type {
  SupplierRow,
  UpdateSupplierData,
} from "@/features/suppliers/services/suppliers.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Treat DB/API placeholders or internal ids as empty so we show proper placeholders instead. */
function normalizeContactDisplay(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s) return "";
  if (s === "nameLabel" || s === "contactPerson" || s === "contact") return "";
  return s;
}

/** Treat linked-org placeholder or UUID in phone field as empty for display. */
function normalizePhoneDisplay(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s) return "";
  if (/^linked-/i.test(s)) return "";
  if (s.toLowerCase().includes("linked-")) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "";
  if (/^[0-9a-f-]{36,}$/i.test(s)) return "";
  return s;
}

export interface LinkedOrgProfile {
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstin?: string | null;
  address?: string | null;
  website?: string | null;
}

export interface EditSupplierModalProps {
  visible: boolean;
  supplier: SupplierRow | null;
  onClose: () => void;
  /** Called with a patch object; caller is responsible for invoking updateSupplier with the current org + supplier id. */
  onSave: (patch: UpdateSupplierData) => Promise<void> | void;
  /** Optional: when provided for integrated suppliers, shows a Sync Latest button that calls this to prefill from platform profile. */
  onSyncLatest?: () => Promise<LinkedOrgProfile | void>;
  /** Optional: pre-fetched linked org profile so edit form shows name/phone/email before or without tapping Sync. */
  initialLinkedProfile?: LinkedOrgProfile | null;
}

export function EditSupplierModal({
  visible,
  supplier,
  onClose,
  onSave,
  onSyncLatest,
  initialLinkedProfile,
}: EditSupplierModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [vehicleTypes, setVehicleTypes] = useState("");
  const [operatingAreas, setOperatingAreas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    if (supplier) {
      const fromSupplier = {
        companyName: supplier.name ?? supplier.company_name ?? "",
        contactPerson: normalizeContactDisplay(supplier.contact_person ?? supplier.contact),
        phone: normalizePhoneDisplay(supplier.phone),
        email: supplier.email ?? "",
      };
      const hasEmpty = !fromSupplier.contactPerson || !fromSupplier.phone;
      const fromLinked = initialLinkedProfile && supplier.supplier_type === "integrated" && hasEmpty
        ? {
            companyName: (initialLinkedProfile.companyName ?? "").trim() || fromSupplier.companyName,
            contactPerson: (initialLinkedProfile.contactPerson ?? "").trim() || fromSupplier.contactPerson,
            phone: (initialLinkedProfile.phone ?? "").trim() || fromSupplier.phone,
            email: (initialLinkedProfile.email ?? "").trim() || fromSupplier.email,
          }
        : null;
      setCompanyName(fromLinked?.companyName ?? fromSupplier.companyName);
      setContactPerson(fromLinked?.contactPerson ?? fromSupplier.contactPerson);
      setPhone(fromLinked?.phone ?? fromSupplier.phone);
      setEmail(fromLinked?.email ?? fromSupplier.email);
      setAddress(supplier.address ?? "");
      setGstin((supplier as { gstin?: string | null }).gstin ?? "");
      setPanNumber((supplier as { pan_number?: string | null }).pan_number ?? "");
      setVehicleTypes((supplier.vehicle_types ?? []).join(", "));
      setOperatingAreas((supplier.operating_areas ?? []).join(", "));
    }
  }, [supplier, initialLinkedProfile]);

  const isIntegrated = supplier?.supplier_type === "integrated";

  // For integrated suppliers, platform profile (contact, phone) lives on the linked org, not in the supplier row.
  // Auto-fetch and prefill when modal opens so the user sees data without tapping "Sync latest details".
  const hasEmptyContactOrPhone =
    isIntegrated &&
    (normalizeContactDisplay(supplier?.contact_person ?? supplier?.contact) === "" ||
      normalizePhoneDisplay(supplier?.phone ?? "") === "");

  useEffect(() => {
    if (!visible || !supplier || !isIntegrated || !onSyncLatest || !hasEmptyContactOrPhone) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await onSyncLatest();
        if (cancelled || !result) return;
        if (result.companyName != null) setCompanyName(result.companyName);
        if (result.contactPerson != null)
          setContactPerson(normalizeContactDisplay(result.contactPerson));
        if (result.phone != null) setPhone(normalizePhoneDisplay(result.phone));
        if (result.email != null) setEmail((result.email ?? "").trim());
        if (result.gstin && !gstin.trim()) setGstin(result.gstin.trim());
        if (result.address && !address.trim()) setAddress(result.address.trim());
      } catch {
        // Ignore; user can still tap "Sync latest details" manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, supplier?.id, isIntegrated, hasEmptyContactOrPhone, onSyncLatest]);

  if (!visible || !supplier) return null;
  const canEditCompany = !isIntegrated;
  const canEditPhone = !isIntegrated;

  const canSubmit =
    contactPerson.trim().length > 0 && !submitting && (!!companyName || isIntegrated);
  const useSingleColumnFields = windowWidth < 390;

  const handleSyncLatest = async () => {
    if (!onSyncLatest || !isIntegrated) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await onSyncLatest();
      if (result) {
        if (result.companyName != null) setCompanyName(result.companyName);
        if (result.contactPerson != null)
          setContactPerson(normalizeContactDisplay(result.contactPerson));
        if (result.phone != null) setPhone(normalizePhoneDisplay(result.phone));
        if (result.email != null) setEmail((result.email ?? "").trim());
        if (result.gstin) setGstin(result.gstin.trim());
        if (result.address) setAddress(result.address.trim());
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to sync latest supplier details",
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const patch: UpdateSupplierData = {};
    patch.contact_person = contactPerson.trim();
    patch.email = email.trim();
    patch.address = address.trim();
    patch.gstin = gstin.trim();
    patch.pan_number = panNumber.trim();
    patch.vehicle_types = vehicleTypes.split(",").map((s) => s.trim()).filter(Boolean);
    patch.operating_areas = operatingAreas.split(",").map((s) => s.trim()).filter(Boolean);
    if (canEditCompany) {
      patch.name = companyName.trim();
    }
    if (canEditPhone) {
      patch.phone = phone.trim();
    }
    const result = onSave(patch);
    const p = result as void | Promise<unknown>;
    if (typeof p?.then === "function") {
      p.then(() => {
        setSubmitting(false);
        onClose();
      }).catch((err: unknown) => {
        setSubmitting(false);
        setError(
          err instanceof Error ? err.message : "Failed to update supplier",
        );
      });
    } else {
      setSubmitting(false);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <KeyboardAvoidingView
        style={styles.screenRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.screenRoot, { backgroundColor: Theme.surface }]}>
          <View
            style={[
              styles.screenHeader,
              { paddingTop: insets.top + 16 },
            ]}
          >
            <TouchableOpacity
              style={styles.screenHeaderButton}
              onPress={onClose}
              accessibilityLabel="Go back"
              activeOpacity={0.8}
            >
              <FontAwesome
                name="chevron-left"
                size={16}
                color={Theme.textPrimaryDark}
              />
            </TouchableOpacity>
            <View style={styles.screenHeaderTitleWrap}>
              <Text style={styles.screenTitle}>Edit Supplier</Text>
            </View>
          </View>

          <ScrollView
            style={styles.screenScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.screenScrollContent,
              { paddingBottom: insets.bottom + 140 },
            ]}
          >
            <View style={styles.screenSection}>
              <Text style={styles.screenSectionLabel}>SUPPLIER DETAILS</Text>

              {isIntegrated && (
                <View style={styles.screenStatusCard}>
                  <Text style={styles.screenStatusTitle}>Integrated supplier</Text>
                  <Text style={styles.screenStatusText}>
                    Core details like company name and phone sync from the supplier&apos;s
                    own account and cannot be edited here. You can still update your
                    local contact person and email.
                  </Text>
                  {onSyncLatest ? (
                    <TouchableOpacity
                      style={styles.screenSyncButton}
                      onPress={handleSyncLatest}
                      disabled={syncing || submitting}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.screenSyncButtonText}>
                        {syncing ? "Syncing..." : "Sync latest details"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              <Pressable style={styles.screenInputCard}>
                <Text style={styles.screenInputLabel}>{t("companyName")}</Text>
                <TextInput
                  style={[styles.screenInput, !canEditCompany && styles.readonlyInput]}
                  placeholder={t("company")}
                  placeholderTextColor={Theme.textMutedDemo}
                  value={companyName}
                  onChangeText={setCompanyName}
                  editable={canEditCompany}
                  autoCapitalize="words"
                />
              </Pressable>

              <View
                style={[
                  styles.screenTwoCol,
                  useSingleColumnFields && styles.screenTwoColStack,
                ]}
              >
                <Pressable style={styles.screenFieldCard}>
                  <Text style={styles.screenInputLabel}>
                    Name <Text style={styles.screenRequiredMark}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.screenInput}
                    placeholder={t("contactName")}
                    placeholderTextColor={Theme.textMutedDemo}
                    value={contactPerson}
                    onChangeText={setContactPerson}
                    autoCapitalize="words"
                  />
                </Pressable>

                <Pressable style={styles.screenFieldCard}>
                  <Text style={styles.screenInputLabel}>Phone number</Text>
                  <TextInput
                    style={[styles.screenInput, !canEditPhone && styles.readonlyInput]}
                    placeholder={
                      isIntegrated && !normalizePhoneDisplay(phone)
                        ? "From platform"
                        : "+91 98765 43210"
                    }
                    placeholderTextColor={Theme.textMutedDemo}
                    value={phone}
                    onChangeText={(t) => setPhone(formatMobileNumber(t))}
                    editable={canEditPhone}
                    keyboardType="phone-pad"
                  />
                </Pressable>
              </View>

              <Pressable style={styles.screenInputCard}>
                <Text style={styles.screenInputLabel}>Email</Text>
                <TextInput
                  style={styles.screenInput}
                  placeholder={t("email")}
                  placeholderTextColor={Theme.textMutedDemo}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </Pressable>

              <Pressable style={styles.screenInputCard}>
                <Text style={styles.screenInputLabel}>Address</Text>
                <TextInput
                  style={styles.screenInput}
                  placeholder="Registered address"
                  placeholderTextColor={Theme.textMutedDemo}
                  value={address}
                  onChangeText={setAddress}
                  autoCapitalize="words"
                />
              </Pressable>

              <View style={[styles.screenTwoCol, useSingleColumnFields && styles.screenTwoColStack]}>
                <Pressable style={styles.screenFieldCard}>
                  <Text style={styles.screenInputLabel}>GSTIN</Text>
                  <TextInput
                    style={styles.screenInput}
                    placeholder="22AAAAA0000A1Z5"
                    placeholderTextColor={Theme.textMutedDemo}
                    value={gstin}
                    onChangeText={setGstin}
                    autoCapitalize="characters"
                  />
                </Pressable>
                <Pressable style={styles.screenFieldCard}>
                  <Text style={styles.screenInputLabel}>PAN Number</Text>
                  <TextInput
                    style={styles.screenInput}
                    placeholder="AAAAA0000A"
                    placeholderTextColor={Theme.textMutedDemo}
                    value={panNumber}
                    onChangeText={setPanNumber}
                    autoCapitalize="characters"
                  />
                </Pressable>
              </View>

              <Pressable style={styles.screenInputCard}>
                <Text style={styles.screenInputLabel}>Vehicle types (comma-separated)</Text>
                <TextInput
                  style={styles.screenInput}
                  placeholder="e.g. Truck, Trailer, Mini-truck"
                  placeholderTextColor={Theme.textMutedDemo}
                  value={vehicleTypes}
                  onChangeText={setVehicleTypes}
                />
              </Pressable>

              <Pressable style={styles.screenInputCard}>
                <Text style={styles.screenInputLabel}>Operating areas (comma-separated)</Text>
                <TextInput
                  style={styles.screenInput}
                  placeholder="e.g. Mumbai, Pune, Bangalore"
                  placeholderTextColor={Theme.textMutedDemo}
                  value={operatingAreas}
                  onChangeText={setOperatingAreas}
                />
              </Pressable>

              {error ? (
                <View style={styles.screenErrorCard}>
                  <Text style={styles.screenErrorText}>{error}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View
            style={[
              styles.screenFooter,
              { paddingBottom: insets.bottom + 12 },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.screenSubmitButton,
                (!canSubmit || submitting) && styles.screenButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              activeOpacity={0.9}
            >
              <Text style={styles.screenSubmitButtonText}>
                {submitting ? "Saving..." : "SAVE CHANGES"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  screenHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  screenHeaderTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  screenScroll: {
    flex: 1,
  },
  screenScrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
    gap: 24,
  },
  screenSection: {
    gap: 14,
  },
  screenSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 4,
  },
  screenInputCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 88,
  },
  screenTwoCol: {
    flexDirection: "row",
    gap: 12,
  },
  screenTwoColStack: {
    flexDirection: "column",
  },
  screenFieldCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 88,
  },
  screenInputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  screenRequiredMark: {
    color: Theme.negative,
  },
  screenInput: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    minHeight: 28,
  },
  screenStatusCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  screenStatusTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  screenStatusText: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 19,
  },
  screenSyncButton: {
    alignSelf: "flex-start",
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  screenSyncButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  screenErrorCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.negative + "30",
    borderRadius: 16,
    padding: 16,
  },
  screenErrorText: {
    fontSize: 13,
    color: Theme.negative,
    lineHeight: 19,
  },
  screenFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  screenSubmitButton: {
    minHeight: Layout.minTouchTargetSize + 12,
    borderRadius: 16,
    backgroundColor: Theme.buttonMatteBlack,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  screenSubmitButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonMatteBlackText,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  screenButtonDisabled: {
    opacity: 0.5,
  },
  readonlyInput: {
    color: Theme.textSecondary,
  },
});

