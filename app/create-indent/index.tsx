/**
 * Create Indent — Deploy New Load.
 * Layout aligned with Create Trip (AddTripModalLayout + section cards).
 */
import { CreateTripSheetSearchInput } from "@/components/CreateTripSheetSearchInput";
import {
  fullPageWizardStyles,
  WizardClientPicker,
  WizardClientSummaryCard,
  WizardFormBody,
  WizardNumericKeypadFlow,
  WizardPartyContextRow,
} from "@/components/full-page-wizard";
import {
  parseRawToNumber,
  toRawString,
} from "@/components/mobile-input/keypad";
import { resolveWizardClientPhone } from "@/features/clients/utils/clientContactDisplay.util";
import { PartyAvatar } from "@/components/PartyAvatar";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { ThemedConfirmModal } from "@/components/ThemedConfirmModal";
import {
  IndentShareTicketModal,
  type IndentShareTicketFields,
} from "@/features/indents/components/IndentShareTicketModal";
import Layout from "@/constants/Layout";
import { isDesktopWizardForm, WIZARD_FULL_PAGE_STEPPED } from "@/lib/wizardLayout.util";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getClientsByOrganization, type ClientRow } from "@/features/clients/services/clients.service";
import { createIndent, type CreateIndentInput } from "@/features/indents/services/indents.service";
import { LOAD_TYPES } from "@/features/indents/constants";
import {
    getIndentById,
    shareDraftIndent,
    updateIndentDraft,
} from "@/features/indents/services/indents.service";
import {
  INDENT_WIZARD_STEPS,
  indentStepCanAdvance,
  indentWizardStepLabel,
  type IndentWizardStep,
} from "@/features/indents/components/create-indent/createIndentWizardSteps";
import type { FormState } from "@/features/indents/components/create-indent/createIndentForm.types";
import { IndentWizardMobileStep } from "@/features/indents/components/create-indent/IndentWizardMobileStep";
import { SmartInput } from "@/components/mobile-input";
import { ADD_TRIP_FORM } from "@/features/trips/components/add-trip/addTripFormTokens";
import { AddTripModalLayout } from "@/features/trips/components/add-trip/AddTripModalLayout";
import { AddTripWizardProgress } from "@/features/trips/components/add-trip/AddTripWizardProgress";
import { LocationSearchField } from "@/features/trips/components/add-trip/LocationSearchField";
import {
    BODY_LENGTH_SELECT_OPTIONS,
    normalizeBodyLengthKey,
    OTHER_LABEL,
    VEHICLE_CATEGORY_LABELS,
} from "@/features/vehicles/utils/vehicleFormOptions.util";
import {
    getCapabilitiesFromProfile,
    getEffectivePermissions,
} from "@/lib/capabilities";
import { useInvalidateIndents } from "@/lib/queries/useIndentsQuery";
import { ROUTES } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import {
    dateISO,
    maxLength,
    nonNegativeAmount,
    positiveAmount,
    required,
    runValidators,
    VALIDATION,
} from "@/lib/validation";
import { getOptimalRoute } from "@/lib/routingService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
    ArrowRight,
    CheckCircle2,
    Clock,
    FileEdit,
    Info,
    MapPin,
    Navigation,
    Package,
    PlusCircle,
    Truck,
    X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
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
    type TextStyle,
    type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function validateForm(state: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  // Client must be selected from list or added via Add Client (no free-text name).
  if (!state.client_id?.trim()) {
    errors.client_name = "Select a client from the list or add a new one.";
  }
  const r = (key: keyof FormState, ...fns: ReturnType<typeof required>[]) => {
    const v = state[key];
    const val = typeof v === "string" ? v : String(v ?? "");
    const err = runValidators(val, fns);
    if (err) errors[key as string] = err;
  };
  // client_name is set from selected client; still validate length when present
  if ((state.client_name ?? "").trim()) {
    const err = runValidators((state.client_name ?? "").trim(), [
      maxLength(VALIDATION.CLIENT_SUPPLIER_NAME_MAX_LENGTH),
    ]);
    if (err) errors.client_name = err;
  }
  r("pickup_area", required(), maxLength(255));
  r("drop_location", required(), maxLength(255));
  const clientPriceErr = positiveAmount()(state.client_price);
  if (clientPriceErr) errors.client_price = clientPriceErr;
  const supplierTargetErr = nonNegativeAmount()(state.supplier_target);
  if (supplierTargetErr) errors.supplier_target = supplierTargetErr;
  r("vehicle_type", required("Vehicle is required"), maxLength(100));
  r("load_type", required("Load type is required"), maxLength(100));
  const weightStr = (state.weight ?? "").trim();
  if (!weightStr) {
    errors.weight = "Weight is required.";
  } else {
    const w = parseFloat(weightStr.replace(/,/g, ""));
    if (Number.isNaN(w) || w <= 0)
      errors.weight = "Enter a valid weight (tons).";
    else if (w > 999999) errors.weight = "Weight must be at most 999,999 tons.";
  }
  if ((state.pickup_date ?? "").trim()) {
    const pickupDateErr = dateISO()(state.pickup_date ?? "");
    if (pickupDateErr) errors.pickup_date = pickupDateErr;
  }
  return errors;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function getToday(): string {
  return toISODate(new Date());
}
function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}
function getDayAfter(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return toISODate(d);
}

function compactLocationLabel(value: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const compact = parts.slice(0, 3).join(", ");
  const MAX_LEN = 72;
  if (compact.length <= MAX_LEN) return compact;
  return `${compact.slice(0, MAX_LEN - 1).trimEnd()}…`;
}

function indentTicketFieldsFromForm(form: FormState): IndentShareTicketFields {
  return {
    pickup: compactLocationLabel(form.pickup_area) || "",
    drop: compactLocationLabel(form.drop_location) || "",
    client: (form.client_name ?? "").trim(),
    tripDate: (form.pickup_date ?? "").trim(),
    tons: (form.weight ?? "").trim(),
    vehicle: (form.vehicle_type ?? "").trim(),
    loadType: (form.load_type ?? "").trim(),
    clientPrice: (form.client_price ?? "").trim(),
    supplierTarget: (form.supplier_target ?? "").trim(),
  };
}

type IndentTicketConfirmKind = "draft" | "share";

const INDENT_TICKET_CONFIRM_COPY: Record<
  IndentTicketConfirmKind,
  {
    title: string;
    headerKicker: string;
    headerCaption: string;
    stubFinePrint: string;
    confirmText: string;
  }
> = {
  draft: {
    title: "Save draft?",
    headerKicker: "PULSE · DRAFT",
    headerCaption: "Box office preview",
    stubFinePrint:
      "Save this indent as a draft? You can keep editing until you share it to the network.",
    confirmText: "Save draft",
  },
  share: {
    title: "Share to network?",
    headerKicker: "PULSE NETWORK · INDENT",
    headerCaption: "One-way trip ticket",
    stubFinePrint:
      "Once shared, this indent becomes read-only and cannot be edited.",
    confirmText: "Share now",
  },
};

const initialFormState: FormState = {
  client_name: "",
  client_id: null,
  pickup_area: "",
  drop_location: "",
  vehicle_type: "",
  load_type: "",
  weight: "",
  client_price: "",
  supplier_target: "",
  pickup_date: getToday(),
};

