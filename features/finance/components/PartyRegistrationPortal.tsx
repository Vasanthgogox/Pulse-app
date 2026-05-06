/**
 * Desktop-only fullscreen party addition flow (Finance). Native: no-op.
 * Two steps: fill form → review and confirm → calls Finance entity handlers.
 */
import Theme from "@/constants/Theme";
import type {
  AddClientFormData,
  ConnectionInviteeMatch,
} from "@/features/clients/components/AddClientModal";
import type { DriverFormData } from "@/features/drivers/components/AddDriverModal";
import {
  searchExistingDriversByPhone,
  type ExistingDriverMatch,
} from "@/features/drivers/services/drivers.service";
import type { SupplierFormData } from "@/features/suppliers/components/AddSupplierModal";
import type { AddVehicleCompletePayload } from "@/features/vehicles/components/AddVehicleModal";
import {
  getAxleRecommendations,
  getCapacityRecommendations,
} from "@/features/vehicles/utils/indianTruckData.util";
import {
  BODY_LENGTH_SELECT_OPTIONS,
  OTHER_LABEL,
  VEHICLE_CATEGORY_LABELS,
  getModelSelectOptions,
  normalizeBodyLengthKey,
} from "@/features/vehicles/utils/vehicleFormOptions.util";
import { showAppAlert } from "@/lib/appAlert";
import { validateEmail } from "@/lib/emailValidation";
import { formatIndianVehicleNumberInput, formatMobileNumber } from "@/lib/format";
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
  Mail,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Truck,
  UserPlus,
  Verified,
} from "lucide-react-native";
import { isContactPickerAvailable, pickContactForNameAndPhone } from "@/lib/contactPicker";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  inviteeProfileIsDriver,
  inviteeSuggestedCompanyName,
} from "@/services/connectionRequestsService";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  /**
   * When set with `onSendInvitation`, debounced phone lookup (same as AddClientModal)
   * auto-fills contact / org from platform data and enables connection invite for customer flow.
   */
  searchInviteeByPhone?: (
    phone: string,
  ) => Promise<ConnectionInviteeMatch | null>;
  /** Called from review step when a non-driver platform match exists (instead of offline create). */
  onSendInvitation?: (toOrgId: string) => Promise<void>;
  /**
   * Same as client invite, for supplier: `createConnectionRequest` with carrier flag.
   * When set with `searchInviteeByPhone`, enables debounced lookup + invite on the supplier form.
   */
  onSendSupplierInvitation?: (toOrgId: string) => Promise<void>;
  /**
   * When set, debounced phone lookup + review “Send invitation” path (AddDriverModal parity).
   * If no app account match, review still saves via `onAddDriver`.
   */
  onInviteDriver?: (data: DriverFormData) => Promise<void>;
}

const DL_CLEAN = /[\s-]/g;

/** Stacked layout uses full width below 720px; sheet rounding/shadow only below this for nicer tablet-stacked. */
const PARTY_PORTAL_STACKED_SHEET_MAX_WIDTH = 640;
const DL_FORMAT = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/;

const MIN_PHONE_LENGTH_FOR_SEARCH = 8;
const PHONE_DEBOUNCE_MS = 400;
const CLIENT_DRAFT_STORAGE_KEY = "party-registration-client-draft-v1";
const SUPPLIER_DRAFT_STORAGE_KEY = "party-registration-supplier-draft-v1";
const DRIVER_DRAFT_STORAGE_KEY = "party-registration-driver-draft-v1";
const VEHICLE_DRAFT_STORAGE_KEY = "party-registration-vehicle-draft-v1";

const READY_TO_SAVE_SUMMARY_COPY =
  "Saved records stay private to your current organization — Finance, trips, and assignments will pick them up automatically.";

interface DriverDraftStorage {
  organizationId: string | null;
  name: string;
  phone: string;
  license: string;
  email: string;
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
  preferOfflineOnly: boolean;
}

interface PartyContactDraftStorage {
  organizationId: string | null;
  organizationName: string;
  contactName: string;
  phoneDigits: string;
}

interface VehicleDraftStorage {
  organizationId: string | null;
  registration: string;
  category: string;
  model: string;
  modelIsOther: boolean;
  capacity: string;
  bodyLength: string;
  bodyLengthIsOther: boolean;
  axle: string;
}

function readDraft<T>(storageKey: string): T | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeDraft<T>(storageKey: string, draft: T) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Ignore storage write failures (quota/private mode).
  }
}

