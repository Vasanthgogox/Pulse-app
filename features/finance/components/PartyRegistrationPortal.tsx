/**
 * Desktop-only fullscreen party addition flow (Finance). Native: no-op.
 * Two steps: fill form → review and confirm → calls Finance entity handlers.
 */
import Theme from "@/constants/Theme";
import type { AddClientFormData } from "@/features/clients/components/AddClientModal";
import type { DriverFormData } from "@/features/drivers/components/AddDriverModal";
import type { SupplierFormData } from "@/features/suppliers/components/AddSupplierModal";
import type { AddVehicleCompletePayload } from "@/features/vehicles/components/AddVehicleModal";
import { formatIndianVehicleNumberInput } from "@/lib/format";
import {
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from "@/lib/phoneValidation";
import { validateIndianVehicleNumber } from "@/lib/validation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  ArrowLeftRight,
  ArrowRight,
  BookUser,
  Building2,
  Check,
  ChevronLeft,
  Cpu,
  Key,
  Layers,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Truck,
  UserPlus,
  Verified,
} from "lucide-react-native";
import { isContactPickerAvailable, pickContactForNameAndPhone } from "@/lib/contactPicker";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type PartyRegistrationKind =
  | "client"
  | "supplier"
  | "driver"
  | "vehicle";

/** Web modal routes and Finance use the same portal above this width (px). */
export const PARTY_REGISTRATION_PORTAL_WEB_MIN_WIDTH = 900;

export interface PartyRegistrationPortalProps {
  visible: boolean;
  onClose: () => void;
  /** Tab selected when opened (from Finance subtabs). */
  initialKind: PartyRegistrationKind;
  organizationId: string | null;
  noOrganizationMessage: string | null;
  onRefreshOrganization?: () => void;
  onAddClient: (data: AddClientFormData) => Promise<void>;
  onAddSupplier: (data: SupplierFormData) => Promise<void>;
  onAddDriver: (data: DriverFormData) => Promise<void>;
  onAddVehicle: (payload: AddVehicleCompletePayload) => Promise<void>;
}

const DL_CLEAN = /[\s-]/g;

/** Stacked layout uses full width below 720px; sheet rounding/shadow only below this for nicer tablet-stacked. */
const PARTY_PORTAL_STACKED_SHEET_MAX_WIDTH = 640;
const DL_FORMAT = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/;

const READY_TO_SAVE_SUMMARY_COPY =
  "Saved records stay private to your current organization — Finance, trips, and assignments will pick them up automatically.";

function dlError(raw: string): string | null {
  const n = raw.trim().toUpperCase().replace(DL_CLEAN, "");
  if (!n) return null;
  return DL_FORMAT.test(n)
    ? null
    : "Use a valid DL number (e.g. TN01 20200001234).";
}

type SummaryIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

function vehiclePayloadFromInputs(
  reg: string,
  modelLine: string,
  capacity: string,
  bodyLength: string,
  axle: string,
): AddVehicleCompletePayload {
  const vehicleNumber = formatIndianVehicleNumberInput(reg).trim();
  const typeSummary =
    [modelLine.trim(), capacity.trim()].filter(Boolean).join(" · ") || "Other";
  return {
    vehicleSource: "organization",
    vehicleNumber,
    vehicleType: typeSummary,
    capacity: capacity.trim(),
    vehicleBrand: modelLine.trim() || null,
    vehicleModel: modelLine.trim() || null,
    vehicleBodyType: null,
    vehicleSize: bodyLength.trim() || null,
    vehicleAxle: axle.trim() || null,
    documents: {},
  };
}

export function PartyRegistrationPortal(props: PartyRegistrationPortalProps) {
  if (Platform.OS !== "web") {
    return null;
  }

  const { width } = useWindowDimensions();
  const isWide = width >= 720;

  return <PartyRegistrationPortalInner {...props} layoutWide={isWide} />;
}