function currencyFieldToRaw(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const n = parseRawToNumber(trimmed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return "";
  return toRawString(n);
}

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/** True when the user has entered something worth persisting (draft save). Ignores pickup_date default-only. */
function hasIndentDraftProgress(state: FormState): boolean {
  const t = (s: string | null | undefined) => (s ?? "").trim();
  if (t(state.pickup_area)) return true;
  if (t(state.drop_location)) return true;
  if (state.client_id?.trim()) return true;
  if (t(state.client_name)) return true;
  if (t(state.vehicle_type)) return true;
  if (t(state.load_type)) return true;
  if (t(state.weight)) return true;
  if (t(state.client_price)) return true;
  if (t(state.supplier_target)) return true;
  return false;
}

export default function CreateIndentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ draftId?: string | string[] }>();
  const safeBack = useSafeBack();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { currentOrganization } = useOrganization();
  const { profile, user } = useAuth();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [draftIndentId, setDraftIndentId] = useState<string | null>(null);
  const [lastSavedForm, setLastSavedForm] =
    useState<FormState>(initialFormState);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** Match Create Trip: full client list vs compact selected card. */
  const [clientListExpanded, setClientListExpanded] = useState(true);
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLon, setPickupLon] = useState<number | null>(null);
  const [dropLat, setDropLat] = useState<number | null>(null);
  const [dropLon, setDropLon] = useState<number | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaLabel, setRouteEtaLabel] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [dropDropdownOpen, setDropDropdownOpen] = useState(false);
  const [vehicleTypePickerOpen, setVehicleTypePickerOpen] = useState(false);
  const [vehicleTypeIsOther, setVehicleTypeIsOther] = useState(false);
  const [loadTypePickerOpen, setLoadTypePickerOpen] = useState(false);
  const [vehiclePickerQuery, setVehiclePickerQuery] = useState("");
  const [loadTypePickerQuery, setLoadTypePickerQuery] = useState("");
  /** Hover / keyboard focus: Save Draft help copy above the button. */
  const [actionHelpHint, setActionHelpHint] = useState<null | "draft">(null);
  const actionHintBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const indentActionsHostRef = useRef<View>(null);
  const vehicleTypeInputRef = useRef<TextInput>(null);
  const clientPriceInputRef = useRef<TextInput>(null);
  const supplierTargetInputRef = useRef<TextInput>(null);
  const weightInputRef = useRef<TextInput>(null);

  const focusField = useCallback((ref: { current: TextInput | null }) => {
    requestAnimationFrame(() => {
      ref.current?.focus();
    });
  }, []);

  const openPickupDateNext = useCallback(() => {
    requestAnimationFrame(() => {
      setShowDatePicker(true);
    });
  }, []);

  const cancelActionHintBlurTimer = useCallback(() => {
    if (actionHintBlurTimerRef.current) {
      clearTimeout(actionHintBlurTimerRef.current);
      actionHintBlurTimerRef.current = null;
    }
  }, []);

  const scheduleClearActionHelpHint = useCallback(() => {
    cancelActionHintBlurTimer();
    actionHintBlurTimerRef.current = setTimeout(() => {
      actionHintBlurTimerRef.current = null;
      setActionHelpHint(null);
    }, 80);
  }, [cancelActionHintBlurTimer]);

  const onDraftActionFocus = useCallback(() => {
    cancelActionHintBlurTimer();
    setActionHelpHint("draft");
  }, [cancelActionHintBlurTimer]);

  useEffect(
    () => () => cancelActionHintBlurTimer(),
    [cancelActionHintBlurTimer],
  );

  /** Stepped wizard below desktop grid width; wide screens use enterprise multi-card form. */
  const isDesktopEnterprise = isDesktopWizardForm(windowWidth);
  const isMobileWizard = !isDesktopEnterprise && WIZARD_FULL_PAGE_STEPPED;

  const isWide = windowWidth >= 720;
  const isCompactMobile = windowWidth < 480;
  /** Stepped wizard — no multi-card desktop grid. */
  const desktopFormGrid = isDesktopEnterprise;
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const pickerCardMaxW = Math.min(windowWidth - 32, 440);

  const vehicleQueryNorm = vehiclePickerQuery.trim().toLowerCase();
  const filteredVehicleCategories = useMemo(() => {
    if (!vehicleQueryNorm) return VEHICLE_CATEGORY_LABELS;
    return VEHICLE_CATEGORY_LABELS.filter((c) =>
      c.toLowerCase().includes(vehicleQueryNorm),
    );
  }, [vehicleQueryNorm]);

  const filteredBodyLengthOptions = useMemo(() => {
    if (!vehicleQueryNorm) return BODY_LENGTH_SELECT_OPTIONS;
    return BODY_LENGTH_SELECT_OPTIONS.filter((opt) =>
      opt.toLowerCase().includes(vehicleQueryNorm),
    );
  }, [vehicleQueryNorm]);

  const filteredLoadTypes = useMemo(() => {
    const q = loadTypePickerQuery.trim().toLowerCase();
    if (!q) return LOAD_TYPES;
    return LOAD_TYPES.filter((t) => t.toLowerCase().includes(q));
  }, [loadTypePickerQuery]);

  useEffect(() => {
    if (vehicleTypePickerOpen) setVehiclePickerQuery("");
  }, [vehicleTypePickerOpen]);

  useEffect(() => {
    if (loadTypePickerOpen) setLoadTypePickerQuery("");
  }, [loadTypePickerOpen]);

  const capabilities = getCapabilitiesFromProfile(
    profile
      ? {
          role: profile.role,
          aggregated: profile.aggregated,
          asset: profile.asset,
        }
      : null,
  );
  const permissions = getEffectivePermissions(capabilities);
  const canCreate = permissions.indents.create;

  const orgId = currentOrganization?.id ?? null;
  const invalidateIndents = useInvalidateIndents();
  const routeDraftIdRaw = Array.isArray(params.draftId)
    ? params.draftId[0]
    : params.draftId;
  const routeDraftId = isUuid(routeDraftIdRaw) ? routeDraftIdRaw : null;

  const isDenseForm =
    isMobileWizard || windowWidth < Layout.wizardSteppedMaxWidth;
  const [wizardStep, setWizardStep] = useState<IndentWizardStep>("route");
  const [wizardPriceField, setWizardPriceField] = useState<"client" | "supplier">(
    "client",
  );

  useEffect(() => {
    if (!isMobileWizard) return;
    setWizardStep("route");
  }, [isMobileWizard, orgId, routeDraftId]);

  useEffect(() => {
    if (!isMobileWizard || wizardStep !== "client") return;
    if (!form.client_id?.trim()) setClientListExpanded(true);
  }, [form.client_id, isMobileWizard, wizardStep]);

  useEffect(() => {
    setVehicleTypePickerOpen(false);
    setLoadTypePickerOpen(false);
  }, [wizardStep]);

  /** Desktop / wide form: chain vehicle → load picker. Mobile wizard uses separate steps. */
  const openLoadTypePickerNext = useCallback(() => {
    if (isMobileWizard) return;
    requestAnimationFrame(() => {
      setVehicleTypePickerOpen(false);
      setLoadTypePickerOpen(true);
    });
  }, [isMobileWizard]);

  const openVehicleTypePicker = useCallback(() => {
    setLoadTypePickerOpen(false);
    setVehicleTypePickerOpen(true);
  }, []);

  const openLoadTypePicker = useCallback(() => {
    setVehicleTypePickerOpen(false);
    setLoadTypePickerOpen(true);
  }, []);

  const [alertState, setAlertState] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: "",
    message: "",
  });

  const [confirmState, setConfirmState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText: string;
    resolve: ((value: boolean) => void) | null;
  }>({
    visible: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    resolve: null,
  });

  /** Draft save + share confirmations use the ticket-styled modal
   *  (`IndentShareTicketModal`) instead of the generic confirm sheet. */
  const [ticketConfirmState, setTicketConfirmState] = useState<{
    visible: boolean;
    kind: IndentTicketConfirmKind;
    resolve: ((value: boolean) => void) | null;
  }>({ visible: false, kind: "share", resolve: null });

  const showDialog = useCallback((title: string, message?: string) => {
    setAlertState({ visible: true, title, message: message ?? "" });
  }, []);

  /** Same as Create Trip: modal route + PartyRegistrationPortal (web) / phone + invite (native). */
  const openAddClientFlow = useCallback(() => {
    if (!orgId) {
      showDialog(
        "Organization required",
        "Load an organization to add a client.",
      );
      return;
    }
    const returnTo =
      routeDraftId != null
        ? `${ROUTES.CREATE_INDENT}?draftId=${encodeURIComponent(routeDraftId)}`
        : ROUTES.CREATE_INDENT;
    router.push({
      pathname: ROUTES.ADD_CLIENT,
      params: { returnTo },
    });
  }, [orgId, routeDraftId, router, showDialog]);

  const confirmDialog = useCallback(
    (
      title: string,
      message: string,
      confirmText = "Confirm",
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirmState({
          visible: true,
          title,
          message,
          confirmText,
          resolve,
        });
      });
    },
    [],
  );

  const requestIndentTicketConfirm = useCallback(
    (kind: IndentTicketConfirmKind): Promise<boolean> => {
      return new Promise((resolve) => {
        setTicketConfirmState({ visible: true, kind, resolve });
      });
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!orgId) {
        setClients([]);
        setClientsLoading(false);
        return;
      }
      let cancelled = false;
      setClientsLoading(true);
      getClientsByOrganization(orgId).then(({ clients: list }) => {
        if (!cancelled) {
          setClients(list ?? []);
          setClientsLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [orgId]),
  );

  // Only hydrate when an explicit draftId is provided in the route.
  // Opening /create-indent directly should always start with a fresh form.
  useEffect(() => {
    const loadDraft = async () => {
      if (!orgId) return;
      try {
        if (!routeDraftId) {
          setDraftIndentId(null);
          return;
        }
        const { error, indent } = await getIndentById(routeDraftId);
        if (!error && indent) {
          const nextForm: FormState = {
            client_name: String(indent.client_name ?? ""),
            client_id: (indent.client_id as string) ?? null,
            pickup_area: String(indent.pickup_area ?? ""),
            drop_location: String(indent.drop_location ?? ""),
            vehicle_type: String(indent.vehicle_type ?? ""),
            load_type: String(indent.load_type ?? ""),
            weight:
              indent.weight != null && Number(indent.weight) > 0
                ? String((Number(indent.weight) / 1000).toFixed(2))
                : "",
            client_price:
              indent.client_price != null
                ? String(Number(indent.client_price))
                : "",
            supplier_target:
              indent.supplier_target != null
                ? String(Number(indent.supplier_target))
                : "",
            pickup_date: String(indent.pickup_date ?? getToday()),
          };
          setDraftIndentId(indent.id);
          setForm(nextForm);
          setLastSavedForm(nextForm);
          if (nextForm.client_id?.trim()) {
            setClientListExpanded(false);
          } else {
            setClientListExpanded(true);
          }
        }
      } catch {
        // Ignore draft load errors.
      }
    };
    loadDraft();
  }, [orgId, routeDraftId]);

  const update = useCallback((updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(updates)) if (next[key]) delete next[key];
      return next;
    });
  }, []);

  // Save draft whenever form changes and orgId is known.
  useEffect(() => {
    if (!orgId) return;
    const key = `indent_draft_${orgId}`;
    AsyncStorage.setItem(key, JSON.stringify(form)).catch(() => {
      // Best-effort; ignore persistence errors.
    });
  }, [orgId, form]);

  const computeEtaLabel = (durationSeconds: number): string => {
    const totalSeconds = Math.max(0, Math.round(durationSeconds));
    const totalMinutes = Math.ceil(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}M`;
    if (minutes <= 0) return `${hours}H`;
    return `${hours}H ${minutes}M`;
  };

  const computeHaversineDistanceKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c) / 1000;
  };

  const isValidCoord = (n: number | null | undefined) => {
    if (n == null) return false;
    if (!Number.isFinite(n)) return false;
    // Custom/manual addresses use (0,0) in location search flow; treat as unset.
    if (Math.abs(n) < 0.000001) return false;
    return true;
  };

  useEffect(() => {
    const canCompute =
      isValidCoord(pickupLat) &&
      isValidCoord(pickupLon) &&
      isValidCoord(dropLat) &&
      isValidCoord(dropLon);

    if (!canCompute) {
      setRouteDistanceKm(null);
      setRouteEtaLabel(null);
      setRouteLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      setRouteLoading(true);
      try {
        const from = {
          latitude: pickupLat as number,
          longitude: pickupLon as number,
        };
        const to = {
          latitude: dropLat as number,
          longitude: dropLon as number,
        };
        const route = await getOptimalRoute(from, to);
        if (cancelled) return;

        if (route) {
          const distanceKm = Math.round((route.distance ?? 0) / 1000);
          setRouteDistanceKm(distanceKm > 0 ? distanceKm : 0);
          setRouteEtaLabel(computeEtaLabel(route.duration ?? 0));
          return;
        }

        const fallbackKm = Math.max(
          1,
          Math.round(
            computeHaversineDistanceKm(
              from.latitude,
              from.longitude,
              to.latitude,
              to.longitude,
            ),
          ),
        );
        const fallbackEtaSeconds = (fallbackKm * 60 * 60) / 40;
        setRouteDistanceKm(fallbackKm);
        setRouteEtaLabel(computeEtaLabel(fallbackEtaSeconds));
      } catch {
        if (cancelled) return;
        setRouteDistanceKm(null);
        setRouteEtaLabel(null);
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [pickupLat, pickupLon, dropLat, dropLon]);

  const selectedClientRow = useMemo(
    () => clients.find((c) => c.id === form.client_id) ?? null,
    [clients, form.client_id],
  );

  const indentWizardContextRow = useMemo(() => {
    if (!isMobileWizard || !selectedClientRow) return null;
    if (wizardStep === "route" || wizardStep === "client") return null;
    const pickup = compactLocationLabel(form.pickup_area) || "—";
    const drop = compactLocationLabel(form.drop_location) || "—";
    return {
      left: {
        label: "Route",
        name: `${pickup} → ${drop}`,
        entityType: "client" as const,
      },
      right: {
        label: "Client",
        name: selectedClientRow.name ?? "Client",
        subtitle: resolveWizardClientPhone(selectedClientRow.phone) ?? null,
        entityType: "client" as const,
        avatarUrl:
          (selectedClientRow as { avatar_url?: string | null }).avatar_url ??
          null,
        avatarSeed:
          (selectedClientRow as { avatar_seed?: string | null }).avatar_seed ??
          null,
      },
    };
  }, [
    isMobileWizard,
    selectedClientRow,
    wizardStep,
    form.pickup_area,
    form.drop_location,
  ]);

  const handleSelectClient = useCallback(
    (client: ClientRow) => {
      if (form.client_id === client.id) return;
      const clientName = client.name ?? client.contact_person ?? "";
      if (!clientName.trim()) {
        showDialog(
          "Invalid Client",
          "Selected client has no name. Please select a client with a valid name or contact person.",
        );
        return;
      }
      update({
        client_id: client.id,
        client_name: clientName,
      });
      setClientListExpanded(false);
      focusField(clientPriceInputRef);
    },
    [focusField, form.client_id, showDialog, update],
  );

  const handleBackPress = useCallback(() => {
    if (isMobileWizard) {
      const idx = INDENT_WIZARD_STEPS.indexOf(wizardStep);
      if (idx > 0) {
        setWizardStep(INDENT_WIZARD_STEPS[idx - 1]!);
        return;
      }
    }
    const hasUnsavedChanges =
      JSON.stringify(form) !== JSON.stringify(lastSavedForm);
    if (!hasUnsavedChanges) {
      safeBack();
      return;
    }
    confirmDialog(
      "Unsaved changes",
      "You have unsaved indent changes. Save Draft to continue editing later.",
      "Discard",
    ).then((confirmed) => {
      if (confirmed) safeBack();
    });
  }, [confirmDialog, form, isMobileWizard, lastSavedForm, safeBack, wizardStep]);

  // Wizard-specific submit/labels are derived after `canSubmit` is computed.

  const buildPayload = useCallback((): CreateIndentInput => {
    const payload: CreateIndentInput = {
      pickup_area: form.pickup_area.trim(),
      drop_location: form.drop_location.trim(),
      client_name: form.client_name.trim(),
      client_price:
        parseFloat(String(form.client_price).replace(/,/g, "")) || 0,
      supplier_target:
        parseFloat(String(form.supplier_target).replace(/,/g, "")) || 0,
      vehicle_type: form.vehicle_type.trim(),
      load_type: form.load_type.trim(),
      weight: (parseFloat((form.weight ?? "").replace(/,/g, "")) || 0) * 1000,
      pickup_date: form.pickup_date.trim() || null,
      circulation_target: "integrated_supplier",
      owner_user_id: profile?.uid ?? user?.uid ?? undefined,
      created_by_user_id: profile?.uid ?? user?.uid ?? undefined,
    };
    if (form.client_id) payload.client_id = form.client_id;
    return payload;
  }, [form, profile, user]);

  const persistDraft = useCallback(async () => {
    if (!orgId) {
      showDialog(
        "Organization required",
        "Please select an organization before saving a draft.",
      );
      return;
    }
    if (!hasIndentDraftProgress(form)) {
      showDialog(
        "Nothing to save yet",
        "Fill in at least one field (route, client, vehicle, load, weight, or pricing), then save draft.",
      );
      return;
    }
    const shouldSaveDraft = await requestIndentTicketConfirm("draft");
    if (!shouldSaveDraft) return;

    const payload = buildPayload();
    setSubmitting(true);
    try {
      if (isUuid(draftIndentId)) {
        const { error, indent } = await updateIndentDraft(
          draftIndentId,
          payload,
        );
        if (!error) {
          setLastSavedForm(form);
          invalidateIndents(orgId);
          if (indent?.id) {
            router.replace({
              pathname: ROUTES.TABS.NETWORK,
              params: { tab: "load", indentId: indent.id },
            } as import("expo-router").Href);
          } else {
            showDialog(
              "Draft saved",
              "This indent stays editable until you share it.",
            );
          }
          return;
        }

        // Stale/invalid draft pointer should not block creating a fresh draft.
        setDraftIndentId(null);
        await AsyncStorage.removeItem(`indent_draft_id_${orgId}`);
      }

      const { error, indent } = await createIndent(orgId, payload, {
        action: "draft",
      });
      if (error) {
        showDialog("Could not save draft", error.message);
        return;
      }
      if (indent) {
        setDraftIndentId(indent.id);
        await AsyncStorage.setItem(`indent_draft_id_${orgId}`, indent.id);
        router.replace({
          pathname: ROUTES.TABS.NETWORK,
          params: { tab: "load", indentId: indent.id },
        } as import("expo-router").Href);
        return;
      }
      setLastSavedForm(form);
      invalidateIndents(orgId);
      showDialog(
        "Draft saved",
        "This indent stays editable until you share it.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    orgId,
    buildPayload,
    draftIndentId,
    form,
    invalidateIndents,
    router,
    showDialog,
    requestIndentTicketConfirm,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!orgId) {
      showDialog(
        "Organization required",
        "Please select an organization before creating an indent.",
      );
      return;
    }
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const shouldShare = await requestIndentTicketConfirm("share");
    if (!shouldShare) return;

    const payload = buildPayload();
    setSubmitting(true);
    try {
      if (draftIndentId) {
        const { error: draftError } = await updateIndentDraft(
          draftIndentId,
          payload,
        );
        if (draftError) {
          showDialog("Could not update draft", draftError.message);
          return;
        }
        const { error: shareError, indent } =
          await shareDraftIndent(draftIndentId);
        if (shareError) {
          showDialog("Could not share indent", shareError.message);
          return;
        }
        if (indent) {
          await AsyncStorage.removeItem(`indent_draft_${orgId}`);
          await AsyncStorage.removeItem(`indent_draft_id_${orgId}`);
          invalidateIndents(orgId);
          router.replace(
            `/indent/${indent.id}` as import("expo-router").Href,
          );
        }
        return;
      }
      const { error, indent } = await createIndent(orgId, payload, {
        action: "share",
      });
      if (error) {
        showDialog("Could not create indent", error.message);
        return;
      }
      if (indent) {
        await AsyncStorage.removeItem(`indent_draft_${orgId}`);
        await AsyncStorage.removeItem(`indent_draft_id_${orgId}`);
        invalidateIndents(orgId);
        router.replace(
          `/indent/${indent.id}` as import("expo-router").Href,
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    orgId,
    form,
    invalidateIndents,
    router,
    buildPayload,
    draftIndentId,
    showDialog,
    requestIndentTicketConfirm,
  ]);

  if (!canCreate) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <AddTripModalLayout
          title="Create Indent"
          subtitle="Deploy New Load"
          submitLabel=""
          canSubmit={false}
          primaryActionMode="content"
          onClose={handleBackPress}
          onSubmit={() => {}}
        >
          <View style={styles.noAccessWrap}>
            <Text style={styles.noAccessText}>
              You don't have permission to create indents.
            </Text>
          </View>
        </AddTripModalLayout>
      </View>
    );
  }

  const labelStyle = { color: Theme.textMutedDemo };
  const inputStyle = {
    borderColor: Theme.borderInput,
    color: Theme.textPrimary,
    backgroundColor: Theme.surfaceForm,
  };
  const fieldLabelStyle = isMobileWizard
    ? [fullPageWizardStyles.wizardFieldLabel]
    : [
        styles.fieldLabel,
        labelStyle,
        isDenseForm && styles.fieldLabelDense,
      ];
  const denseInputStyle = isMobileWizard
    ? [fullPageWizardStyles.wizardFieldInput, inputStyle]
    : [
        styles.formFieldInput,
        inputStyle,
        isDenseForm && styles.formFieldInputDense,
      ];
  const quickDateChipStyle = isMobileWizard
    ? fullPageWizardStyles.quickDateChip
    : [styles.quickDateChip, isDenseForm && styles.quickDateChipDense];
  const quickDateChipActiveStyle = isMobileWizard
    ? fullPageWizardStyles.quickDateChipActive
    : styles.quickDateChipActive;
  const quickDateChipTextStyle = isMobileWizard
    ? fullPageWizardStyles.quickDateChipText
    : [styles.quickDateChipText, isDenseForm && styles.quickDateChipTextDense];
  const quickDateChipTextActiveStyle = isMobileWizard
    ? fullPageWizardStyles.quickDateChipTextActive
    : styles.quickDateChipTextActive;
  const dateTouchableStyle = isMobileWizard
    ? fullPageWizardStyles.wizardDateTouchable
    : [styles.formFieldShell, styles.dateTouchable];
  const dateTextStyle = isMobileWizard
    ? fullPageWizardStyles.wizardDateText
    : styles.dateTouchableText;
  const datePlaceholderStyle = isMobileWizard
    ? fullPageWizardStyles.wizardDatePlaceholder
    : styles.dateTouchablePlaceholder;

  const canSubmit =
    !submitting &&
    Boolean(form.client_id?.trim()) &&
    (form.client_name ?? "").trim().length > 0 &&
    (form.pickup_area ?? "").trim().length > 0 &&
    (form.drop_location ?? "").trim().length > 0 &&
    (form.vehicle_type ?? "").trim().length > 0 &&
    (form.load_type ?? "").trim().length > 0 &&
    (form.weight ?? "").trim().length > 0 &&
    parseFloat((form.weight ?? "").replace(/,/g, "")) > 0 &&
    (form.client_price ?? "").trim().length > 0 &&
    (form.supplier_target ?? "").trim().length > 0 &&
    parseFloat(String(form.client_price ?? "").replace(/,/g, "")) > 0 &&
    parseFloat(String(form.supplier_target ?? "").replace(/,/g, "")) >= 0;

  const stepCanAdvance = useMemo(() => {
    if (!isMobileWizard) return canSubmit;
    return indentStepCanAdvance(wizardStep, form);
  }, [canSubmit, form, isMobileWizard, wizardStep]);

  const wizardStepIndex = INDENT_WIZARD_STEPS.indexOf(wizardStep);
  const isLastWizardStep =
    wizardStepIndex >= 0 &&
    wizardStepIndex === INDENT_WIZARD_STEPS.length - 1;

  const wizardSubmitLabel = isMobileWizard
    ? isLastWizardStep
      ? "Share to Network"
      : "Continue"
    : "Share to Network";

  const indentWizardSteps = useMemo(
    () =>
      INDENT_WIZARD_STEPS.map((id) => ({
        id,
        label: indentWizardStepLabel(id),
      })),
    [],
  );

  const wizardSubtitle = isMobileWizard
    ? wizardStep === "route"
      ? "Pickup, drop and load date."
      : wizardStep === "client"
        ? "Select the shipper client."
        : wizardStep === "prices"
          ? "Client price and supplier target."
          : wizardStep === "vehicle"
            ? "Vehicle type for this load."
            : wizardStep === "loadType"
              ? "Commodity / load type."
              : "Weight in tons."
    : "Share load details to your network.";

  const handleWizardPrimary = () => {
    if (!isMobileWizard) {
      void handleSubmit();
      return;
    }
    if (!stepCanAdvance) {
      setErrors(validateForm(form));
      showDialog("Missing details", "Fill the required fields to continue.");
      return;
    }
    if (!isLastWizardStep) {
      setWizardStep(INDENT_WIZARD_STEPS[wizardStepIndex + 1]!);
      return;
    }
    void handleSubmit();
  };

  const showWizardStep = useCallback(
    (step: IndentWizardStep) => !isMobileWizard || wizardStep === step,
    [isMobileWizard, wizardStep],
  );

  const canSaveDraft =
    Boolean(orgId) && !submitting && hasIndentDraftProgress(form);

  const baseInputArr = [styles.formFieldInput, inputStyle];
  const webPointer =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  /** Web TextInputs pick up a default focus ring; strip outline without widening Touchable styles. */
  const webTextInputOutline = (
    Platform.OS === "web" ? { outlineStyle: "none" as const } : {}
  ) as TextStyle;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <AddTripModalLayout
        title="Create Load"
        insightPreset="load"
        subtitle={wizardSubtitle}
        stepIndex={isMobileWizard ? wizardStepIndex + 1 : undefined}
        stepTotal={isMobileWizard ? INDENT_WIZARD_STEPS.length : undefined}
        submitLabel={wizardSubmitLabel}
        canSubmit={stepCanAdvance}
        submitting={submitting}
        validationMessage="Fill route, client, commercials, and load details to share"
        onClose={handleBackPress}
        onSubmit={handleWizardPrimary}
        scrollBody={isMobileWizard || isDesktopEnterprise}
        tertiaryLabel={isDesktopEnterprise ? "Save draft" : undefined}
        onTertiaryPress={isDesktopEnterprise ? persistDraft : undefined}
        tertiaryDisabled={!canSaveDraft}
        progress={
          isMobileWizard ? (
            <AddTripWizardProgress
              steps={indentWizardSteps}
              currentStepId={wizardStep}
            />
          ) : null
        }
      >
        <View style={styles.pageWrap}>
          <WizardFormBody
            shellScroll={isMobileWizard || isDesktopEnterprise}
            contentContainerStyle={[
              styles.scrollContent,
              (isMobileWizard || isDesktopEnterprise) &&
                fullPageWizardStyles.wizardStepBody,
              isMobileWizard && { paddingTop: 0 },
              isDesktopEnterprise && styles.scrollContentDesktop,
              {
                paddingBottom: isMobileWizard
                  ? 8
                  : isDesktopEnterprise
                    ? 16
                    : Layout.sectionSpacing +
                      insets.bottom +
                      (desktopFormGrid ? 52 : isWide ? 68 : 108),
              },
            ]}
            scrollViewProps={{
              style: styles.scroll,
              keyboardShouldPersistTaps: "handled",
              keyboardDismissMode:
                Platform.OS === "ios" ? "interactive" : "on-drag",
              showsVerticalScrollIndicator: true,
              scrollEnabled:
                !pickupDropdownOpen &&
                !dropDropdownOpen &&
                !vehicleTypePickerOpen &&
                !loadTypePickerOpen,
            }}
          >
            <View
              style={[
                styles.contentMax,
                {
                  maxWidth: desktopFormGrid
                    ? "100%"
                    : isWide
                      ? 1000
                      : 960,
                  paddingHorizontal: desktopFormGrid
                    ? 0
                    : isWide
                      ? 16
                      : isCompactMobile
                        ? 0
                        : Layout.screenPaddingHorizontal,
                  paddingTop: isMobileWizard ? 0 : undefined,
                },
              ]}
            >
              <View style={styles.mainGrid}>
                <View style={styles.formColumn}>
                  <View
                    style={[
                      styles.formFieldsGridShell,
                      desktopFormGrid && styles.formColumnGridWeb,
                    ]}
                  >
              {indentWizardContextRow ? (
                <WizardPartyContextRow
                  left={indentWizardContextRow.left}
                  right={indentWizardContextRow.right}
                />
              ) : null}

              {/* 01 Route */}
              {showWizardStep("route") ? (
                <View
                  style={[
                    isMobileWizard
                      ? fullPageWizardStyles.wizardStepContentFlat
                      : [styles.card, isCompactMobile && styles.cardCompact],
                    desktopFormGrid && styles.cardGridRouteWeb,
                    desktopFormGrid && styles.cardDesktopEnterprise,
                  ]}
                >
                {!isMobileWizard ? (
                <View style={[styles.cardHead, desktopFormGrid && styles.cardHeadDesktopEnterprise]}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>01</Text>
                  </View>
                  <Text
                    style={[
                      styles.cardTitle,
                      isCompactMobile && styles.cardTitleCompact,
                      desktopFormGrid && styles.cardTitleDesktopEnterprise,
                    ]}
                  >
                    Route Details
                  </Text>
                </View>
                ) : null}

                <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
                  <View style={styles.gridCol}>
                    <LocationSearchField
                      label="Pickup *"
                      placeholder="Search or pick pickup location"
                      value={form.pickup_area}
                      onChangeText={(t) => {
                        update({ pickup_area: t });
                        setPickupLat(null);
                        setPickupLon(null);
                      }}
                      onSelectPlace={(_name, coords) => {
                        update({
                          pickup_area: compactLocationLabel(_name),
                        });
                        setPickupLat(coords.lat);
                        setPickupLon(coords.lon);
                      }}
                      leadingIcon={<MapPin size={14} color={Theme.iconMuted} />}
                      inputStyle={[
                        ...baseInputArr,
                        webTextInputOutline,
                        errors.pickup_area && styles.inputError,
                      ]}
                      labelStyle={fieldLabelStyle}
                      compact={isDenseForm}
                      onDropdownOpenChange={setPickupDropdownOpen}
                    />
                    {errors.pickup_area ? (
                      <Text style={styles.errorText}>{errors.pickup_area}</Text>
                    ) : null}
                  </View>
                  <View style={styles.gridCol}>
                    <LocationSearchField
                      label="Drop *"
                      placeholder="Search or pick drop location"
                      value={form.drop_location}
                      onChangeText={(t) => {
                        update({ drop_location: t });
                        setDropLat(null);
                        setDropLon(null);
                      }}
                      onSelectPlace={(_name, coords) => {
                        update({
                          drop_location: compactLocationLabel(_name),
                        });
                        setDropLat(coords.lat);
                        setDropLon(coords.lon);
                      }}
                      leadingIcon={
                        <Navigation size={14} color={Theme.iconMuted} />
                      }
                      inputStyle={[
                        ...baseInputArr,
                        webTextInputOutline,
                        errors.drop_location && styles.inputError,
                      ]}
                      labelStyle={fieldLabelStyle}
                      compact={isDenseForm}
                      onDropdownOpenChange={setDropDropdownOpen}
                    />
                    {errors.drop_location ? (
                      <Text style={styles.errorText}>
                        {errors.drop_location}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View
                  style={[styles.gridRow, isWide && styles.gridRowWide]}
                >
                  <View style={styles.gridCol}>
                    <Text style={fieldLabelStyle}>Trip start date</Text>
                    <View
                      style={
                        isMobileWizard
                          ? fullPageWizardStyles.quickDateRow
                          : [styles.quickDateRow, isDenseForm && styles.quickDateRowDense]
                      }
                    >
                      {[
                        { label: "Today", get: getToday },
                        { label: "Tomorrow", get: getTomorrow },
                        { label: "Day after", get: getDayAfter },
                      ].map(({ label, get }) => {
                        const iso = get();
                        const isActive = form.pickup_date === iso;
                        return (
                          <TouchableOpacity
                            key={label}
                            style={[
                              quickDateChipStyle,
                              isActive && quickDateChipActiveStyle,
                            ]}
                            onPress={() => update({ pickup_date: iso })}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                quickDateChipTextStyle,
                                isActive && quickDateChipTextActiveStyle,
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View
                      style={isWide ? styles.routeDateInputCapWeb : undefined}
                    >
                      {Platform.OS === "web" ? (
                        <TextInput
                          style={[
                            styles.formFieldInput,
                            webTextInputOutline,
                            errors.pickup_date && styles.inputError,
                          ]}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={Theme.placeholder}
                          value={form.pickup_date}
                          onChangeText={(t) => update({ pickup_date: t })}
                          autoCorrect={false}
                        />
                      ) : (
                        <>
                          <TouchableOpacity
                            style={[
                              dateTouchableStyle,
                              errors.pickup_date && styles.inputError,
                            ]}
                            onPress={() => setShowDatePicker(true)}
                            activeOpacity={0.85}
                          >
                            <Text
                              style={
                                form.pickup_date ? dateTextStyle : datePlaceholderStyle
                              }
                            >
                              {form.pickup_date
                                ? new Date(
                                    form.pickup_date + "T12:00:00",
                                  ).toLocaleDateString("en-IN", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "Tap to pick date"}
                            </Text>
                          </TouchableOpacity>
                          {showDatePicker &&
                            (Platform.OS === "android" ? (
                              <DateTimePicker
                                value={
                                  form.pickup_date
                                    ? new Date(form.pickup_date + "T12:00:00")
                                    : new Date()
                                }
                                mode="date"
                                display="default"
                                minimumDate={new Date()}
                                onChange={(e, date) => {
                                  setShowDatePicker(false);
                                  if (e.type === "set" && date)
                                    update({ pickup_date: toISODate(date) });
                                }}
                              />
                            ) : (
                              <Modal visible transparent animationType="slide">
                                <TouchableOpacity
                                  style={styles.datePickerBackdrop}
                                  activeOpacity={1}
                                  onPress={() => setShowDatePicker(false)}
                                >
                                  <View
                                    style={styles.datePickerSheet}
                                    onStartShouldSetResponder={() => true}
                                  >
                                    <View style={styles.datePickerHeader}>
                                      <Text style={styles.datePickerTitle}>
                                        Pick date
                                      </Text>
                                      <TouchableOpacity
                                        onPress={() => setShowDatePicker(false)}
                                        hitSlop={12}
                                      >
                                        <Text style={styles.datePickerDone}>
                                          Done
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                    <DateTimePicker
                                      value={
                                        form.pickup_date
                                          ? new Date(
                                              form.pickup_date + "T12:00:00",
                                            )
                                          : new Date()
                                      }
                                      mode="date"
                                      display="spinner"
                                      minimumDate={new Date()}
                                      onChange={(_, date) =>
                                        date &&
                                        update({ pickup_date: toISODate(date) })
                                      }
                                    />
                                  </View>
                                </TouchableOpacity>
                              </Modal>
                            ))}
                        </>
                      )}
                    </View>
                    {errors.pickup_date ? (
                      <Text style={styles.errorText}>{errors.pickup_date}</Text>
                    ) : null}
                  </View>
                  {!isMobileWizard ? (
                    <View style={styles.gridCol}>
                      <Text style={fieldLabelStyle}>Tons</Text>
                      <TextInput
                        style={[
                          ...denseInputStyle,
                          webTextInputOutline,
                          errors.weight && styles.inputError,
                        ]}
                        value={form.weight}
                        onChangeText={(t) =>
                          update({
                            weight: t.replace(/[^\d.]/g, "").slice(0, 12),
                          })
                        }
                        ref={weightInputRef}
                        placeholder="Enter load weight in tons"
                        placeholderTextColor={Theme.placeholder}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        onSubmitEditing={openPickupDateNext}
                      />
                      {errors.weight ? (
                        <Text style={styles.errorText}>{errors.weight}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                {form.pickup_area.trim() && form.drop_location.trim() ? (
                  <View style={styles.routePreviewPanel}>
                    <View style={styles.routePreviewHero}>
                      <ArrowRight
                        size={16}
                        color={Theme.teslaRed}
                        strokeWidth={2}
                      />
                      <Text
                        style={styles.routePreviewHeroText}
                        numberOfLines={2}
                      >
                        {compactLocationLabel(form.pickup_area)} →{" "}
                        {compactLocationLabel(form.drop_location)}
                      </Text>
                    </View>
                    {routeLoading ||
                    routeDistanceKm != null ||
                    routeEtaLabel != null ? (
                      <View style={styles.routePreviewMetrics}>
                        <View style={styles.routePreviewMetricCol}>
                          <Text style={styles.routeMetricLab}>Distance</Text>
                          <Text style={styles.routeMetricVal}>
                            {routeLoading
                              ? "…"
                              : routeDistanceKm != null
                                ? `${routeDistanceKm} km`
                                : "—"}
                          </Text>
                        </View>
                        <View style={styles.routePreviewMetricDivider} />
                        <View style={styles.routePreviewMetricCol}>
                          <Text style={styles.routeMetricLab}>ETA</Text>
                          <Text style={styles.routeMetricVal}>
                            {routeLoading ? "…" : (routeEtaLabel ?? "—")}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                </View>
              ) : null}

              {/* 02 Client */}
              {(isMobileWizard ? showWizardStep("client") : true) ? (
                <View
                  style={[
                    isMobileWizard
                      ? fullPageWizardStyles.wizardStepContentFlat
                      : [styles.card, isCompactMobile && styles.cardCompact],
                    desktopFormGrid && styles.cardGridClientWeb,
                    desktopFormGrid && styles.cardDesktopEnterprise,
                  ]}
                >
                {!isMobileWizard ? (
                <View style={[styles.cardHead, desktopFormGrid && styles.cardHeadDesktopEnterprise]}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>02</Text>
                  </View>
                  <Text
                    style={[
                      styles.cardTitle,
                      isCompactMobile && styles.cardTitleCompact,
                      desktopFormGrid && styles.cardTitleDesktopEnterprise,
                    ]}
                  >
                    Client & Commercials
                  </Text>
                </View>
                ) : null}
                <View
                  style={
                    isMobileWizard
                      ? { width: "100%", gap: 8 }
                      : [styles.gridRow, isWide && styles.gridRowWide]
                  }
                >
                  <View
                    style={[
                      styles.gridCol,
                      errors.client_name ? styles.fieldGroupRing : null,
                    ]}
                  >
                    {isMobileWizard ? (
                      <>
                        {form.client_id && !clientListExpanded && selectedClientRow ? (
                          <WizardClientSummaryCard
                            name={selectedClientRow.name ?? "Client"}
                            subtitle={resolveWizardClientPhone(selectedClientRow.phone)}
                            avatarUrl={(selectedClientRow as { avatar_url?: string | null }).avatar_url ?? null}
                            avatarSeed={(selectedClientRow as { avatar_seed?: string | null }).avatar_seed ?? null}
                            onPress={() => setClientListExpanded(true)}
                          />
                        ) : (
                          <WizardClientPicker
                            clients={clients}
                            loading={clientsLoading}
                            selectedClientId={form.client_id}
                            onSelect={handleSelectClient}
                            onAddClient={openAddClientFlow}
                          />
                        )}
                        {errors.client_name ? (
                          <Text style={styles.errorText}>{errors.client_name}</Text>
                        ) : null}
                      </>
                    ) : (
                    <>
                    <View style={styles.sectionLabelRow}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          labelStyle,
                          styles.sectionLabelTight,
                        ]}
                      >
                        Select client
                      </Text>
                      <View style={styles.sectionLabelActions}>
                        {form.client_id ? (
                          <TouchableOpacity
                            style={styles.changeSelectionBtn}
                            onPress={() =>
                              setClientListExpanded((p) => !p)
                            }
                            activeOpacity={0.85}
                          >
                            <Text style={styles.changeSelectionBtnText}>
                              {clientListExpanded ? "Collapse" : "Change"}
                            </Text>
                            <FontAwesome
                              name={
                                clientListExpanded ? "chevron-up" : "chevron-down"
                              }
                              size={11}
                              color={Theme.iconPrimary}
                            />
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[
                            styles.addClientBtn,
                            Platform.OS === "web"
                              ? ({ cursor: "pointer" } as ViewStyle)
                              : null,
                            webPointer,
                          ]}
                          onPress={openAddClientFlow}
                          activeOpacity={0.85}
                        >
                          <PlusCircle size={14} color={Theme.iconPrimary} />
                          <Text style={styles.addClientBtnText}>
                            Add client
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {clientsLoading ? (
                      <ActivityIndicator color={Theme.iconPrimary} />
                    ) : clients.length === 0 ? (
                      <Text style={styles.mutedSmall}>
                        No clients yet. Add clients from the Clients page first.
                      </Text>
                    ) : form.client_id &&
                      !clientListExpanded &&
                      selectedClientRow ? (
                      <TouchableOpacity
                        style={[styles.clientCard, styles.selectionSummaryCard]}
                        onPress={() => setClientListExpanded(true)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.clientMain}>
                          <PartyAvatar
                            name={selectedClientRow.name ?? selectedClientRow.contact_person ?? "Client"}
                            avatarUrl={(selectedClientRow as { avatar_url?: string | null }).avatar_url ?? null}
                            size={38}
                            style={styles.clientAvatarOn}
                          />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={styles.selectionSummaryTitle}
                              numberOfLines={1}
                            >
                              {selectedClientRow.name}
                            </Text>
                            {selectedClientRow.address ? (
                              <Text
                                style={styles.selectionSummarySub}
                                numberOfLines={1}
                              >
                                {selectedClientRow.address}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.selectionSummaryPill}>
                          <Text style={styles.selectionSummaryPillText}>
                            Change
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <ScrollView
                        style={styles.clientList}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {clients.map((client) => {
                          const selected = form.client_id === client.id;
                          return (
                            <TouchableOpacity
                              key={client.id}
                              style={[
                                styles.clientCard,
                                selected && styles.clientCardRowSelected,
                                Platform.OS === "web"
                                  ? ({ cursor: "pointer" } as ViewStyle)
                                  : null,
                              ]}
                              onPress={() => handleSelectClient(client)}
                              activeOpacity={0.85}
                            >
                              <View style={styles.clientMain}>
                                <PartyAvatar
                                  name={client.name ?? client.contact_person ?? "Client"}
                                  avatarUrl={(client as { avatar_url?: string | null }).avatar_url ?? null}
                                  size={38}
                                  style={selected ? styles.clientAvatarOn : styles.clientAvatar}
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text
                                    style={[
                                      styles.clientName,
                                      selected && styles.clientNameOn,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {client.name}
                                  </Text>
                                  {client.address ? (
                                    <View style={styles.clientMetaRow}>
                                      <Clock
                                        size={11}
                                        color={Theme.textMuted}
                                      />
                                      <Text
                                        style={styles.clientSub}
                                        numberOfLines={1}
                                      >
                                        {client.address}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                              <View
                                style={[
                                  styles.radioOuter,
                                  selected && styles.radioOuterOn,
                                ]}
                              >
                                {selected ? (
                                  <CheckCircle2
                                    size={16}
                                    color={Theme.primary}
                                  />
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                    {errors.client_name ? (
                      <Text style={styles.errorText}>{errors.client_name}</Text>
                    ) : null}
                    </>
                    )}
                  </View>

                  {!isMobileWizard ? (
                  <View style={styles.gridCol}>
                    <SmartInput
                      type="currency"
                      label="Client sale price"
                      value={form.client_price}
                      onChange={(raw) => update({ client_price: raw })}
                      variant="field"
                      required
                      partyPreview={
                        selectedClientRow
                          ? {
                              name: selectedClientRow.name ?? "Client",
                              subtitle: resolveWizardClientPhone(selectedClientRow.phone) ?? undefined,
                              entityType: "client",
                              avatarUrl:
                                (selectedClientRow as { avatar_url?: string | null })
                                  .avatar_url ?? null,
                              avatarSeed:
                                (selectedClientRow as { avatar_seed?: string | null })
                                  .avatar_seed ?? null,
                            }
                          : undefined
                      }
                      errorMessage={errors.client_price}
                    />
                    <View style={styles.infoCallout}>
                      <Info size={16} color={Theme.iconPrimary} />
                      <Text style={styles.infoCalloutText}>
                        Revenue should match what you bill this client for this
                        lane. Adjust if this indent differs.
                      </Text>
                    </View>
                  </View>
                  ) : null}
                </View>

                {!isMobileWizard ? (
                <View style={styles.supplierSection}>
                  <View style={styles.supplierLabelRow}>
                    <Text style={fieldLabelStyle}>Supplier target (₹)</Text>
                    <View style={styles.estBadge}>
                      <Text style={styles.estBadgeText}>Est. target</Text>
                    </View>
                  </View>
                  <SmartInput
                    type="currency"
                    label="Supplier target"
                    value={form.supplier_target}
                    onChange={(raw) => update({ supplier_target: raw })}
                    variant="field"
                    placeholder="Optional estimate"
                    errorMessage={errors.supplier_target}
                  />
                </View>
                ) : null}

                </View>
              ) : null}

              {/* 02b Commercials (mobile wizard) */}
              {isMobileWizard && showWizardStep("prices") ? (
                <View style={fullPageWizardStyles.wizardStepContentFlat}>
                  <WizardNumericKeypadFlow
                    fields={[
                      {
                        id: "client",
                        label: "Client sale price",
                        rawValue: currencyFieldToRaw(form.client_price),
                        onRawValueChange: (raw) => update({ client_price: raw }),
                        errorMessage: errors.client_price,
                      },
                      {
                        id: "supplier",
                        label: "Supplier target",
                        rawValue: currencyFieldToRaw(form.supplier_target),
                        onRawValueChange: (raw) => update({ supplier_target: raw }),
                        optional: true,
                        errorMessage: errors.supplier_target,
                      },
                    ]}
                    activeFieldId={wizardPriceField}
                    onActiveFieldChange={(id) =>
                      setWizardPriceField(id as "client" | "supplier")
                    }
                    hint="Revenue should match what you bill this client for this lane."
                  />
                </View>
              ) : null}

              {/* 03 Load — mobile wizard steps */}
              {isMobileWizard && showWizardStep("vehicle") ? (
                <View style={fullPageWizardStyles.wizardStepContentFlat}>
                  <IndentWizardMobileStep
                    step="vehicle"
                    mode={vehicleTypeIsOther ? "text" : "picker"}
                    value={form.vehicle_type}
                    placeholder={
                      vehicleTypeIsOther ? "Type vehicle" : "Select vehicle"
                    }
                    onPressPicker={openVehicleTypePicker}
                    onChangeText={(t) => update({ vehicle_type: t })}
                    hasError={Boolean(errors.vehicle_type)}
                    inputRef={vehicleTypeInputRef}
                    footerExtra={
                      vehicleTypeIsOther ? (
                        <TouchableOpacity
                          onPress={openVehicleTypePicker}
                          style={styles.switchToPresetLink}
                        >
                          <Text style={styles.switchToPresetLinkText}>
                            Choose from list instead
                          </Text>
                        </TouchableOpacity>
                      ) : null
                    }
                  />
                  {errors.vehicle_type ? (
                    <Text style={styles.errorText}>{errors.vehicle_type}</Text>
                  ) : null}
                </View>
              ) : null}

              {isMobileWizard && showWizardStep("loadType") ? (
                <View style={fullPageWizardStyles.wizardStepContentFlat}>
                  <IndentWizardMobileStep
                    step="loadType"
                    mode="picker"
                    value={form.load_type}
                    placeholder="Select load category"
                    onPressPicker={openLoadTypePicker}
                    hasError={Boolean(errors.load_type)}
                  />
                  {errors.load_type ? (
                    <Text style={styles.errorText}>{errors.load_type}</Text>
                  ) : null}
                </View>
              ) : null}

              {isMobileWizard && showWizardStep("weight") ? (
                <View style={fullPageWizardStyles.wizardStepContentFlat}>
                  <IndentWizardMobileStep
                    step="weight"
                    mode="text"
                    value={form.weight}
                    placeholder="e.g. 18.5"
                    onChangeText={(t) =>
                      update({ weight: t.replace(/[^\d.]/g, "").slice(0, 12) })
                    }
                    hasError={Boolean(errors.weight)}
                    inputRef={weightInputRef}
                    keyboardType="decimal-pad"
                  />
                  {errors.weight ? (
                    <Text style={styles.errorText}>{errors.weight}</Text>
                  ) : null}
                </View>
              ) : null}

              {/* 03 Load — desktop / wide */}
              {!isMobileWizard ? (
                <View
                  style={[
                    styles.card,
                    isCompactMobile && styles.cardCompact,
                    desktopFormGrid && styles.cardGridLoadWeb,
                    desktopFormGrid && styles.cardDesktopEnterprise,
                  ]}
                >
                <View style={[styles.cardHead, desktopFormGrid && styles.cardHeadDesktopEnterprise]}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>03</Text>
                  </View>
                  <Text
                    style={[
                      styles.cardTitle,
                      isCompactMobile && styles.cardTitleCompact,
                      desktopFormGrid && styles.cardTitleDesktopEnterprise,
                    ]}
                  >
                    Load Specifics
                  </Text>
                </View>
                <View
                  style={[styles.sheetGrid, !isWide && styles.sheetGridStacked]}
                >
                  <View
                    style={[
                      styles.sheetField,
                      !isWide && styles.sheetFieldStacked,
                    ]}
                  >
                    <Text style={styles.sheetLabel}>Vehicle</Text>
                    {vehicleTypeIsOther ? (
                      <TextInput
                        style={[
                          styles.sheetInput,
                          webTextInputOutline,
                          errors.vehicle_type && styles.inputError,
                        ]}
                        ref={vehicleTypeInputRef}
                        value={form.vehicle_type}
                        onChangeText={(t) => update({ vehicle_type: t })}
                        placeholder="Type vehicle"
                        placeholderTextColor={Theme.placeholder}
                        returnKeyType="next"
                        onSubmitEditing={openLoadTypePickerNext}
                      />
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.sheetInput,
                          { justifyContent: "center" },
                          errors.vehicle_type && styles.inputError,
                        ]}
                        onPress={openVehicleTypePicker}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={
                            form.vehicle_type
                              ? styles.dropdownTouchableText
                              : styles.dropdownTouchablePlaceholder
                          }
                          numberOfLines={1}
                        >
                          {form.vehicle_type || "Select Vehicle"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {vehicleTypeIsOther ? (
                      <TouchableOpacity
                        onPress={openVehicleTypePicker}
                        style={styles.switchToPresetLink}
                      >
                        <Text style={styles.switchToPresetLinkText}>
                          Choose from list instead
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {errors.vehicle_type ? (
                      <Text style={styles.errorText}>
                        {errors.vehicle_type}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.sheetField,
                      !isWide && styles.sheetFieldStacked,
                    ]}
                  >
                    <Text style={styles.sheetLabel}>Load Type</Text>
                    <TouchableOpacity
                      style={[
                        styles.sheetInput,
                        { justifyContent: "center" },
                        webPointer,
                        errors.load_type && styles.inputError,
                      ]}
                      onPress={openLoadTypePicker}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={
                          form.load_type
                            ? styles.dropdownTouchableText
                            : styles.dropdownTouchablePlaceholder
                        }
                        numberOfLines={1}
                      >
                        {form.load_type || "Select load category"}
                      </Text>
                    </TouchableOpacity>
                    {errors.load_type ? (
                      <Text style={styles.errorText}>{errors.load_type}</Text>
                    ) : null}
                  </View>
                </View>

                </View>
              ) : null}

              {!isDesktopEnterprise ? (
              <View style={styles.actionFooterBar}>
                <View
                  ref={indentActionsHostRef}
                  style={styles.actionButtonsHoverHost}
                >
                  {actionHelpHint ? (
                    <View
                      style={styles.actionHelpTooltip}
                      pointerEvents="none"
                      accessibilityLiveRegion="polite"
                    >
                      <Text style={styles.actionHelpTooltipTitle}>
                        Save Draft
                      </Text>
                      <Text style={styles.actionHelpTooltipText}>
                        Indent stays editable. You can save updates again and share
                        later.
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={styles.actionButtonsRow}
                    {...(Platform.OS === "web"
                      ? {
                          onMouseLeave: () => {
                            requestAnimationFrame(() => {
                              if (typeof document === "undefined") return;
                              const host =
                                indentActionsHostRef.current as unknown as HTMLElement | null;
                              const active = document.activeElement;
                              if (
                                host &&
                                active &&
                                typeof host.contains === "function" &&
                                host.contains(active)
                              ) {
                                return;
                              }
                              setActionHelpHint(null);
                            });
                          },
                        }
                      : {})}
                  >
                    <View
                      style={styles.actionBtnHoverCell}
                      {...(Platform.OS === "web"
                        ? {
                            onMouseEnter: () => setActionHelpHint("draft"),
                          }
                        : {})}
                    >
                      <TouchableOpacity
                        style={[
                          styles.draftBtn,
                          (!canSaveDraft || submitting) &&
                            styles.submitBtnDisabled,
                        ]}
                        onPress={persistDraft}
                        disabled={!canSaveDraft || submitting}
                        activeOpacity={0.8}
                        focusable
                        onFocus={onDraftActionFocus}
                        onBlur={scheduleClearActionHelpHint}
                        accessibilityHint="Indent stays editable. You can save updates again and share later."
                      >
                        {submitting ? (
                          <ActivityIndicator
                            size="small"
                            color={Theme.textPrimaryDark}
                          />
                        ) : (
                          <View style={styles.actionBtnInner}>
                            <FileEdit size={16} color={Theme.textPrimaryDark} />
                            <Text style={styles.draftBtnText}>Save Draft</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
              ) : null}
                </View>

              </View>
            </View>
            </View>
          </WizardFormBody>

              {vehicleTypePickerOpen ? (
                <Modal
                  visible
                  transparent
                  animationType="fade"
                  onRequestClose={() => setVehicleTypePickerOpen(false)}
                >
                  <View style={styles.pickerModalRoot} accessibilityViewIsModal>
                    <Pressable
                      style={styles.pickerBackdropPress}
                      onPress={() => setVehicleTypePickerOpen(false)}
                    >
                      <View style={styles.pickerBackdropDim} />
                    </Pressable>
                    <View
                      style={styles.pickerCenterWrap}
                      pointerEvents="box-none"
                    >
                      <View
                        style={[
                          styles.pickerSheet,
                          { maxWidth: pickerCardMaxW },
                        ]}
                      >
                        <View style={styles.pickerSheetHead}>
                          <View style={styles.pickerSheetTitles}>
                            <Text style={styles.pickerSheetTitle}>
                              Select Vehicle
                            </Text>
                            <Text style={styles.pickerSheetSubtitle}>
                              Categories, presets, or custom entry
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setVehicleTypePickerOpen(false)}
                            style={[styles.pickerCloseBtn, webCursor]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                          >
                            <X
                              size={16}
                              color={Theme.primary}
                              strokeWidth={2.5}
                            />
                          </TouchableOpacity>
                        </View>

                        <CreateTripSheetSearchInput
                          value={vehiclePickerQuery}
                          onChangeText={setVehiclePickerQuery}
                          placeholder="Search categories or presets…"
                          shellStyle={styles.pickerSearchShell}
                          compactChat
                          accessibilityLabel="Search vehicle types"
                        />

                        <ScrollView
                          style={styles.pickerScroll}
                          contentContainerStyle={styles.pickerScrollContent}
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator
                        >
                          {vehicleQueryNorm &&
                            filteredVehicleCategories.length === 0 &&
                            filteredBodyLengthOptions.length === 0 && (
                              <Text style={styles.pickerEmptyText}>
                                No matching categories or presets. Try another
                                search or use custom below.
                              </Text>
                            )}
                          {filteredVehicleCategories.length > 0 ? (
                            <>
                              <Text style={styles.pickerSectionLabel}>
                                Categories
                              </Text>
                              {filteredVehicleCategories.map((opt) => {
                                const selected =
                                  form.vehicle_type === opt &&
                                  !vehicleTypeIsOther;
                                return (
                                  <TouchableOpacity
                                    key={opt}
                                    style={[
                                      styles.pickerRow,
                                      selected && styles.pickerRowSelected,
                                      webCursor,
                                    ]}
                                    onPress={() => {
                                      setVehicleTypeIsOther(false);
                                      update({ vehicle_type: opt });
                                      setVehicleTypePickerOpen(false);
                                      if (!selected) openLoadTypePickerNext();
                                    }}
                                    activeOpacity={0.75}
                                  >
                                    <View style={styles.pickerIconCircle}>
                                      <Truck
                                        size={14}
                                        color={Theme.iconPrimary}
                                      />
                                    </View>
                                    <Text
                                      style={[
                                        styles.pickerRowPrimary,
                                        selected &&
                                          styles.pickerRowPrimarySelected,
                                      ]}
                                      numberOfLines={3}
                                    >
                                      {opt}
                                    </Text>
                                    {selected ? (
                                      <CheckCircle2
                                        size={16}
                                        color={Theme.primary}
                                        strokeWidth={2.5}
                                      />
                                    ) : (
                                      <View style={styles.pickerRowEndSpacer} />
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </>
                          ) : null}

                          {filteredBodyLengthOptions.length > 0 ? (
                            <>
                              <Text style={styles.pickerSectionLabel}>
                                Presets & lengths
                              </Text>
                              {filteredBodyLengthOptions.map((opt) => {
                                const selected =
                                  form.vehicle_type === opt &&
                                  !vehicleTypeIsOther;
                                return (
                                  <TouchableOpacity
                                    key={normalizeBodyLengthKey(opt)}
                                    style={[
                                      styles.pickerRow,
                                      selected && styles.pickerRowSelected,
                                      webCursor,
                                    ]}
                                    onPress={() => {
                                      setVehicleTypeIsOther(false);
                                      update({ vehicle_type: opt });
                                      setVehicleTypePickerOpen(false);
                                      if (!selected) openLoadTypePickerNext();
                                    }}
                                    activeOpacity={0.75}
                                  >
                                    <View style={styles.pickerIconCircle}>
                                      <Truck
                                        size={14}
                                        color={Theme.iconPrimary}
                                      />
                                    </View>
                                    <Text
                                      style={[
                                        styles.pickerRowPrimary,
                                        selected &&
                                          styles.pickerRowPrimarySelected,
                                      ]}
                                      numberOfLines={3}
                                    >
                                      {opt}
                                    </Text>
                                    {selected ? (
                                      <CheckCircle2
                                        size={16}
                                        color={Theme.primary}
                                        strokeWidth={2.5}
                                      />
                                    ) : (
                                      <View style={styles.pickerRowEndSpacer} />
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </>
                          ) : null}

                          <Text style={styles.pickerSectionLabel}>Custom</Text>
                          <TouchableOpacity
                            style={[
                              styles.pickerRow,
                              vehicleTypeIsOther && styles.pickerRowSelected,
                              webCursor,
                            ]}
                            onPress={() => {
                              setVehicleTypeIsOther(true);
                              update({ vehicle_type: "" });
                              setVehicleTypePickerOpen(false);
                              focusField(vehicleTypeInputRef);
                            }}
                            activeOpacity={0.75}
                          >
                            <View style={styles.pickerIconCircle}>
                              <Truck size={14} color={Theme.iconPrimary} />
                            </View>
                            <Text
                              style={[
                                styles.pickerRowPrimary,
                                vehicleTypeIsOther &&
                                  styles.pickerRowPrimarySelected,
                              ]}
                              numberOfLines={2}
                            >
                              {OTHER_LABEL} — type manually
                            </Text>
                            {vehicleTypeIsOther ? (
                              <CheckCircle2
                                size={16}
                                color={Theme.primary}
                                strokeWidth={2.5}
                              />
                            ) : (
                              <View style={styles.pickerRowEndSpacer} />
                            )}
                          </TouchableOpacity>
                        </ScrollView>
                      </View>
                    </View>
                  </View>
                </Modal>
              ) : null}

              {loadTypePickerOpen ? (
                <Modal
                  visible
                  transparent
                  animationType="fade"
                  onRequestClose={() => setLoadTypePickerOpen(false)}
                >
                  <View style={styles.pickerModalRoot} accessibilityViewIsModal>
                    <Pressable
                      style={styles.pickerBackdropPress}
                      onPress={() => setLoadTypePickerOpen(false)}
                    >
                      <View style={styles.pickerBackdropDim} />
                    </Pressable>
                    <View
                      style={styles.pickerCenterWrap}
                      pointerEvents="box-none"
                    >
                      <View
                        style={[
                          styles.pickerSheet,
                          { maxWidth: pickerCardMaxW },
                        ]}
                      >
                        <View style={styles.pickerSheetHead}>
                          <View style={styles.pickerSheetTitles}>
                            <Text style={styles.pickerSheetTitle}>
                              Load type
                            </Text>
                            <Text style={styles.pickerSheetSubtitle}>
                              What you are shipping
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setLoadTypePickerOpen(false)}
                            style={[styles.pickerCloseBtn, webCursor]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                          >
                            <X
                              size={16}
                              color={Theme.primary}
                              strokeWidth={2.5}
                            />
                          </TouchableOpacity>
                        </View>

                        <CreateTripSheetSearchInput
                          value={loadTypePickerQuery}
                          onChangeText={setLoadTypePickerQuery}
                          placeholder="Search load type…"
                          shellStyle={styles.pickerSearchShell}
                          compactChat
                          accessibilityLabel="Search load types"
                        />

                        <ScrollView
                          style={styles.pickerScroll}
                          contentContainerStyle={styles.pickerScrollContent}
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator
                        >
                          {filteredLoadTypes.length === 0 ? (
                            <Text style={styles.pickerEmptyText}>
                              No load types match your search.
                            </Text>
                          ) : (
                            filteredLoadTypes.map((opt) => {
                              const selected = form.load_type === opt;
                              return (
                                <TouchableOpacity
                                  key={opt}
                                  style={[
                                    styles.pickerRow,
                                    selected && styles.pickerRowSelected,
                                    webCursor,
                                  ]}
                                  onPress={() => {
                                    update({ load_type: opt });
                                    setLoadTypePickerOpen(false);
                                    if (!selected) focusField(weightInputRef);
                                  }}
                                  activeOpacity={0.75}
                                >
                                  <View style={styles.pickerIconCircle}>
                                    <Package
                                      size={14}
                                      color={Theme.iconPrimary}
                                    />
                                  </View>
                                  <Text
                                    style={[
                                      styles.pickerRowPrimary,
                                      selected &&
                                        styles.pickerRowPrimarySelected,
                                    ]}
                                    numberOfLines={3}
                                  >
                                    {opt}
                                  </Text>
                                  {selected ? (
                                    <CheckCircle2
                                      size={16}
                                      color={Theme.primary}
                                      strokeWidth={2.5}
                                    />
                                  ) : (
                                    <View style={styles.pickerRowEndSpacer} />
                                  )}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </ScrollView>
                      </View>
                    </View>
                  </View>
                </Modal>
              ) : null}


          <View style={styles.blobA} pointerEvents="none" />
          <View style={styles.blobB} pointerEvents="none" />
        </View>
      </AddTripModalLayout>

      <ThemedAlertModal
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        onOk={() => setAlertState((prev) => ({ ...prev, visible: false }))}
      />
      <ThemedConfirmModal
        visible={confirmState.visible}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        onCancel={() => {
          if (confirmState.resolve) confirmState.resolve(false);
          setConfirmState((prev) => ({
            ...prev,
            visible: false,
            resolve: null,
          }));
        }}
        onConfirm={() => {
          if (confirmState.resolve) confirmState.resolve(true);
          setConfirmState((prev) => ({
            ...prev,
            visible: false,
            resolve: null,
          }));
        }}
      />
      <IndentShareTicketModal
        visible={ticketConfirmState.visible}
        ticketRef={draftIndentId}
        fields={indentTicketFieldsFromForm(form)}
        title={INDENT_TICKET_CONFIRM_COPY[ticketConfirmState.kind].title}
        headerKicker={
          INDENT_TICKET_CONFIRM_COPY[ticketConfirmState.kind].headerKicker
        }
        headerCaption={
          INDENT_TICKET_CONFIRM_COPY[ticketConfirmState.kind].headerCaption
        }
        stubFinePrint={
          INDENT_TICKET_CONFIRM_COPY[ticketConfirmState.kind].stubFinePrint
        }
        confirmText={
          INDENT_TICKET_CONFIRM_COPY[ticketConfirmState.kind].confirmText
        }
        onCancel={() => {
          if (ticketConfirmState.resolve) ticketConfirmState.resolve(false);
          setTicketConfirmState({
            visible: false,
            kind: "share",
            resolve: null,
          });
        }}
        onConfirm={() => {
          if (ticketConfirmState.resolve) ticketConfirmState.resolve(true);
          setTicketConfirmState({
            visible: false,
            kind: "share",
            resolve: null,
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 12,
  },
  scrollContentDesktop: {
    paddingTop: 4,
    width: "100%",
  },
  sheet: {
    gap: 12,
    width: "100%",
    minWidth: "100%",
    alignSelf: "stretch",
  },
  stepCard: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 16,
    width: "100%",
    alignSelf: "stretch",
  },
  stepCardDimmed: {
    opacity: 0.92,
  },
  stepCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  stepChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.darkSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.8,
  },
  stepCardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  sheetGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    alignItems: "stretch",
  },
  sheetGridStacked: {
    flexDirection: "column",
  },
  sheetField: { flex: 1, minWidth: 0 },
  sheetFieldStacked: {
    flex: 0,
    flexGrow: 0,
    alignSelf: "stretch",
  },
  hiddenLabel: { height: 0, margin: 0, padding: 0, opacity: 0 },
  sheetSection: { marginBottom: 8 },
  sheetLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  sheetInput: {
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimary,
    minHeight: 40,
  },
  commercialHighlight: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 10,
  },
  nextStepBtn: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Theme.darkSurface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  nextStepBtnFill: {
    flex: 1,
    marginTop: 0,
  },
  nextStepBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  stepButtonsRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepBackBtn: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBackBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 8,
  },
  sectionLabelActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 8,
  },
  sectionLabelTight: {
    marginBottom: 0,
  },
  changeSelectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  changeSelectionBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.iconPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  changeSelectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
  },
  changeSelectionPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.iconPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldGroupRing: {
    borderWidth: 1.5,
    borderColor: Theme.destructive,
    borderRadius: 14,
    padding: 8,
  },
  addClientBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  addClientBtnText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.iconPrimary,
  },
  partnersWrap: {
    minHeight: 42,
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    marginBottom: 8,
  },
  clientSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: Layout.minTouchTargetSize,
    marginBottom: 8,
    gap: 8,
  },
  clientSearchIcon: { marginRight: 2 },
  clientSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  clientSearchClear: {
    padding: 4,
  },
  partnersPlaceholder: {
    fontSize: 12,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  partnersScrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
    paddingRight: 16,
    marginBottom: 8,
  },
  partnerChip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
  },
  partnerChipSelected: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surface,
  },
  partnerChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  partnerChipTextSelected: {
    color: Theme.textPrimaryDark,
  },
  quickDateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  quickDateChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  quickDateChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79, 70, 229, 0.08)",
  },
  quickDateChipText: {
    fontSize: 11,
    letterSpacing: 0.3,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "normal",
  },
  quickDateChipTextActive: {
    color: Theme.primary,
    fontWeight: "800",
  },
  dateTouchable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateTouchableText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  dateTouchablePlaceholder: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  dropdownTouchableText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  dropdownTouchablePlaceholder: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  pickerModalRoot: {
    flex: 1,
  },
  pickerBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerBackdropDim: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
  },
  pickerCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    ...Platform.select({
      web: {
        width: "100%" as const,
        left: 0,
        right: 0,
      } as ViewStyle,
      default: {},
    }),
  },
  pickerSheet: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 14,
  },
  pickerSheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  pickerSheetTitles: {
    flex: 1,
    paddingRight: 10,
  },
  pickerSheetTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 12,
    letterSpacing: 0.25,
    color: Theme.textPrimaryDark,
  },
  pickerSheetSubtitle: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    marginTop: 3,
    color: Theme.textMuted,
  },
  pickerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  pickerSearchShell: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  pickerScroll: {
    maxHeight: 320,
    minHeight: 100,
  },
  pickerScrollContent: {
    paddingBottom: 12,
  },
  pickerSectionLabel: {
    ...FinanceTxnTypography.columnTitle,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.35,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 10,
  },
  pickerRowSelected: {
    backgroundColor: Theme.surfaceLight,
  },
  pickerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerRowPrimary: {
    flex: 1,
    minWidth: 0,
    ...FinanceTxnTypography.fieldValue,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  pickerRowPrimarySelected: {
    fontWeight: "800",
    color: Theme.primary,
  },
  pickerRowEndSpacer: {
    width: 18,
    height: 18,
  },
  pickerEmptyText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  switchToPresetLink: {
    marginTop: 6,
    paddingVertical: 2,
  },
  switchToPresetLinkText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "flex-end",
  },
  datePickerSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  datePickerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  datePickerDone: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  inputError: { borderColor: Theme.negative },
  errorText: { fontSize: 12, color: Theme.negative, marginTop: 4 },
  actionButtonsHoverHost: {
    position: "relative",
    zIndex: 2,
  },
  actionHelpTooltip: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "100%",
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
      } as ViewStyle,
    }),
  },
  actionHelpTooltipTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  actionHelpTooltipText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  actionBtnHoverCell: {
    flex: 1,
    minWidth: 0,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionFooterBar: {
    marginTop: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  actionBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  draftBtn: {
    flex: 1,
    marginTop: 0,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  draftBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  pageWrap: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    position: "relative",
  },
  contentMax: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
  },
  mainGrid: {
    width: "100%",
  },
  formColumn: {
    width: "100%",
    minWidth: 0,
  },
  /** Wraps cards 01–03; desktop web uses same 2-col grid as Create Trip. */
  formFieldsGridShell: {
    width: "100%",
    minWidth: 0,
  },
  formColumnGridWeb: Platform.select<ViewStyle>({
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      gap: 20,
      alignItems: "start",
      gridAutoRows: "min-content",
    } as unknown as ViewStyle,
    default: {},
  }),
  /** Row 1 col 1 — Route */
  cardGridRouteWeb: Platform.select<ViewStyle>({
    web: { gridColumn: 1, gridRow: 1 } as unknown as ViewStyle,
    default: {},
  }),
  /** Row 1 col 2 — Client & commercials */
  cardGridClientWeb: Platform.select<ViewStyle>({
    web: { gridColumn: 2, gridRow: 1 } as unknown as ViewStyle,
    default: {},
  }),
  /** Row 2 full width — Load */
  cardGridLoadWeb: Platform.select<ViewStyle>({
    web: { gridColumn: "1 / -1", gridRow: 2 } as unknown as ViewStyle,
    default: {},
  }),
  cardDesktopEnterprise: Platform.select<ViewStyle>({
    web: {
      padding: 18,
      borderRadius: 12,
      marginBottom: 0,
    } as ViewStyle,
    default: {},
  }),
  cardHeadDesktopEnterprise: {
    paddingBottom: 10,
    marginBottom: 12,
  },
  cardTitleDesktopEnterprise: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    marginBottom: 10,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  cardCompact: {
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 6,
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    ...FinanceTxnTypography.partyTitle,
    fontSize: 9,
    letterSpacing: 0.3,
    fontStyle: "normal",
    fontWeight: "800",
    color: Theme.darkBackground,
  },
  cardTitleCompact: {
    fontSize: 9,
    letterSpacing: 0.45,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
    marginBottom: 3,
    color: Theme.textMutedDemo,
  },
  fieldLabelDense: {
    fontSize: ADD_TRIP_FORM.labelSize,
    marginBottom: ADD_TRIP_FORM.labelSpacing,
    letterSpacing: 0.45,
    lineHeight: ADD_TRIP_FORM.labelLine,
    textTransform: "uppercase",
  },
  formFieldShell: {
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 7,
    minHeight: 36,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceForm,
  },
  formFieldInput: {
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "normal",
    minHeight: 36,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimary,
  },
  formFieldInputDense: {
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    minHeight: ADD_TRIP_FORM.fieldHeight,
    marginBottom: ADD_TRIP_FORM.fieldGap,
  },
  cardWizardStep: {
    marginBottom: 0,
  },
  quickDateRowDense: {
    gap: 4,
    marginBottom: 4,
  },
  quickDateChipDense: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickDateChipTextDense: {
    fontSize: 11,
    fontStyle: "normal",
    letterSpacing: 0.3,
  },
  gridRow: { gap: 10 },
  gridRowWide: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  gridCol: { flex: 1, minWidth: 0 },
  /** Wide web: keep ISO date field from stretching across the whole column (tons stays aligned with drop). */
  routeDateInputCapWeb: Platform.select<ViewStyle>({
    web: {
      maxWidth: 300,
      width: "100%",
      alignSelf: "flex-start",
    },
    default: {},
  }),
  routePreviewPanel: {
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 2px 12px rgba(15,23,42,0.07)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
      },
    }),
  },
  routePreviewHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  routePreviewHeroText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    fontStyle: "normal",
    lineHeight: 18,
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
  routePreviewMetrics: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.cardWhite,
    borderTopWidth: 0,
  },
  routePreviewMetricCol: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  routePreviewMetricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  routeMetricLab: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMutedDemo,
    marginBottom: 3,
  },
  routeMetricVal: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 9,
    lineHeight: 13,
  },
  mutedSmall: {
    fontSize: 12,
    color: Theme.textMuted,
    marginBottom: 8,
  },
  clientList: { maxHeight: 280 },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    marginBottom: 10,
    backgroundColor: Theme.cardWhite,
  },
  clientCardRowSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.cardWhite,
  },
  /** Minimized selected client — matches Create Trip summary chip. */
  selectionSummaryCard: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.primary,
  },
  selectionSummaryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  selectionSummarySub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginTop: 2,
  },
  selectionSummaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.tripSelectionInsetBorder,
    backgroundColor: Theme.tripSelectionInsetBg,
  },
  selectionSummaryPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clientMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 8,
  },
  clientName: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  clientNameOn: { color: Theme.primary },
  clientAvatar: {
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
  },
  clientAvatarOn: {
    borderWidth: 2,
    borderColor: Theme.primary,
  },
  clientMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  clientSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    flex: 1,
  },
  radioOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: Theme.surfaceForm,
  },
  radioOuterOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.cardWhite,
  },
  priceShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 12,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    marginBottom: 6,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select<ViewStyle>({
      web: {
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      },
      default: {},
    }),
  },
  priceShellSelected: {
    borderColor: Theme.primary,
  },
  priceShellError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
  },
  priceRupeeInline: {
    flexShrink: 0,
  },
  priceInput: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: "600",
    minHeight: 36,
    backgroundColor: "transparent",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    ...Platform.select({
      web: {
        outlineStyle: "none" as const,
        width: "100%" as const,
        maxWidth: "100%" as const,
        boxSizing: "border-box" as const,
      },
      default: {},
    }),
  },
  priceInputCompact: {
    fontSize: 16,
    paddingVertical: 12,
  },
  supplierPriceInput: {
    color: Theme.primary,
    fontWeight: "800",
  },
  infoCallout: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  infoCalloutText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
  },
  supplierSection: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  supplierLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  estBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  estBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  blobA: {
    position: "absolute",
    top: "18%",
    left: "-12%",
    width: 280,
    height: 280,
    borderRadius: 200,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    zIndex: -1,
  },
  blobB: {
    position: "absolute",
    bottom: "-8%",
    right: "-8%",
    width: 220,
    height: 220,
    borderRadius: 200,
    backgroundColor: "rgba(232, 33, 39, 0.06)",
    zIndex: -1,
  },
  noAccessWrap: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: "center",
  },
  noAccessText: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: "center",
  },
});