function clearDraft(storageKey: string) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage clear failures.
  }
}

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
  vehicleCategory: string,
  model: string,
  capacity: string,
  bodyLength: string,
  axle: string,
): AddVehicleCompletePayload {
  const vehicleNumber = formatIndianVehicleNumberInput(reg).trim();
  const typeSummary =
    [vehicleCategory, model].filter((s) => s?.trim()).join(" • ").trim() ||
    [model.trim(), capacity.trim()].filter(Boolean).join(" · ") ||
    "Other";
  return {
    vehicleSource: "organization",
    vehicleNumber,
    vehicleType: typeSummary,
    capacity: capacity.trim(),
    vehicleBrand: vehicleCategory.trim() || null,
    vehicleModel: model.trim() || null,
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
    searchInviteeByPhone,
    onSendInvitation,
    onSendSupplierInvitation,
    onInviteDriver,
    layoutWide,
  } = props;

  const { t } = useLanguage();
  const [kind, setKind] = useState<PartyRegistrationKind>(initialKind);
  const [step, setStep] = useState<"form" | "review">("form");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [inviteeMatch, setInviteeMatch] =
    useState<ConnectionInviteeMatch | null>(null);
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false);
  const [searchedNoResult, setSearchedNoResult] = useState(false);
  const [driverRegisteredAtPhone, setDriverRegisteredAtPhone] = useState(false);
  const phoneLookupSearchIdRef = useRef(0);
  const { width: viewportW, height: viewportH } = useWindowDimensions();

  const hasClientInviteSearch =
    kind === "client" &&
    Boolean(searchInviteeByPhone && onSendInvitation);
  const hasSupplierInviteSearch =
    kind === "supplier" &&
    Boolean(searchInviteeByPhone && onSendSupplierInvitation);
  const showPhoneInviteeUi = hasClientInviteSearch || hasSupplierInviteSearch;
  const inviteeIsDriver = inviteeProfileIsDriver(inviteeMatch?.profile_role);

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
  const [driverExistingMatches, setDriverExistingMatches] = useState<
    ExistingDriverMatch[]
  >([]);
  const [driverPhoneLookupLoading, setDriverPhoneLookupLoading] =
    useState(false);
  const [driverPhoneLookupError, setDriverPhoneLookupError] = useState<
    string | null
  >(null);
  const driverPhoneLookupIdRef = useRef(0);
  const [driverEmail, setDriverEmail] = useState("");
  const [driverPayableAmount, setDriverPayableAmount] = useState<number | null>(
    null,
  );
  const [driverCommissionPercent, setDriverCommissionPercent] = useState<
    number | null
  >(null);
  const [driverCommissionPerKm, setDriverCommissionPerKm] = useState<
    number | null
  >(null);
  /** When true, Save creates a fleet driver row via `onAddDriver` instead of sending an in-app invite. */
  const [driverPreferOfflineOnly, setDriverPreferOfflineOnly] = useState(false);

  // Vehicle — aligned with AddVehicleModal (category chips + preset pickers + specs)
  const [vehicleReg, setVehicleReg] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [modelIsOther, setModelIsOther] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [vehicleCapacity, setVehicleCapacity] = useState("");
  const [vehicleBodyFt, setVehicleBodyFt] = useState("");
  const [bodyLengthIsOther, setBodyLengthIsOther] = useState(false);
  const [bodyLengthPickerOpen, setBodyLengthPickerOpen] = useState(false);
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
    setDriverEmail("");
    setDriverPayableAmount(null);
    setDriverCommissionPercent(null);
    setDriverCommissionPerKm(null);
    setDriverPreferOfflineOnly(false);
    setDriverExistingMatches([]);
    setDriverPhoneLookupLoading(false);
    setDriverPhoneLookupError(null);
    setVehicleReg("");
    setVehicleCategory("");
    setVehicleModel("");
    setModelIsOther(false);
    setModelPickerOpen(false);
    setVehicleCapacity("");
    setVehicleBodyFt("");
    setBodyLengthIsOther(false);
    setBodyLengthPickerOpen(false);
    setVehicleAxle("");
    setInviteeMatch(null);
    setPhoneSearchLoading(false);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    if (initialKind === "client") {
      const draft = readDraft<PartyContactDraftStorage>(CLIENT_DRAFT_STORAGE_KEY);
      if (draft && draft.organizationId === (organizationId ?? null)) {
        setOrgOrCompanyName(draft.organizationName);
        setContactName(draft.contactName);
        setPhoneDigits(draft.phoneDigits);
      }
    } else if (initialKind === "supplier") {
      const draft = readDraft<PartyContactDraftStorage>(SUPPLIER_DRAFT_STORAGE_KEY);
      if (draft && draft.organizationId === (organizationId ?? null)) {
        setOrgOrCompanyName(draft.organizationName);
        setContactName(draft.contactName);
        setPhoneDigits(draft.phoneDigits);
      }
    } else if (initialKind === "driver") {
      const draft = readDraft<DriverDraftStorage>(DRIVER_DRAFT_STORAGE_KEY);
      if (draft && draft.organizationId === (organizationId ?? null)) {
        setDriverName(draft.name);
        setDriverPhone(draft.phone);
        setDriverDl(draft.license);
        setDriverEmail(draft.email);
        setDriverPayableAmount(draft.payableAmount);
        setDriverCommissionPercent(draft.commissionPercent);
        setDriverCommissionPerKm(draft.commissionPerKm);
        setDriverPreferOfflineOnly(draft.preferOfflineOnly);
      }
    } else {
      const draft = readDraft<VehicleDraftStorage>(VEHICLE_DRAFT_STORAGE_KEY);
      if (draft && draft.organizationId === (organizationId ?? null)) {
        setVehicleReg(draft.registration);
        setVehicleCategory(draft.category);
        setVehicleModel(draft.model);
        setModelIsOther(draft.modelIsOther);
        setVehicleCapacity(draft.capacity);
        setVehicleBodyFt(draft.bodyLength);
        setBodyLengthIsOther(draft.bodyLengthIsOther);
        setVehicleAxle(draft.axle);
      }
    }
  }, [visible, initialKind, organizationId]);

  useEffect(() => {
    if (!visible || kind !== "client") return;
    writeDraft(CLIENT_DRAFT_STORAGE_KEY, {
      organizationId: organizationId ?? null,
      organizationName: orgOrCompanyName,
      contactName,
      phoneDigits,
    } satisfies PartyContactDraftStorage);
  }, [
    visible,
    kind,
    organizationId,
    orgOrCompanyName,
    contactName,
    phoneDigits,
  ]);

  useEffect(() => {
    if (!visible || kind !== "supplier") return;
    writeDraft(SUPPLIER_DRAFT_STORAGE_KEY, {
      organizationId: organizationId ?? null,
      organizationName: orgOrCompanyName,
      contactName,
      phoneDigits,
    } satisfies PartyContactDraftStorage);
  }, [
    visible,
    kind,
    organizationId,
    orgOrCompanyName,
    contactName,
    phoneDigits,
  ]);

  useEffect(() => {
    if (!visible || kind !== "driver") return;
    writeDraft(DRIVER_DRAFT_STORAGE_KEY, {
      organizationId: organizationId ?? null,
      name: driverName,
      phone: driverPhone,
      license: driverDl,
      email: driverEmail,
      payableAmount: driverPayableAmount,
      commissionPercent: driverCommissionPercent,
      commissionPerKm: driverCommissionPerKm,
      preferOfflineOnly: driverPreferOfflineOnly,
    });
  }, [
    visible,
    kind,
    organizationId,
    driverName,
    driverPhone,
    driverDl,
    driverEmail,
    driverPayableAmount,
    driverCommissionPercent,
    driverCommissionPerKm,
    driverPreferOfflineOnly,
  ]);

  useEffect(() => {
    if (!visible || kind !== "vehicle") return;
    writeDraft(VEHICLE_DRAFT_STORAGE_KEY, {
      organizationId: organizationId ?? null,
      registration: vehicleReg,
      category: vehicleCategory,
      model: vehicleModel,
      modelIsOther,
      capacity: vehicleCapacity,
      bodyLength: vehicleBodyFt,
      bodyLengthIsOther,
      axle: vehicleAxle,
    } satisfies VehicleDraftStorage);
  }, [
    visible,
    kind,
    organizationId,
    vehicleReg,
    vehicleCategory,
    vehicleModel,
    modelIsOther,
    vehicleCapacity,
    vehicleBodyFt,
    bodyLengthIsOther,
    vehicleAxle,
  ]);

  // Add Client / Supplier — debounced phone lookup (AddClientModal / AddSupplierModal parity).
  useEffect(() => {
    if (!visible) return;
    if (kind === "client") {
      if (!searchInviteeByPhone || !onSendInvitation) return;
    } else if (kind === "supplier") {
      if (!searchInviteeByPhone || !onSendSupplierInvitation) return;
    } else {
      return;
    }
    const normalized = phoneDigits.trim().replace(/\s+/g, "");
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setPhoneSearchLoading(false);
      return;
    }
    const id = ++phoneLookupSearchIdRef.current;
    setPhoneSearchLoading(true);
    const timer = setTimeout(() => {
      searchInviteeByPhone(normalized).then((result) => {
        if (phoneLookupSearchIdRef.current !== id) return;
        setPhoneSearchLoading(false);
        setInviteeMatch(result ?? null);
        setSearchedNoResult(!result);
        setDriverRegisteredAtPhone(
          Boolean(result && inviteeProfileIsDriver(result.profile_role)),
        );
        if (result) {
          setContactName((prev) => (prev.trim() ? prev : result.full_name));
          const suggested = inviteeSuggestedCompanyName(result);
          if (suggested) {
            setOrgOrCompanyName((prev) => (prev.trim() ? prev : suggested));
          }
        }
      });
    }, PHONE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    visible,
    kind,
    phoneDigits,
    searchInviteeByPhone,
    onSendInvitation,
    onSendSupplierInvitation,
  ]);

  // Add Driver (web) — debounced lookup for in-app invite when `onInviteDriver` is provided.
  useEffect(() => {
    if (!visible || kind !== "driver" || !onInviteDriver) return;
    const normalized = driverPhone.trim().replace(/\s+/g, "");
    setDriverExistingMatches([]);
    setDriverPhoneLookupError(null);
    if (normalized.length < MIN_PHONE_LENGTH_FOR_SEARCH) {
      setDriverPhoneLookupLoading(false);
      return;
    }
    const id = ++driverPhoneLookupIdRef.current;
    setDriverPhoneLookupLoading(true);
    const timer = setTimeout(() => {
      searchExistingDriversByPhone(normalized).then(({ error: err, matches }) => {
        if (driverPhoneLookupIdRef.current !== id) return;
        setDriverPhoneLookupLoading(false);
        setDriverPhoneLookupError(err?.message ?? null);
        setDriverExistingMatches(matches);
        if (matches.length === 1) {
          const one = matches[0];
          setDriverName((prev) => (prev.trim() ? prev : one.full_name));
          const dlFromRpc = one.license_number?.trim();
          if (dlFromRpc) {
            setDriverDl((prev) => (prev.trim() ? prev : dlFromRpc.toUpperCase()));
          }
          const em = one.email?.trim();
          if (em) {
            setDriverEmail((prev) => (prev.trim() ? prev : em));
          }
        }
      });
    }, PHONE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [visible, kind, driverPhone, onInviteDriver]);

  const handleDriverPhoneLookupChange = (text: string) => {
    setDriverPhone(formatMobileNumber(text));
    setDriverExistingMatches([]);
    setDriverPhoneLookupError(null);
    setDriverPreferOfflineOnly(false);
  };

  const handleAddDriverOfflineInstead = () => {
    setDriverPreferOfflineOnly(true);
  };

  const insets = useSafeAreaInsets();
  const axleRecommendations = useMemo(
    () => getAxleRecommendations(vehicleAxle).slice(0, 8),
    [vehicleAxle],
  );
  const capacityRecommendations = useMemo(
    () => getCapacityRecommendations(vehicleCapacity).slice(0, 6),
    [vehicleCapacity],
  );

  const renderPortalSpecHint = (items: string[], currentValue: string) => {
    const display = items
      .filter(
        (item) =>
          item.trim().toLowerCase() !== currentValue.trim().toLowerCase(),
      )
      .slice(0, 5);
    if (display.length === 0) return null;
    return (
      <Text style={styles.specHintText}>
        Suggested: {display.join(", ")}
      </Text>
    );
  };

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
      if (kind === "client" && driverRegisteredAtPhone) {
        setFormError(t("errorDriverCannotAddAsClient"));
        return false;
      }
      if (kind === "supplier" && driverRegisteredAtPhone) {
        setFormError(t("errorDriverCannotAddAsSupplier"));
        return false;
      }
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
      if (
        onInviteDriver &&
        driverExistingMatches.some((m) => m.is_in_fleet === true)
      ) {
        setFormError(t("existingDriverInFleetDetail"));
        return false;
      }
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
      const emailTrim = driverEmail.trim();
      if (emailTrim) {
        const eErr = validateEmail(emailTrim);
        if (eErr) {
          setFormError(eErr);
          return false;
        }
      }
      return true;
    }
    const regErr = validateIndianVehicleNumber(vehicleReg);
    if (regErr) {
      setFormError(regErr);
      return false;
    }
    if (
      !vehicleCategory.trim() ||
      !vehicleModel.trim() ||
      !vehicleCapacity.trim() ||
      !vehicleBodyFt.trim()
    ) {
      setFormError(
        "Select vehicle category, type & model, load capacity, and body length (use the lists or type manually).",
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
    vehicleCategory,
    vehicleModel,
    vehicleCapacity,
    vehicleBodyFt,
    driverRegisteredAtPhone,
    driverExistingMatches,
    driverEmail,
    onInviteDriver,
    t,
  ]);

  const handlePhoneLookupChange = (text: string) => {
    const hadInviteeMatch = inviteeMatch != null;
    setPhoneDigits(formatMobileNumber(text));
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
    if (hadInviteeMatch) {
      setContactName("");
      setOrgOrCompanyName("");
    }
  };

  const handleAddAsOfflineInstead = () => {
    setInviteeMatch(null);
    setSearchedNoResult(false);
    setDriverRegisteredAtPhone(false);
  };

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
          setDriverPhone(
            formatMobileNumber(
              result.contact.phone.replace(/^\+91/, "").replace(/^\+/, ""),
            ),
          );
          setDriverExistingMatches([]);
          setDriverPhoneLookupError(null);
        } else {
          setContactName(result.contact.name);
          setPhoneDigits(result.contact.phone.replace(/^\+91/, "").replace(/^\+/, ""));
          if (kind === "client" || kind === "supplier") {
            setInviteeMatch(null);
            setSearchedNoResult(false);
            setDriverRegisteredAtPhone(false);
          }
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
    email: driverEmail.trim(),
    emergencyContact: "",
    emergencyName: "",
    licenseNumber: driverDl.trim().toUpperCase(),
    payableAmount: driverPayableAmount,
    commissionPercent: driverCommissionPercent,
    commissionPerKm: driverCommissionPerKm,
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
        const inviteeIsDrv = inviteeProfileIsDriver(inviteeMatch?.profile_role);
        if (inviteeMatch && onSendInvitation && !inviteeIsDrv) {
          await onSendInvitation(inviteeMatch.organization_id);
          clearDraft(CLIENT_DRAFT_STORAGE_KEY);
          onClose();
          return;
        }
        await onAddClient({
          organizationName: orgOrCompanyName.trim(),
          contactPerson: contactName.trim(),
          phone: pNorm,
        });
        clearDraft(CLIENT_DRAFT_STORAGE_KEY);
      } else if (kind === "supplier") {
        const pNorm =
          normalizeIndianPhoneForMetadata(phoneDigits) ?? phoneDigits.trim();
        const inviteeIsDrv = inviteeProfileIsDriver(inviteeMatch?.profile_role);
        if (inviteeMatch && onSendSupplierInvitation && !inviteeIsDrv) {
          await onSendSupplierInvitation(inviteeMatch.organization_id);
          clearDraft(SUPPLIER_DRAFT_STORAGE_KEY);
          onClose();
          return;
        }
        await onAddSupplier({
          name: contactName.trim(),
          companyName: orgOrCompanyName.trim(),
          phone: pNorm,
        });
        clearDraft(SUPPLIER_DRAFT_STORAGE_KEY);
      } else if (kind === "driver") {
        const dp = buildDriverPayload();
        const pn = normalizeIndianPhoneForMetadata(dp.phone) ?? dp.phone.trim();
        const payload = { ...dp, phone: pn };
        if (
          onInviteDriver &&
          driverExistingMatches.length > 0 &&
          !driverPreferOfflineOnly
        ) {
          await onInviteDriver(payload);
          clearDraft(DRIVER_DRAFT_STORAGE_KEY);
          onClose();
          return;
        }
        await onAddDriver(payload);
        clearDraft(DRIVER_DRAFT_STORAGE_KEY);
      } else {
        await onAddVehicle(
          vehiclePayloadFromInputs(
            vehicleReg,
            vehicleCategory,
            vehicleModel,
            vehicleCapacity,
            vehicleBodyFt,
            vehicleAxle,
          ),
        );
        clearDraft(VEHICLE_DRAFT_STORAGE_KEY);
      }
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : "Something went wrong. Try again.";
      showAppAlert("Could not save", msg);
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
      const lines: {
        label: string;
        value: string;
        Icon: SummaryIcon;
        emphasis?: boolean;
      }[] = [
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
      if (driverEmail.trim()) {
        lines.push({
          label: "Email",
          value: driverEmail.trim(),
          Icon: Mail,
        });
      }
      const offerBits: string[] = [];
      if (driverPayableAmount != null && driverPayableAmount > 0) {
        offerBits.push(
          `Fixed ₹${driverPayableAmount.toLocaleString("en-IN")}`,
        );
      }
      if (driverCommissionPercent != null && driverCommissionPercent > 0) {
        offerBits.push(`${driverCommissionPercent}% commission`);
      }
      if (driverCommissionPerKm != null && driverCommissionPerKm > 0) {
        offerBits.push(`₹${driverCommissionPerKm}/km`);
      }
      if (offerBits.length > 0) {
        lines.push({
          label: "Compensation",
          value: offerBits.join(" · "),
          Icon: BookUser,
        });
      }
      return lines;
    }
    return [
      {
        label: "Registration",
        value: formatIndianVehicleNumberInput(vehicleReg).trim(),
        Icon: Verified,
        emphasis: true,
      },
      {
        label: "Category & model",
        value: [vehicleCategory.trim(), vehicleModel.trim()]
          .filter(Boolean)
          .join(" · "),
        Icon: Truck,
      },
      { label: "Load capacity", value: vehicleCapacity.trim(), Icon: Layers },
      {
        label: "Body length",
        value: vehicleBodyFt.trim() || "—",
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
    driverEmail,
    driverPayableAmount,
    driverCommissionPercent,
    driverCommissionPerKm,
    vehicleReg,
    vehicleCategory,
    vehicleModel,
    vehicleCapacity,
    vehicleBodyFt,
    vehicleAxle,
  ]);

  if (!visible) return null;

  const formTitle = `New ${headline}`;

  const reviewDriverInvite =
    kind === "driver" &&
    Boolean(onInviteDriver) &&
    driverExistingMatches.length > 0 &&
    !driverPreferOfflineOnly;

  const reviewSaveLabel =
    inviteeMatch &&
    !inviteeIsDriver &&
    ((kind === "client" && onSendInvitation) ||
      (kind === "supplier" && onSendSupplierInvitation))
      ? t("sendInvitation")
      : reviewDriverInvite
        ? t("sendInvitation")
        : "Save";

  const narrowShellMaxHeight =
    !layoutWide && viewportH > 0
      ? Math.min(viewportH * 0.94, 900)
      : undefined;
  const shellMaxWidth = layoutWide
    ? 1040
    : Math.min(560, Math.max(280, viewportW - 16));

  return (
    <>
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
            <Pressable style={styles.backBtn} onPress={onClose} hitSlop={12} testID="party-close-btn">
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
              <View style={styles.errorBar} testID="party-form-error">
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
                        placeholder="e.g. abc company"
                        placeholderTextColor={Theme.textMuted}
                        value={orgOrCompanyName}
                        onChangeText={setOrgOrCompanyName}
                        autoCapitalize="words"
                        testID="party-org-name-input"
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
                            testID="party-contact-name-input"
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
                              maxLength={
                                kind === "client" || kind === "supplier"
                                  ? 10
                                  : 14
                              }
                              value={phoneDigits}
                              onChangeText={
                                kind === "client" || kind === "supplier"
                                  ? handlePhoneLookupChange
                                  : (x) =>
                                      setPhoneDigits(x.replace(/[^\d+]/g, ""))
                              }
                              testID="party-phone-input"
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
                    {showPhoneInviteeUi ? (
                      <>
                        <Text style={styles.clientPhoneLookupHint}>
                          Search by number to find someone on the platform and invite
                          their organization.
                        </Text>
                        {phoneDigits.trim().replace(/\s+/g, "").length >=
                          MIN_PHONE_LENGTH_FOR_SEARCH && phoneSearchLoading ? (
                          <View style={styles.clientLookupLoadingRow}>
                            <ActivityIndicator size="small" color="#2563eb" />
                            <Text style={styles.clientLookupLoadingText}>
                              Looking up…
                            </Text>
                          </View>
                        ) : null}
                        {inviteeMatch ? (
                          <View style={styles.clientInviteeCard}>
                            <Text style={styles.clientInviteeLabel}>
                              {inviteeIsDriver
                                ? t("inviteeRegisteredDriver")
                                : t("inviteeFoundOnPlatform")}
                            </Text>
                            <Text style={styles.clientInviteeName}>
                              {inviteeMatch.full_name || inviteeMatch.phone}
                            </Text>
                            <Text style={styles.clientInviteeHint}>
                              {inviteeIsDriver
                                ? kind === "supplier"
                                  ? t("addSupplierInviteeHintDriver")
                                  : t("addClientInviteeHintDriver")
                                : kind === "supplier"
                                  ? t("addSupplierInviteeHintDefault")
                                  : t("addClientInviteeHintDefault")}
                            </Text>
                            {!inviteeIsDriver ? (
                              <Pressable
                                onPress={handleAddAsOfflineInstead}
                                disabled={submitting}
                                style={styles.clientOfflineLink}
                                testID="party-add-offline-btn"
                              >
                                <Text style={styles.clientOfflineLinkText}>
                                  Add as offline instead
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : searchedNoResult ? (
                          <Text style={styles.clientNoMatchHint}>
                            No account with this number. Add as offline below.
                          </Text>
                        ) : null}
                      </>
                    ) : null}
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
                          testID="party-driver-name-input"
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
                              maxLength={onInviteDriver ? 10 : 14}
                              placeholder="10-digit number"
                              placeholderTextColor={Theme.textMuted}
                              value={driverPhone}
                              onChangeText={
                                onInviteDriver
                                  ? handleDriverPhoneLookupChange
                                  : (x) =>
                                      setDriverPhone(x.replace(/[^\d+]/g, ""))
                              }
                              testID="party-driver-phone-input"
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
                              testID="party-driver-dl-input"
                            />
                          </View>
                        </Field>
                      </View>
                    </View>
                    <Field label="Email" optionalHint="optional">
                      <View style={styles.inputIconRow}>
                        <Mail
                          size={18}
                          color={Theme.textMuted}
                          style={styles.inputLeadingIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.inputPadded]}
                          placeholder="name@example.com"
                          placeholderTextColor={Theme.textMuted}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          value={driverEmail}
                          onChangeText={setDriverEmail}
                          testID="party-driver-email-input"
                        />
                      </View>
                    </Field>
                    <Field label="Fixed salary (₹)" optionalHint="optional">
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 25000"
                        placeholderTextColor={Theme.textMuted}
                        keyboardType="numeric"
                        value={
                          driverPayableAmount != null &&
                          driverPayableAmount !== 0
                            ? String(driverPayableAmount)
                            : ""
                        }
                        onChangeText={(v) => {
                          const n =
                            v.trim() === ""
                              ? null
                              : parseFloat(v.replace(/[^0-9.]/g, ""));
                          setDriverPayableAmount(
                            n != null && !Number.isNaN(n) ? n : null,
                          );
                        }}
                      />
                    </Field>
                    <View style={[styles.row2, layoutWide && styles.row2Web]}>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Commission (%)" optionalHint="optional">
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. 10"
                            placeholderTextColor={Theme.textMuted}
                            keyboardType="numeric"
                            value={
                              driverCommissionPercent != null &&
                              driverCommissionPercent !== 0
                                ? String(driverCommissionPercent)
                                : ""
                            }
                            onChangeText={(v) => {
                              const n =
                                v.trim() === ""
                                  ? null
                                  : parseFloat(v.replace(/[^0-9.]/g, ""));
                              const val =
                                n != null && !Number.isNaN(n)
                                  ? Math.min(100, Math.max(0, n))
                                  : null;
                              setDriverCommissionPercent(val);
                            }}
                          />
                        </Field>
                      </View>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Per km (₹/km)" optionalHint="optional">
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. 8"
                            placeholderTextColor={Theme.textMuted}
                            keyboardType="numeric"
                            value={
                              driverCommissionPerKm != null &&
                              driverCommissionPerKm !== 0
                                ? String(driverCommissionPerKm)
                                : ""
                            }
                            onChangeText={(v) => {
                              const n =
                                v.trim() === ""
                                  ? null
                                  : parseFloat(v.replace(/[^0-9.]/g, ""));
                              setDriverCommissionPerKm(
                                n != null && !Number.isNaN(n) && n >= 0
                                  ? n
                                  : null,
                              );
                            }}
                          />
                        </Field>
                      </View>
                    </View>
                    {onInviteDriver ? (
                      <>
                        <Text style={styles.clientPhoneLookupHint}>
                          {t("existingDriverOnPlatform")}. If this number matches a
                          driver account, you can send an in-app invitation on the
                          next step.
                        </Text>
                        {driverPhone.trim().replace(/\s+/g, "").length >=
                          MIN_PHONE_LENGTH_FOR_SEARCH && driverPhoneLookupLoading ? (
                          <View style={styles.clientLookupLoadingRow}>
                            <ActivityIndicator size="small" color="#2563eb" />
                            <Text style={styles.clientLookupLoadingText}>
                              Looking up…
                            </Text>
                          </View>
                        ) : null}
                        {driverPhoneLookupError ? (
                          <Text style={styles.importContactsError}>
                            {driverPhoneLookupError}
                          </Text>
                        ) : null}
                        {driverExistingMatches.length > 0 ? (
                          <View style={styles.clientInviteeCard}>
                            <Text style={styles.clientInviteeLabel}>
                              {driverExistingMatches.some((m) => m.is_in_fleet)
                                ? t("existingDriverInFleet")
                                : t("existingDriverNotInFleet")}
                            </Text>
                            <Text style={styles.clientInviteeName}>
                              {driverExistingMatches[0]?.full_name ||
                                driverExistingMatches[0]?.phone ||
                                "—"}
                            </Text>
                            <Text style={styles.clientInviteeHint}>
                              {driverExistingMatches.some((m) => m.is_in_fleet)
                                ? t("existingDriverInFleetDetail")
                                : "Tap Continue, then use Send request on the review screen to invite them in the app."}
                            </Text>
                            {!driverExistingMatches.some(
                              (m) => m.is_in_fleet === true,
                            ) ? (
                              driverPreferOfflineOnly ? (
                                <Text style={styles.clientInviteeHint}>
                                  Offline fleet record only — no in-app invite will
                                  be sent.
                                </Text>
                              ) : (
                                <Pressable
                                  onPress={handleAddDriverOfflineInstead}
                                  disabled={submitting}
                                  style={styles.clientOfflineLink}
                                  testID="party-driver-add-offline-btn"
                                >
                                  <Text style={styles.clientOfflineLinkText}>
                                    Add as offline driver instead
                                  </Text>
                                </Pressable>
                              )
                            ) : null}
                          </View>
                        ) : null}
                      </>
                    ) : null}
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
                          testID="party-vehicle-reg-input"
                        />
                      </View>
                    </Field>
                    <Field label="Vehicle category">
                      <View style={styles.vehicleChipRow}>
                        {VEHICLE_CATEGORY_LABELS.map((cat) => (
                          <Pressable
                            key={cat}
                            style={[
                              styles.vehicleChip,
                              vehicleCategory === cat && styles.vehicleChipActive,
                            ]}
                            onPress={() => setVehicleCategory(cat)}
                            testID={`party-vehicle-category-${cat}`}
                          >
                            <Text
                              style={[
                                styles.vehicleChipText,
                                vehicleCategory === cat &&
                                  styles.vehicleChipTextActive,
                              ]}
                              numberOfLines={2}
                            >
                              {cat}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Type & model">
                      {modelIsOther ? (
                        <View style={styles.inputIconRow}>
                          <Truck
                            size={18}
                            color={Theme.textMuted}
                            style={styles.inputLeadingIcon}
                          />
                          <TextInput
                            style={[styles.input, styles.inputPadded]}
                            placeholder="e.g. BharatBenz 3523R"
                            placeholderTextColor={Theme.textMuted}
                            value={vehicleModel}
                            onChangeText={setVehicleModel}
                            testID="party-vehicle-model-input"
                          />
                        </View>
                      ) : (
                        <View style={styles.inputIconRow}>
                          <Truck
                            size={18}
                            color={Theme.textMuted}
                            style={styles.inputLeadingIcon}
                          />
                          <Pressable
                            style={[
                              styles.input,
                              styles.inputPadded,
                              styles.presetFieldPress,
                            ]}
                            onPress={() => setModelPickerOpen(true)}
                            testID="party-vehicle-model-picker"
                          >
                            <Text
                              style={
                                vehicleModel.trim()
                                  ? styles.presetFieldValue
                                  : styles.presetFieldPlaceholder
                              }
                              numberOfLines={2}
                            >
                              {vehicleModel.trim()
                                ? vehicleModel
                                : "Tap to select model"}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                      {modelIsOther ? (
                        <Pressable
                          onPress={() => {
                            setModelIsOther(false);
                            setModelPickerOpen(true);
                          }}
                          style={styles.presetLinkWrap}
                        >
                          <Text style={styles.presetLinkText}>
                            Choose from list instead
                          </Text>
                        </Pressable>
                      ) : null}
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
                              placeholder="e.g. 7.5 or 20 tons"
                              placeholderTextColor={Theme.textMuted}
                              keyboardType="decimal-pad"
                              value={vehicleCapacity}
                              onChangeText={setVehicleCapacity}
                              testID="party-vehicle-capacity-input"
                            />
                          </View>
                          {renderPortalSpecHint(
                            capacityRecommendations,
                            vehicleCapacity,
                          )}
                        </Field>
                      </View>
                      <View style={layoutWide ? styles.row2Grow : undefined}>
                        <Field label="Body length (ft)">
                          {bodyLengthIsOther ? (
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. 28 or 32 ft"
                              placeholderTextColor={Theme.textMuted}
                              value={vehicleBodyFt}
                              onChangeText={setVehicleBodyFt}
                              testID="party-vehicle-body-input"
                            />
                          ) : (
                            <Pressable
                              style={[styles.input, styles.presetFieldPress]}
                              onPress={() => setBodyLengthPickerOpen(true)}
                              testID="party-vehicle-body-picker"
                            >
                              <Text
                                style={
                                  vehicleBodyFt.trim()
                                    ? styles.presetFieldValue
                                    : styles.presetFieldPlaceholder
                                }
                                numberOfLines={2}
                              >
                                {vehicleBodyFt.trim()
                                  ? vehicleBodyFt
                                  : "Tap to choose body length"}
                              </Text>
                            </Pressable>
                          )}
                          {bodyLengthIsOther ? (
                            <Pressable
                              onPress={() => {
                                setBodyLengthIsOther(false);
                                setBodyLengthPickerOpen(true);
                              }}
                              style={styles.presetLinkWrap}
                            >
                              <Text style={styles.presetLinkText}>
                                Choose from list instead
                              </Text>
                            </Pressable>
                          ) : null}
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
                          testID="party-vehicle-axle-input"
                        />
                      </View>
                      {renderPortalSpecHint(
                        axleRecommendations,
                        vehicleAxle,
                      )}
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

            {step === "review" &&
            kind === "driver" &&
            onInviteDriver &&
            driverExistingMatches.length > 0 &&
            !driverExistingMatches.some((m) => m.is_in_fleet === true) &&
            !driverPreferOfflineOnly ? (
              <View style={styles.reviewDriverOfflineLinkWrap}>
                <Pressable
                  onPress={handleAddDriverOfflineInstead}
                  disabled={submitting}
                  style={styles.clientOfflineLink}
                >
                  <Text style={styles.clientOfflineLinkText}>
                    Add as offline driver instead
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {step === "form" ? (
              <Pressable
                style={[
                  styles.primaryBtn,
                  (!organizationId ||
                    ((kind === "client" || kind === "supplier") &&
                      driverRegisteredAtPhone) ||
                    (kind === "driver" &&
                      onInviteDriver &&
                      driverExistingMatches.some((m) => m.is_in_fleet === true))) &&
                    styles.primaryBtnDisabled,
                ]}
                onPress={goReview}
                disabled={
                  !organizationId ||
                  ((kind === "client" || kind === "supplier") &&
                    driverRegisteredAtPhone) ||
                  (kind === "driver" &&
                    onInviteDriver &&
                    driverExistingMatches.some((m) => m.is_in_fleet === true))
                }
                testID="party-continue-btn"
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
                  testID="party-edit-details-btn"
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
                  testID="party-save-btn"
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Check size={22} color="#fff" strokeWidth={2.8} />
                      <Text style={styles.confirmBtnText}>
                        {reviewSaveLabel}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>

      <Modal
        visible={modelPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModelPickerOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.vehiclePickBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setModelPickerOpen(false)}
          />
          <View
            style={[
              styles.vehiclePickSheet,
              {
                paddingBottom: insets.bottom + 16,
                maxHeight: Dimensions.get("window").height * 0.72,
              },
            ]}
          >
            <Text style={styles.vehiclePickTitle}>Model</Text>
            <Text style={styles.vehiclePickHint}>
              Presets for the selected category, or Other to type manually.
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={styles.vehiclePickScroll}
            >
              {getModelSelectOptions(vehicleCategory).map((opt) => (
                <TouchableOpacity
                  key={`model-${normalizeBodyLengthKey(opt)}`}
                  style={[
                    styles.vehiclePickRow,
                    normalizeBodyLengthKey(vehicleModel) ===
                      normalizeBodyLengthKey(opt) &&
                      !modelIsOther &&
                      styles.vehiclePickRowActive,
                  ]}
                  onPress={() => {
                    setModelIsOther(false);
                    setVehicleModel(opt);
                    setModelPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.vehiclePickRowText,
                      normalizeBodyLengthKey(vehicleModel) ===
                        normalizeBodyLengthKey(opt) &&
                        !modelIsOther &&
                        styles.vehiclePickRowTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.vehiclePickRow,
                  modelIsOther && styles.vehiclePickRowActive,
                ]}
                onPress={() => {
                  setModelIsOther(true);
                  setVehicleModel("");
                  setModelPickerOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.vehiclePickRowText,
                    modelIsOther && styles.vehiclePickRowTextActive,
                  ]}
                >
                  {OTHER_LABEL} — type manually
                </Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity
              style={styles.vehiclePickDone}
              onPress={() => setModelPickerOpen(false)}
            >
              <Text style={styles.vehiclePickDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={bodyLengthPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBodyLengthPickerOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.vehiclePickBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setBodyLengthPickerOpen(false)}
          />
          <View
            style={[
              styles.vehiclePickSheet,
              {
                paddingBottom: insets.bottom + 16,
                maxHeight: Dimensions.get("window").height * 0.72,
              },
            ]}
          >
            <Text style={styles.vehiclePickTitle}>Body length</Text>
            <Text style={styles.vehiclePickHint}>
              Choose a preset or Other for a custom value.
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={styles.vehiclePickScroll}
            >
              {BODY_LENGTH_SELECT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={normalizeBodyLengthKey(opt)}
                  style={[
                    styles.vehiclePickRow,
                    normalizeBodyLengthKey(vehicleBodyFt) ===
                      normalizeBodyLengthKey(opt) &&
                      !bodyLengthIsOther &&
                      styles.vehiclePickRowActive,
                  ]}
                  onPress={() => {
                    setBodyLengthIsOther(false);
                    setVehicleBodyFt(opt);
                    setBodyLengthPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.vehiclePickRowText,
                      normalizeBodyLengthKey(vehicleBodyFt) ===
                        normalizeBodyLengthKey(opt) &&
                        !bodyLengthIsOther &&
                        styles.vehiclePickRowTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.vehiclePickRow,
                  bodyLengthIsOther && styles.vehiclePickRowActive,
                ]}
                onPress={() => {
                  setBodyLengthIsOther(true);
                  setVehicleBodyFt("");
                  setBodyLengthPickerOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.vehiclePickRowText,
                    bodyLengthIsOther && styles.vehiclePickRowTextActive,
                  ]}
                >
                  {OTHER_LABEL} — type manually
                </Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity
              style={styles.vehiclePickDone}
              onPress={() => setBodyLengthPickerOpen(false)}
            >
              <Text style={styles.vehiclePickDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
  vehicleChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vehicleChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    maxWidth: "100%",
  },
  vehicleChipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  vehicleChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    maxWidth: 200,
  },
  vehicleChipTextActive: {
    color: "#fff",
  },
  presetFieldPress: {
    justifyContent: "center",
    minHeight: 50,
  },
  presetFieldValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  presetFieldPlaceholder: {
    fontSize: 14,
    fontWeight: "500",
    color: "#94a3b8",
  },
  presetLinkWrap: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  presetLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimary,
  },
  specHintText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 6,
    lineHeight: 15,
  },
  vehiclePickBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  vehiclePickSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    width: "100%",
    alignSelf: "stretch",
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 -8px 40px rgba(0,0,0,0.15)" } as object)
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 12,
        }),
  },
  vehiclePickTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  vehiclePickHint: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    marginBottom: 12,
  },
  vehiclePickScroll: {
    flexGrow: 0,
    maxHeight: 340,
  },
  vehiclePickRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  vehiclePickRowActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb",
  },
  vehiclePickRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  vehiclePickRowTextActive: {
    color: "#1d4ed8",
  },
  vehiclePickDone: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#0f172a",
  },
  vehiclePickDoneText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
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
  clientPhoneLookupHint: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 17,
  },
  clientLookupLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  clientLookupLoadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },
  clientInviteeCard: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  clientInviteeLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  clientInviteeName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  clientInviteeHint: {
    fontSize: 12,
    fontWeight: "500",
    color: "#475569",
    lineHeight: 17,
    marginBottom: 8,
  },
  clientOfflineLink: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  clientOfflineLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
  reviewDriverOfflineLinkWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  clientNoMatchHint: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    marginBottom: 4,
    lineHeight: 17,
  },
});