function PartyRegistrationPortalInner(
  props: PartyRegistrationPortalProps & { layoutWide: boolean },
) {
  const {
    visible,
    onClose,
    initialKind,
    organizationId,
    noOrganizationMessage,
    onRefreshOrganization,
    onAddClient,
    onAddSupplier,
    onAddDriver,
    onAddVehicle,
    layoutWide,
  } = props;

  const [kind, setKind] = useState<PartyRegistrationKind>(initialKind);
  const [step, setStep] = useState<"form" | "review">("form");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const { width: viewportW, height: viewportH } = useWindowDimensions();

  const stackedSheetVisuals =
    !layoutWide &&
    viewportW > 0 &&
    viewportW < PARTY_PORTAL_STACKED_SHEET_MAX_WIDTH;

  // Shared-ish fields
  const [orgOrCompanyName, setOrgOrCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");

  // Driver
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverDl, setDriverDl] = useState("");

  // Vehicle
  const [vehicleReg, setVehicleReg] = useState("");
  const [vehicleModelLine, setVehicleModelLine] = useState("");
  const [vehicleCapacity, setVehicleCapacity] = useState("");
  const [vehicleBodyFt, setVehicleBodyFt] = useState("");
  const [vehicleAxle, setVehicleAxle] = useState("");

  useEffect(() => {
    if (!visible) return;
    setKind(initialKind);
    setStep("form");
    setFormError(null);
    setSubmitting(false);
    setImportLoading(false);
    setImportError(null);
    setOrgOrCompanyName("");
    setContactName("");
    setPhoneDigits("");
    setDriverName("");
    setDriverPhone("");
    setDriverDl("");
    setVehicleReg("");
    setVehicleModelLine("");
    setVehicleCapacity("");
    setVehicleBodyFt("");
    setVehicleAxle("");
  }, [visible, initialKind]);

  const headline = useMemo(
    () =>
      kind === "client"
        ? "Customer"
        : kind === "supplier"
          ? "Supplier"
          : kind === "driver"
            ? "Driver"
            : "Vehicle",
    [kind],
  );

  const sideKindSubtitle = useMemo(() => {
    switch (kind) {
      case "client":
        return "Billing, contact, and phone — saved only as this customer.";
      case "supplier":
        return "Company and contact — saved only as this supplier.";
      case "driver":
        return "Name, phone, and licence — saved only as this driver.";
      default:
        return "Registration and specs — saved only as this vehicle.";
    }
  }, [kind]);

  const phoneE164Hint = useMemo(() => {
    const n = normalizeIndianPhoneForMetadata(phoneDigits);
    return n ?? "";
  }, [phoneDigits]);

  const driverPhonePretty = useMemo(() => {
    return normalizeIndianPhoneForMetadata(driverPhone) ?? driverPhone.trim();
  }, [driverPhone]);

  const validateFormForKind = useCallback(() => {
    setFormError(null);
    if (!organizationId) {
      setFormError(noOrganizationMessage ?? "Select or load an organization first.");
      return false;
    }
    if (kind === "client" || kind === "supplier") {
      const nameOk = contactName.trim().length >= 2;
      const phoneErr = validatePhone(phoneDigits);
      if (!nameOk) {
        setFormError("Enter the contact person's name.");
        return false;
      }
      if (phoneErr) {
        setFormError(phoneErr);
        return false;
      }
      return true;
    }
    if (kind === "driver") {
      if (driverName.trim().length < 2) {
        setFormError("Enter the driver's name.");
        return false;
      }
      const pErr = validatePhone(driverPhone);
      if (pErr) {
        setFormError(pErr);
        return false;
      }
      const dl = dlError(driverDl);
      if (!driverDl.trim()) {
        setFormError("Enter the driving licence number.");
        return false;
      }
      if (dl) {
        setFormError(dl);
        return false;
      }
      return true;
    }
    const regErr = validateIndianVehicleNumber(vehicleReg);
    if (regErr) {
      setFormError(regErr);
      return false;
    }
    if (
      !vehicleModelLine.trim() ||
      !vehicleCapacity.trim() ||
      !vehicleBodyFt.trim()
    ) {
      setFormError(
        "Enter vehicle type/model line, capacity (tons), and body length (ft).",
      );
      return false;
    }
    return true;
  }, [
    organizationId,
    noOrganizationMessage,
    kind,
    contactName,
    phoneDigits,
    driverName,
    driverPhone,
    driverDl,
    vehicleReg,
    vehicleModelLine,
    vehicleCapacity,
    vehicleBodyFt,
  ]);

  const goReview = () => {
    if (!validateFormForKind()) return;
    setStep("review");
  };

  const handleImportFromContacts = async () => {
    setImportError(null);
    setImportLoading(true);
    try {
      const result = await pickContactForNameAndPhone();
      if (result.ok) {
        setImportError(null);
        if (kind === "driver") {
          setDriverName(result.contact.name);
          setDriverPhone(result.contact.phone.replace(/^\+91/, "").replace(/^\+/, ""));
        } else {
          setContactName(result.contact.name);
          setPhoneDigits(result.contact.phone.replace(/^\+91/, "").replace(/^\+/, ""));
        }
      } else if (result.reason !== "cancelled") {
        setImportError(result.message ?? "Could not load contact. Please type manually.");
      }
    } finally {
      setImportLoading(false);
    }
  };

  const contactPickerAvailable = isContactPickerAvailable();

  const buildDriverPayload = (): DriverFormData => ({
    driverSource: "organization",
    name: driverName.trim(),
    phone: driverPhone.trim(),
    email: "",
    emergencyContact: "",
    emergencyName: "",
    licenseNumber: driverDl.trim().toUpperCase(),
    payableAmount: null,
    commissionPercent: null,
    commissionPerKm: null,
  });

  const confirmSave = async () => {
    if (!validateFormForKind()) {
      setStep("form");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (kind === "client") {
        const pNorm =
          normalizeIndianPhoneForMetadata(phoneDigits) ?? phoneDigits.trim();
        await onAddClient({
          organizationName: orgOrCompanyName.trim(),
          contactPerson: contactName.trim(),
          phone: pNorm,
        });
      } else if (kind === "supplier") {
        const pNorm =
          normalizeIndianPhoneForMetadata(phoneDigits) ?? phoneDigits.trim();
        await onAddSupplier({
          name: contactName.trim(),
          companyName: orgOrCompanyName.trim(),
          phone: pNorm,
        });
      } else if (kind === "driver") {
        const dp = buildDriverPayload();
        const pn = normalizeIndianPhoneForMetadata(dp.phone) ?? dp.phone.trim();
        await onAddDriver({ ...dp, phone: pn });
      } else {
        await onAddVehicle(
          vehiclePayloadFromInputs(
            vehicleReg,
            vehicleModelLine,
            vehicleCapacity,
            vehicleBodyFt,
            vehicleAxle,
          ),
        );
      }
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : "Something went wrong. Try again.";
      Alert.alert("Could not save", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const summaryLinesData = useMemo(() => {
    if (kind === "client") {
      return [
        {
          label: "Business / billing name",
          value: orgOrCompanyName.trim() || "—",
          Icon: Building2,
        },
        {
          label: "Primary contact",
          value: contactName.trim(),
          Icon: UserPlus,
          emphasis: true,
        },
        {
          label: "Phone",
          value: phoneE164Hint || phoneDigits.trim(),
          Icon: Smartphone,
        },
      ];
    }
    if (kind === "supplier") {
      return [
        {
          label: "Company",
          value: orgOrCompanyName.trim() || "—",
          Icon: Building2,
        },
        {
          label: "Contact person",
          value: contactName.trim(),
          Icon: UserPlus,
          emphasis: true,
        },
        {
          label: "Phone",
          value: phoneE164Hint || phoneDigits.trim(),
          Icon: Smartphone,
        },
      ];
    }
    if (kind === "driver") {
      return [
        {
          label: "Driver",
          value: driverName.trim(),
          Icon: UserPlus,
          emphasis: true,
        },
        { label: "Mobile", value: driverPhonePretty, Icon: Smartphone },
        {
          label: "Driving licence",
          value: driverDl.trim().toUpperCase(),
          Icon: Key,
        },
      ];
    }
    return [
      {
        label: "Registration",
        value: formatIndianVehicleNumberInput(vehicleReg).trim(),
        Icon: Verified,
        emphasis: true,
      },
      { label: "Type & model", value: vehicleModelLine.trim(), Icon: Truck },
      { label: "Load capacity", value: vehicleCapacity.trim(), Icon: Layers },
      {
        label: "Body length",
        value: `${vehicleBodyFt.trim()} ft`,
        Icon: ArrowLeftRight,
      },
      {
        label: "Axle",
        value: vehicleAxle.trim() || "—",
        Icon: RotateCcw,
      },
    ];
  }, [
    kind,
    orgOrCompanyName,
    contactName,
    phoneE164Hint,
    phoneDigits,
    driverName,
    driverPhonePretty,
    driverDl,
    vehicleReg,
    vehicleModelLine,
    vehicleCapacity,
    vehicleBodyFt,
    vehicleAxle,
  ]);

  if (!visible) return null;

  const formTitle = `New ${headline}`;

  const narrowShellMaxHeight =
    !layoutWide && viewportH > 0
      ? Math.min(viewportH * 0.94, 900)
      : undefined;
  const shellMaxWidth = layoutWide
    ? 1040
    : Math.min(560, Math.max(280, viewportW - 16));

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.overlay, !layoutWide && styles.overlayCompact]}>
        <View
          style={[
            styles.shell,
            !layoutWide && styles.shellStacked,
            !layoutWide && styles.shellNarrowWeb,
            {
              maxWidth: shellMaxWidth,
              ...(narrowShellMaxHeight != null
                ? { maxHeight: narrowShellMaxHeight }
                : {}),
            },
          ]}
        >
          {/* Sidebar — single entity only (no switching). */}
          <View
            style={[styles.sidebar, !layoutWide && styles.sidebarNarrow]}
          >
            <Pressable style={styles.backBtn} onPress={onClose} hitSlop={12}>
              <ChevronLeft size={22} color="#fff" strokeWidth={2.5} />
            </Pressable>
            <View style={styles.sideIconWrap}>
              <Cpu size={28} color="#93c5fd" strokeWidth={2} />
            </View>
            <Text style={styles.sideTitle}>Add to your business</Text>
            {step === "form" ? (
              <>
                <Text style={styles.sideSubtitle}>{sideKindSubtitle}</Text>
                <View style={styles.sideKindPillWrap}>
                  <Text style={styles.sideKindPillLabel}>Adding</Text>
                  <View style={styles.sideKindPill}>
                    <Text style={styles.sideKindPillText}>{headline}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.sideSubtitle}>
                Check the summary looks right, then tap Save.
              </Text>
            )}
          </View>

          {/* Main */}
          <ScrollView
            style={[styles.mainScroll, stackedSheetVisuals && styles.mainScrollSheet]}
            contentContainerStyle={[
              styles.mainScrollContent,
              stackedSheetVisuals && styles.mainScrollContentSheet,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!organizationId ? (
              <View style={styles.banner}>
                <FontAwesome name="warning" size={16} color="#92400e" />
                <Text style={styles.bannerText}>
                  {noOrganizationMessage ?? "No organization loaded."}
                </Text>
                {onRefreshOrganization ? (
                  <Pressable style={styles.bannerBtn} onPress={onRefreshOrganization}>
                    <Text style={styles.bannerBtnText}>Refresh</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {step === "form" ? (
              <>
                <View style={styles.formHeader}>
                  <View style={styles.liveDot} />
                  <Text style={styles.formHeaderTitle}>{formTitle}</Text>
                </View>
                <Text style={styles.formHeaderHint}>
                  Fill required fields and continue.
                </Text>
              </>
            ) : null}

            {formError ? (
              <View style={styles.errorBar}>
                <Text style={styles.errorBarText}>{formError}</Text>
              </View>
            ) : null}

            {step === "form" ? (
              <View style={styles.fieldsBlock}>
                {(kind === "client" || kind === "supplier" || kind === "driver") && (
                  <View style={styles.importContactsWrap}>
                    <Pressable
                      style={[
                        styles.importContactsBtn,
                        (!contactPickerAvailable || importLoading) && styles.importContactsBtnDim,
                      ]}
                      onPress={() => void handleImportFromContacts()}
                      disabled={importLoading}
                    >
                      {importLoading ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <BookUser
                          size={16}
                          color={contactPickerAvailable ? "#2563eb" : Theme.textMuted}
                          strokeWidth={2.2}
                        />
                      )}
                      <Text
                        style={[
                          styles.importContactsBtnText,
                          !contactPickerAvailable && styles.importContactsBtnTextMuted,
                        ]}
                      >
                        {importLoading ? "Opening contacts…" : "Import from contacts"}
                      </Text>
                    </Pressable>
                    {importError ? (
                      <Text style={styles.importContactsError}>{importError}</Text>
                    ) : !contactPickerAvailable ? (
                      <Text style={styles.importContactsHint}>
                        Open this page on your phone's Chrome browser to use contact import.
                      </Text>
                    ) : null}
                  </View>
                )}

                {(kind === "client" || kind === "supplier") && (
                  <>
                    <Field
                      label={
                        kind === "client"
                          ? "Organization / billing name"
                          : "Supplier company name"
                      }
                      optionalHint="optional"
                    >
                      <TextInput
                        style={styles.input}
                        placeholder="Example: MK Logistics Pvt Ltd"
                        placeholderTextColor={Theme.textMuted}
                        value={orgOrCompanyName}
                        onChangeText={setOrgOrCompanyName}
                        autoCapitalize="words"
                      />
                    </Field>
                    <View style={[styles.row2, layoutWide && styles.row2Web]}>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Primary contact">
                          <TextInput
                            style={styles.input}
                            placeholder="Full name"
                            placeholderTextColor={Theme.textMuted}
                            value={contactName}
                            onChangeText={setContactName}
                          />
                        </Field>
                      </View>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Phone">
                          <View style={styles.phoneOuter}>
                            <Text style={styles.phoneCc}>🇮🇳 +91</Text>
                            <TextInput
                              style={[styles.input, styles.phoneInput]}
                              placeholder="10-digit mobile"
                              placeholderTextColor={Theme.textMuted}
                              keyboardType="phone-pad"
                              maxLength={14}
                              value={phoneDigits}
                              onChangeText={(x) =>
                                setPhoneDigits(x.replace(/[^\d+]/g, ""))
                              }
                            />
                            <Smartphone
                              size={18}
                              color={Theme.textMuted}
                              style={styles.phoneIcon}
                            />
                          </View>
                        </Field>
                      </View>
                    </View>
                  </>
                )}

                {kind === "driver" && (
                  <>
                    <Field label="Driver name">
                      <View style={styles.inputIconRow}>
                        <UserPlus
                          size={18}
                          color={Theme.textMuted}
                          style={styles.inputLeadingIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.inputPadded]}
                          placeholder="Legal name"
                          placeholderTextColor={Theme.textMuted}
                          value={driverName}
                          onChangeText={setDriverName}
                        />
                      </View>
                    </Field>
                    <View style={[styles.row2, layoutWide && styles.row2Web]}>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Mobile">
                          <View style={[styles.phoneOuter, styles.inputIconRow]}>
                            <Text style={styles.phoneCc}>🇮🇳 +91</Text>
                            <TextInput
                              style={[styles.input, styles.phoneInput]}
                              keyboardType="phone-pad"
                              maxLength={14}
                              placeholder="10-digit number"
                              placeholderTextColor={Theme.textMuted}
                              value={driverPhone}
                              onChangeText={(x) =>
                                setDriverPhone(x.replace(/[^\d+]/g, ""))
                              }
                            />
                          </View>
                        </Field>
                      </View>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Driving licence No.">
                          <View style={styles.inputIconRow}>
                            <Key
                              size={18}
                              color={Theme.textMuted}
                              style={styles.inputLeadingIcon}
                            />
                            <TextInput
                              style={[styles.input, styles.inputPadded]}
                              placeholder="TN01 20200001234"
                              placeholderTextColor={Theme.textMuted}
                              autoCapitalize="characters"
                              value={driverDl}
                              onChangeText={(t) => setDriverDl(t.toUpperCase())}
                            />
                          </View>
                        </Field>
                      </View>
                    </View>
                  </>
                )}

                {kind === "vehicle" && (
                  <>
                    <Field label="Vehicle number">
                      <View style={styles.inputIconRow}>
                        <Verified
                          size={18}
                          color={Theme.textMuted}
                          style={styles.inputLeadingIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.inputPadded]}
                          placeholder="TN 01 CM 2026"
                          placeholderTextColor={Theme.textMuted}
                          autoCapitalize="characters"
                          value={vehicleReg}
                          onChangeText={(t) =>
                            setVehicleReg(formatIndianVehicleNumberInput(t))
                          }
                        />
                      </View>
                    </Field>
                    <Field label="Type & model">
                      <View style={styles.inputIconRow}>
                        <Truck
                          size={18}
                          color={Theme.textMuted}
                          style={styles.inputLeadingIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.inputPadded]}
                          placeholder="Example: BharatBenz 3523R"
                          placeholderTextColor={Theme.textMuted}
                          value={vehicleModelLine}
                          onChangeText={setVehicleModelLine}
                        />
                      </View>
                    </Field>
                    <View style={[styles.row2, layoutWide && styles.row2Web]}>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Load capacity">
                          <View style={styles.inputIconRow}>
                            <Layers
                              size={18}
                              color={Theme.textMuted}
                              style={styles.inputLeadingIcon}
                            />
                            <TextInput
                              style={[styles.input, styles.inputPadded]}
                              placeholder="e.g. 20 tons"
                              placeholderTextColor={Theme.textMuted}
                              value={vehicleCapacity}
                              onChangeText={setVehicleCapacity}
                            />
                          </View>
                        </Field>
                      </View>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Body length (ft)">
                          <TextInput
                            style={styles.input}
                            placeholder="32"
                            placeholderTextColor={Theme.textMuted}
                            keyboardType="number-pad"
                            value={vehicleBodyFt}
                            onChangeText={setVehicleBodyFt}
                          />
                        </Field>
                      </View>
                    </View>
                    <Field label="Axle configuration" optionalHint="optional">
                      <View style={styles.inputIconRow}>
                        <RotateCcw
                          size={18}
                          color={Theme.textMuted}
                          style={styles.inputLeadingIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.inputPadded]}
                          placeholder="e.g. 6×4"
                          placeholderTextColor={Theme.textMuted}
                          value={vehicleAxle}
                          onChangeText={setVehicleAxle}
                        />
                      </View>
                    </Field>
                  </>
                )}
              </View>
            ) : (
              <View
                style={[
                  styles.summarySheet,
                  layoutWide && styles.summarySheetDesktop,
                ]}
              >
                <View style={styles.summaryDetailsCard}>
                  <Text style={styles.summaryDetailsHeading}>Details</Text>
                  {summaryLinesData.map((line, idx) => (
                    <SummaryDetailRow
                      key={`${line.label}-${idx}`}
                      label={line.label}
                      value={line.value}
                      Icon={line.Icon}
                      emphasized={!!line.emphasis}
                      isLast={false}
                    />
                  ))}
                  <SummaryDetailRow
                    label="Ready to save"
                    value={READY_TO_SAVE_SUMMARY_COPY}
                    Icon={ShieldCheck}
                    emphasized
                    isLast
                    iconColor="#1d4ed8"
                    valueMaxLines={12}
                    valueProse
                  />
                </View>
              </View>
            )}

            {step === "form" ? (
              <Pressable
                style={[
                  styles.primaryBtn,
                  !organizationId && styles.primaryBtnDisabled,
                ]}
                onPress={goReview}
                disabled={!organizationId}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <ArrowRight size={22} color="#fff" strokeWidth={2.5} />
              </Pressable>
            ) : (
              <View style={[styles.reviewActionsBar, layoutWide && styles.reviewActionsBarWide]}>
                <Pressable
                  style={styles.reviewGhostBtnWide}
                  onPress={() => setStep("form")}
                  hitSlop={8}
                >
                  <Text style={styles.ghostBtnText}>← Edit details</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmBtn,
                    styles.confirmBtnFlexible,
                    (!organizationId || submitting) &&
                      styles.primaryBtnDisabled,
                  ]}
                  onPress={() => void confirmSave()}
                  disabled={!organizationId || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Check size={22} color="#fff" strokeWidth={2.8} />
                      <Text style={styles.confirmBtnText}>Save</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field(props: {
  label: string;
  optionalHint?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        {props.optionalHint ? (
          <Text style={styles.optionalPill}>{props.optionalHint}</Text>
        ) : null}
      </View>
      {props.children}
    </View>
  );
}

function SummaryDetailRow({
  label,
  value,
  Icon,
  emphasized,
  isLast,
  iconColor,
  valueMaxLines = 4,
  valueProse,
}: {
  label: string;
  value: string;
  Icon: SummaryIcon;
  emphasized?: boolean;
  isLast?: boolean;
  iconColor?: string;
  valueMaxLines?: number;
  /** Long explanatory copy: same row chrome, readable body text (not headline-sized). */
  valueProse?: boolean;
}) {
  const display = value?.trim() || "—";
  return (
    <View
      style={[
        styles.summaryDetailRow,
        emphasized && styles.summaryDetailRowEmphasis,
        isLast && styles.summaryDetailRowLast,
      ]}
    >
      <View style={styles.summaryDetailAccent} />
      <View style={styles.summaryDetailIconBubble}>
        <Icon size={18} color={iconColor ?? "#334155"} strokeWidth={2.2} />
      </View>
      <View style={styles.summaryDetailCopy}>
        <Text style={styles.summaryDetailLabel}>{label}</Text>
        <Text
          style={[
            styles.summaryDetailValue,
            !valueProse && emphasized && styles.summaryDetailValueEmphasis,
            valueProse && styles.summaryDetailValueProse,
          ]}
          numberOfLines={valueMaxLines}
        >
          {display}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.94)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    ...(Platform.OS === "web" ? ({ overflow: "auto" as const } satisfies object) : null),
  },
  overlayCompact: {
    padding: 12,
    justifyContent: "flex-start",
    paddingTop: 16,
    alignItems: "stretch",
  },
  shell: {
    flexDirection: "row",
    width: "100%",
    maxHeight: 760,
    minHeight: 480,
    backgroundColor: "#fff",
    borderRadius: 40,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 40px 120px rgba(0,0,0,0.35)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 24 },
          shadowOpacity: 0.35,
          shadowRadius: 40,
          elevation: 12,
        }),
  },
  shellStacked: {
    flexDirection: "column",
    maxHeight: 900,
  },
  /** Narrow / mobile web: avoid forcing tall min-height so the card fits the viewport. */
  shellNarrowWeb: {
    minHeight: 0,
    alignSelf: "center",
  },
  sidebar: {
    width: 300,
    backgroundColor: "#0f172a",
    padding: 26,
    paddingTop: 24,
    justifyContent: "flex-start",
  },
  /** Stacked (narrow web / mobile web): dark band + sheet below — no horizontal wrap. */
  sidebarNarrow: {
    width: "100%",
    paddingVertical: 18,
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  sideIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(59,130,246,0.22)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  sideTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  sideSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(248,250,252,0.62)",
    lineHeight: 17,
    marginBottom: 18,
  },
  sideKindPillWrap: {
    marginTop: 4,
  },
  sideKindPillLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(248,250,252,0.45)",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sideKindPill: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  sideKindPillText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  mainScroll: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#f8fafc",
  },
  mainScrollSheet: {
    marginTop: -8,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 -12px 40px rgba(15, 23, 42, 0.08)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.07,
        shadowRadius: 20,
        elevation: 8,
      },
    }),
  },
  mainScrollContent: {
    padding: 28,
    paddingBottom: 40,
    flexGrow: 1,
  },
  mainScrollContentSheet: {
    paddingTop: 24,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fef3c7",
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fcd34d",
    flexWrap: "wrap",
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#78350f",
    minWidth: 200,
  },
  bannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#0f172a",
  },
  bannerBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  formHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  formHeaderHint: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
    marginBottom: 18,
    lineHeight: 18,
  },
  errorBar: {
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorBarText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b91c1c",
  },
  fieldsBlock: {
    marginBottom: 8,
  },
  row2: {
    marginBottom: 0,
  },
  row2Web: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  row2Grow: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  optionalPill: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: "500",
    color: "#0f172a",
    backgroundColor: "#fff",
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
      default: {},
    }),
  },
  inputIconRow: {
    position: "relative",
  },
  inputLeadingIcon: {
    position: "absolute",
    left: 14,
    top: 15,
    zIndex: 1,
  },
  inputPadded: {
    paddingLeft: 42,
  },
  phoneOuter: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    backgroundColor: "#fff",
    paddingLeft: 12,
    paddingRight: 8,
    gap: 8,
    minHeight: 50,
    position: "relative",
  },
  phoneCc: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  phoneInput: {
    flex: 1,
    borderWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  phoneIcon: {
    marginRight: 8,
  },
  primaryBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#0f172a",
    paddingVertical: 18,
    borderRadius: 22,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  ghostBtn: {
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  ghostBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.buttonPrimary,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 18,
    borderRadius: 22,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  confirmBtnFlexible: {
    flex: 1,
    minHeight: 52,
    ...Platform.select({
      web: { maxWidth: 280 } as object,
      default: {},
    }),
  },
  reviewActionsBar: {
    flexDirection: "column",
    gap: 12,
    marginTop: 20,
    paddingTop: 4,
  },
  reviewActionsBarWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  reviewGhostBtnWide: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },

  summarySheet: {
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow:
          "0 2px 8px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.06)",
      } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 6,
      },
    }),
  },
  summarySheetDesktop: {
    alignSelf: "center",
    maxWidth: 560,
  },

  summaryDetailsCard: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: "#f8fafc",
    gap: 0,
  },
  summaryDetailsHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 14,
  },

  summaryDetailRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eef2f7",
    marginBottom: 10,
    overflow: "hidden",
  },
  summaryDetailRowLast: {
    marginBottom: 4,
  },
  summaryDetailRowEmphasis: {
    borderColor: "#cbd5f5",
    ...Platform.select({
      web: { backgroundColor: "#fafbff" } as object,
      default: { backgroundColor: "#fafbff" },
    }),
  },
  summaryDetailAccent: {
    width: 4,
    backgroundColor: "#3b82f6",
  },
  summaryDetailIconBubble: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderRightWidth: 1,
    borderRightColor: "#f1f5f9",
  },
  summaryDetailCopy: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: 0,
  },
  summaryDetailLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  summaryDetailValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  summaryDetailValueEmphasis: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#0f172a",
  },
  summaryDetailValueProse: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 20,
    color: "#334155",
  },

  importContactsWrap: {
    marginBottom: 16,
    alignSelf: "stretch",
  },
  importContactsError: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b91c1c",
    marginTop: 8,
    lineHeight: 17,
  },
  importContactsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    minWidth: 180,
  },
  importContactsBtnDim: {
    opacity: 0.55,
  },
  importContactsBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
  importContactsBtnTextMuted: {
    color: Theme.textMuted,
    fontWeight: "500",
  },
  importContactsHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 6,
    marginLeft: 2,
    lineHeight: 16,
  },
});
