/**
 * Create Indent — Deploy New Load.
 * Layout aligned with Create Trip (AddTripModalLayout + section cards + floating summary).
 */
import { CreateTripSheetSearchInput } from "@/components/CreateTripSheetSearchInput";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { ThemedConfirmModal } from "@/components/ThemedConfirmModal";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    AddClientModal,
    createClient,
    getClientsByOrganization,
    type ClientRow,
} from "@/features/clients";
import { createIndent, type CreateIndentInput } from "@/features/indents";
import { LOAD_TYPES } from "@/features/indents/constants";
import {
    getIndentById,
    shareDraftIndent,
    updateIndentDraft,
} from "@/features/indents/services/indents.service";
import { AddTripModalLayout } from "@/features/trips/components/add-trip/AddTripModalLayout";
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
import { useInvalidateIndents } from "@/lib/queries";
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
import { getOptimalRoute } from "@/services/routingService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
    ArrowRight,
    CheckCircle2,
    Clock,
    FileEdit,
    IndianRupee,
    Info,
    MapPin,
    Navigation,
    Package,
    Share2,
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

interface FormState {
  client_name: string;
  client_id: string | null;
  pickup_area: string;
  drop_location: string;
  vehicle_type: string;
  load_type: string;
  weight: string;
  client_price: string;
  supplier_target: string;
  pickup_date: string;
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
  const [showAddClientModal, setShowAddClientModal] = useState(false);
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
  /** Hover / keyboard focus: which primary action’s help copy to show above the buttons. */
  const [actionHelpHint, setActionHelpHint] = useState<
    null | "draft" | "share"
  >(null);
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

  const openLoadTypePickerNext = useCallback(() => {
    requestAnimationFrame(() => {
      setLoadTypePickerOpen(true);
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

  const onShareActionFocus = useCallback(() => {
    cancelActionHintBlurTimer();
    setActionHelpHint("share");
  }, [cancelActionHintBlurTimer]);

  useEffect(
    () => () => cancelActionHintBlurTimer(),
    [cancelActionHintBlurTimer],
  );

  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const pickerCardMaxW = Math.min(windowWidth - 48, 520);

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

  const showDialog = useCallback((title: string, message?: string) => {
    setAlertState({ visible: true, title, message: message ?? "" });
  }, []);

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

  useEffect(() => {
    if (!orgId) return;
    setClientsLoading(true);
    getClientsByOrganization(orgId).then(({ clients: list }) => {
      setClients(list ?? []);
      setClientsLoading(false);
    });
  }, [orgId]);

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

  useEffect(() => {
    const cp = parseFloat(String(form.client_price).replace(/,/g, ""));
    if (!Number.isFinite(cp) || cp <= 0) return;
    if ((form.supplier_target ?? "").trim() !== "") return;
    update({ supplier_target: String(Math.round(cp * 0.9)) });
  }, [form.client_price, form.supplier_target, update]);

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
      focusField(clientPriceInputRef);
    },
    [focusField, form.client_id, showDialog, update],
  );

  const handleBackPress = useCallback(() => {
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
  }, [form, lastSavedForm, safeBack, confirmDialog]);

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
    const shouldShare = await confirmDialog(
      "Share with Network?",
      "Once shared, this indent becomes read-only and cannot be edited.",
      "Share now",
    );
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
          router.replace({
            pathname: ROUTES.TABS.NETWORK,
            params: { tab: "load", indentId: indent.id },
          } as import("expo-router").Href);
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
        router.replace({
          pathname: ROUTES.TABS.NETWORK,
          params: { tab: "load", indentId: indent.id },
        } as import("expo-router").Href);
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
    confirmDialog,
  ]);

  if (!canCreate) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <AddTripModalLayout
          title="Create Indent"
          subtitle="Deploy New Load"
          submitLabel=""
          canSubmit={false}
          showFooter={false}
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

  const canSaveDraft =
    Boolean(orgId) && !submitting && hasIndentDraftProgress(form);

  const isWide = windowWidth >= 720;
  const stackActionButtons = windowWidth < 760;
  const baseInputArr = [styles.tripInput, inputStyle];
  const webPointer =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <AddTripModalLayout
        title="Create Indent"
        subtitle="Deploy New Load"
        submitLabel="Share to Network"
        canSubmit={canSubmit}
        submitting={submitting}
        showFooter={false}
        onClose={handleBackPress}
        onSubmit={handleSubmit}
      >
        <View style={styles.pageWrap}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 160 },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            showsVerticalScrollIndicator={false}
            scrollEnabled={
              !pickupDropdownOpen &&
              !dropDropdownOpen &&
              !vehicleTypePickerOpen &&
              !loadTypePickerOpen
            }
          >
            <View
              style={[
                styles.contentMax,
                {
                  paddingHorizontal: isWide
                    ? 24
                    : Layout.screenPaddingHorizontal,
                },
              ]}
            >
              {/* 01 Route */}
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>01</Text>
                  </View>
                  <Text style={styles.cardTitle}>Route Details</Text>
                </View>

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
                      leadingIcon={<MapPin size={18} color={Theme.iconMuted} />}
                      inputStyle={[
                        ...baseInputArr,
                        errors.pickup_area && styles.inputError,
                      ]}
                      labelStyle={[styles.fieldLabel, labelStyle]}
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
                        <Navigation size={18} color={Theme.iconMuted} />
                      }
                      inputStyle={[
                        ...baseInputArr,
                        errors.drop_location && styles.inputError,
                      ]}
                      labelStyle={[styles.fieldLabel, labelStyle]}
                      onDropdownOpenChange={setDropDropdownOpen}
                    />
                    {errors.drop_location ? (
                      <Text style={styles.errorText}>
                        {errors.drop_location}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {form.pickup_area.trim() && form.drop_location.trim() ? (
                  <View style={styles.routePreviewPanel}>
                    <View style={styles.routePreviewHero}>
                      <ArrowRight
                        size={20}
                        color={Theme.teslaRed}
                        strokeWidth={2.5}
                      />
                      <Text style={styles.routePreviewHeroText} numberOfLines={2}>
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

              {/* 02 Commercial */}
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>02</Text>
                  </View>
                  <Text style={styles.cardTitle}>Client & Commercials</Text>
                </View>
                <View style={[styles.gridRow, isWide && styles.gridRowWide]}>
                  <View style={styles.gridCol}>
                    <Text style={[styles.fieldLabel, labelStyle]}>
                      Select client
                    </Text>
                    {clientsLoading ? (
                      <ActivityIndicator color={Theme.iconPrimary} />
                    ) : clients.length === 0 ? (
                      <Text style={styles.mutedSmall}>
                        No clients yet. Add one below.
                      </Text>
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
                                selected && styles.clientCardOn,
                                Platform.OS === "web"
                                  ? ({ cursor: "pointer" } as ViewStyle)
                                  : null,
                              ]}
                              onPress={() => handleSelectClient(client)}
                              activeOpacity={0.85}
                            >
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
                                    <Clock size={11} color={Theme.textMuted} />
                                    <Text
                                      style={styles.clientSub}
                                      numberOfLines={1}
                                    >
                                      {client.address}
                                    </Text>
                                  </View>
                                ) : null}
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
                                    color={Theme.iconPrimary}
                                  />
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                    <TouchableOpacity
                      style={styles.addClientBtn}
                      onPress={() => setShowAddClientModal(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addClientBtnText}>
                        Add new client
                      </Text>
                    </TouchableOpacity>
                    {errors.client_name ? (
                      <Text style={styles.errorText}>{errors.client_name}</Text>
                    ) : null}
                  </View>

                  <View style={styles.gridCol}>
                    <Text style={[styles.fieldLabel, labelStyle]}>
                      Client sales price (₹) *
                    </Text>
                    <View style={styles.priceWrap}>
                      <IndianRupee
                        size={20}
                        color={Theme.iconMuted}
                        style={styles.rupeeIcon}
                      />
                      <TextInput
                        style={[
                          styles.priceInput,
                          errors.client_price && styles.inputError,
                        ]}
                        value={form.client_price}
                        onChangeText={(t) => update({ client_price: t })}
                        ref={clientPriceInputRef}
                        placeholder="0"
                        placeholderTextColor={Theme.placeholder}
                        keyboardType="decimal-pad"
                        autoCorrect={false}
                        returnKeyType="next"
                        onSubmitEditing={() => focusField(supplierTargetInputRef)}
                      />
                    </View>
                    {errors.client_price ? (
                      <Text style={styles.errorText}>
                        {errors.client_price}
                      </Text>
                    ) : null}
                    <View style={styles.infoCallout}>
                      <Info size={16} color={Theme.iconPrimary} />
                      <Text style={styles.infoCalloutText}>
                        Revenue should match what you bill this client for this
                        lane. Adjust if this indent differs.
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.supplierSection}>
                  <View style={styles.supplierLabelRow}>
                    <Text style={[styles.fieldLabel, labelStyle]}>
                      Supplier target (₹)
                    </Text>
                    <View style={styles.estBadge}>
                      <Text style={styles.estBadgeText}>Est. target</Text>
                    </View>
                  </View>
                  <View style={styles.priceWrap}>
                    <IndianRupee
                      size={20}
                      color={Theme.primary}
                      style={styles.rupeeIcon}
                    />
                    <TextInput
                      style={[
                        styles.priceInput,
                        styles.supplierPriceInput,
                        errors.supplier_target && styles.inputError,
                      ]}
                      value={form.supplier_target}
                      onChangeText={(t) => update({ supplier_target: t })}
                      ref={supplierTargetInputRef}
                      placeholder="0"
                      placeholderTextColor={Theme.textMuted}
                      keyboardType="decimal-pad"
                      autoCorrect={false}
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(weightInputRef)}
                    />
                  </View>
                  {errors.supplier_target ? (
                    <Text style={styles.errorText}>
                      {errors.supplier_target}
                    </Text>
                  ) : null}
                </View>

                {orgId ? (
                  <Modal
                    visible={showAddClientModal}
                    animationType="slide"
                    presentationStyle="fullScreen"
                    onRequestClose={() => setShowAddClientModal(false)}
                  >
                    <AddClientModal
                      onClose={() => setShowAddClientModal(false)}
                      onComplete={async (data) => {
                        const { error, client } = await createClient(orgId, {
                          contact_person: data.contactPerson,
                          phone: data.phone,
                          organization_name: data.organizationName || undefined,
                        });
                        if (error) {
                          showDialog("Could not add client", error.message);
                          throw error;
                        }
                        if (client) {
                          const clientName =
                            client.name ?? client.contact_person ?? "";
                          if (!clientName.trim()) {
                            showDialog(
                              "Invalid Client",
                              "Added client has no name. Please ensure client has a valid name or contact person.",
                            );
                            return;
                          }
                          update({
                            client_id: client.id,
                            client_name: clientName,
                          });
                          setClients((prev) => [...prev, client]);
                          focusField(clientPriceInputRef);
                        }
                      }}
                      organizationId={orgId}
                      noOrganizationMessage={null}
                    />
                  </Modal>
                ) : null}
              </View>

              {/* 03 Load */}
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>03</Text>
                  </View>
                  <Text style={styles.cardTitle}>Load Specifics</Text>
                </View>
                <View
                  style={[styles.sheetGrid, !isWide && styles.sheetGridStacked]}
                >
                  <View style={styles.sheetField}>
                    <Text style={styles.sheetLabel}>Vehicle</Text>
                    {vehicleTypeIsOther ? (
                      <TextInput
                        style={[
                          styles.sheetInput,
                          errors.vehicle_type && styles.inputError,
                        ]}
                        ref={vehicleTypeInputRef}
                        value={form.vehicle_type}
                        onChangeText={(t) => update({ vehicle_type: t })}
                        placeholder="Type vehicle"
                        placeholderTextColor={Theme.textMuted}
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
                        onPress={() => setVehicleTypePickerOpen(true)}
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
                        onPress={() => setVehicleTypePickerOpen(true)}
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
                  <View style={styles.sheetField}>
                    <Text style={styles.sheetLabel}>Load Type</Text>
                    <TouchableOpacity
                      style={[
                        styles.sheetInput,
                        { justifyContent: "center" },
                        webPointer,
                        errors.load_type && styles.inputError,
                      ]}
                      onPress={() => setLoadTypePickerOpen(true)}
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

                <View style={styles.sheetSection}>
                  <Text style={styles.sheetLabel}>Weight (Tons)</Text>
                  <TextInput
                    style={[
                      styles.sheetInput,
                      errors.weight && styles.inputError,
                    ]}
                    value={form.weight}
                    onChangeText={(t) =>
                      update({ weight: t.replace(/[^\d.]/g, "").slice(0, 12) })
                    }
                    ref={weightInputRef}
                    placeholder="e.g. 10 (tons)"
                    placeholderTextColor={Theme.textMuted}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={openPickupDateNext}
                  />
                  {errors.weight ? (
                    <Text style={styles.errorText}>{errors.weight}</Text>
                  ) : null}
                </View>

                <View style={styles.sheetSection}>
                  <Text style={styles.sheetLabel}>Pickup date</Text>
                  <View style={styles.quickDateRow}>
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
                            styles.quickDateChip,
                            isActive && styles.quickDateChipActive,
                          ]}
                          onPress={() => update({ pickup_date: iso })}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.quickDateChipText,
                              isActive && styles.quickDateChipTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.sheetInput,
                      styles.dateTouchable,
                      errors.pickup_date && styles.inputError,
                    ]}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={
                        form.pickup_date
                          ? styles.dateTouchableText
                          : styles.dateTouchablePlaceholder
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
                  {errors.pickup_date ? (
                    <Text style={styles.errorText}>{errors.pickup_date}</Text>
                  ) : null}

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
                                <Text style={styles.datePickerDone}>Done</Text>
                              </TouchableOpacity>
                            </View>
                            <DateTimePicker
                              value={
                                form.pickup_date
                                  ? new Date(form.pickup_date + "T12:00:00")
                                  : new Date()
                              }
                              mode="date"
                              display="spinner"
                              minimumDate={new Date()}
                              onChange={(_, date) =>
                                date && update({ pickup_date: toISODate(date) })
                              }
                            />
                          </View>
                        </TouchableOpacity>
                      </Modal>
                    ))}
                </View>
              </View>

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
                              size={18}
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
                                        size={18}
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
                                        size={22}
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
                                        size={18}
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
                                        size={22}
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
                              <Truck size={18} color={Theme.iconPrimary} />
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
                                size={22}
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
                              size={18}
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
                                      size={18}
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
                                      size={22}
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
                        {actionHelpHint === "draft"
                          ? "Save Draft"
                          : "Share to Network"}
                      </Text>
                      <Text style={styles.actionHelpTooltipText}>
                        {actionHelpHint === "draft"
                          ? "Indent stays editable. You can save updates again and share later."
                          : "Shared indents are broadcast and become read-only."}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.actionButtonsRow,
                      stackActionButtons && styles.actionButtonsRowStacked,
                    ]}
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
                      style={[
                        styles.actionBtnHoverCell,
                        stackActionButtons && styles.actionBtnHoverCellStacked,
                      ]}
                      {...(Platform.OS === "web"
                        ? {
                            onMouseEnter: () => setActionHelpHint("draft"),
                          }
                        : {})}
                    >
                      <TouchableOpacity
                        style={[
                          styles.draftBtn,
                          stackActionButtons && styles.actionBtnStacked,
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
                            <FileEdit size={18} color={Theme.textPrimaryDark} />
                            <Text style={styles.draftBtnText}>Save Draft</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                    <View
                      style={[
                        styles.actionBtnHoverCell,
                        stackActionButtons && styles.actionBtnHoverCellStacked,
                      ]}
                      {...(Platform.OS === "web"
                        ? {
                            onMouseEnter: () => setActionHelpHint("share"),
                          }
                        : {})}
                    >
                      <TouchableOpacity
                        style={[
                          styles.submitBtn,
                          stackActionButtons && styles.actionBtnStacked,
                          (!canSubmit || submitting) &&
                            styles.submitBtnDisabled,
                        ]}
                        onPress={handleSubmit}
                        disabled={!canSubmit || submitting}
                        activeOpacity={0.8}
                        focusable
                        onFocus={onShareActionFocus}
                        onBlur={scheduleClearActionHelpHint}
                        accessibilityHint="Shared indents are broadcast and become read-only."
                      >
                        {submitting ? (
                          <ActivityIndicator
                            size="small"
                            color={Theme.buttonPrimaryText}
                          />
                        ) : (
                          <View style={styles.actionBtnInner}>
                            <Share2
                              size={18}
                              color={Theme.buttonMatteBlackText}
                            />
                            <Text style={styles.submitBtnText}>
                              Share to Network
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          {windowWidth >= 420 ? (
            <View
              style={[
                styles.previewCard,
                {
                  bottom: insets.bottom + 16,
                  right: Math.max(16, insets.right + 8),
                },
              ]}
              pointerEvents="box-none"
            >
              <View style={styles.previewHead}>
                <Text style={styles.previewHeadTitle}>Indent summary</Text>
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>Live</Text>
                </View>
              </View>
              <View style={styles.previewBody}>
                <View style={styles.previewLine}>
                  <Text style={styles.previewLab}>Pickup</Text>
                  <Text style={styles.previewVal} numberOfLines={2}>
                    {(form.pickup_area ?? "").trim() || "—"}
                  </Text>
                </View>
                <View style={styles.previewLine}>
                  <Text style={styles.previewLab}>Delivery</Text>
                  <Text style={styles.previewVal} numberOfLines={2}>
                    {(form.drop_location ?? "").trim() || "—"}
                  </Text>
                </View>
                {form.pickup_area.trim() && form.drop_location.trim() ? (
                  <View style={styles.previewRow2}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewLab}>Distance</Text>
                      <Text style={styles.previewVal}>
                        {routeLoading
                          ? "…"
                          : routeDistanceKm != null
                            ? `${routeDistanceKm} km`
                            : "—"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewLab}>ETA</Text>
                      <Text style={styles.previewVal}>
                        {routeLoading ? "…" : (routeEtaLabel ?? "—")}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.previewDivider} />
                <View style={styles.previewRow2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewLab}>Target pay</Text>
                    <Text style={[styles.previewVal, { color: Theme.primary }]}>
                      ₹{form.supplier_target.trim() || "0"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewLab}>Vehicle</Text>
                    <Text style={styles.previewVal} numberOfLines={1}>
                      {form.vehicle_type.trim() || "—"}
                    </Text>
                  </View>
                </View>
                <View style={styles.previewFoot}>
                  <Text style={styles.previewFootLeft}>
                    {(form.load_type ?? "").trim() || "Load"}
                  </Text>
                  <Text style={styles.previewFootRight} numberOfLines={1}>
                    {form.weight.trim() ? `${form.weight.trim()} T` : "—"}
                  </Text>
                </View>
              </View>
            </View>
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
    paddingTop: 4,
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
    gap: 12,
    marginBottom: 12,
  },
  sheetGridStacked: {
    flexDirection: "column",
  },
  sheetField: { flex: 1, minWidth: 0 },
  hiddenLabel: { height: 0, margin: 0, padding: 0, opacity: 0 },
  sheetSection: { marginBottom: 8 },
  sheetLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  sheetInput: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 52,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
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
  addClientBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    marginTop: 6,
  },
  addClientBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
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
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  quickDateChip: {
    flex: 1,
    minHeight: 44,
    minWidth: 110,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  quickDateChipActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surface,
  },
  quickDateChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  quickDateChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  dateTouchable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateTouchableText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  dateTouchablePlaceholder: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  dropdownTouchableText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  dropdownTouchablePlaceholder: {
    fontSize: 14,
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
  },
  pickerSheet: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  pickerSheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  pickerSheetTitles: {
    flex: 1,
    paddingRight: 12,
  },
  pickerSheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  pickerSheetSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  pickerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  pickerSearchShell: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  pickerScroll: {
    maxHeight: 340,
    minHeight: 120,
  },
  pickerScrollContent: {
    paddingBottom: 16,
  },
  pickerSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 12,
  },
  pickerRowSelected: {
    backgroundColor: Theme.surfaceLight,
  },
  pickerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerRowPrimary: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
  },
  pickerRowPrimarySelected: {
    fontWeight: "800",
    color: Theme.primary,
  },
  pickerRowEndSpacer: {
    width: 22,
    height: 22,
  },
  pickerEmptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  datePickerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  datePickerDone: {
    fontSize: 14,
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
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  actionBtnHoverCellStacked: {
    flex: 0,
    width: "100%",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionFooterBar: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  actionButtonsRowStacked: {
    flexDirection: "column",
  },
  actionBtnStacked: {
    flex: 0,
    width: "100%",
  },
  actionBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  draftBtn: {
    flex: 1,
    marginTop: 12,
    minHeight: Layout.minTouchTargetSize + 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  draftBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  submitBtn: {
    flex: 1,
    marginTop: 12,
    minHeight: Layout.minTouchTargetSize + 12,
    paddingVertical: 12,
    backgroundColor: Theme.buttonMatteBlack,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.buttonMatteBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonMatteBlackText,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
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
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    marginBottom: 16,
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
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 10,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.iconPrimary,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tripInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    minHeight: 52,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimary,
    ...Platform.select<ViewStyle>({
      web: { outlineStyle: "none" },
    }),
  },
  gridRow: { gap: 14 },
  gridRowWide: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  gridCol: { flex: 1, minWidth: 0 },
  routePreviewPanel: {
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 14,
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
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Theme.surfaceGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  routePreviewHeroText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.25,
    lineHeight: 20,
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
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  routePreviewMetricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  routeMetricLab: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.65,
    marginBottom: 4,
  },
  routeMetricVal: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.35,
    color: Theme.textPrimaryDark,
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
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    marginBottom: 10,
    backgroundColor: Theme.screenBackground,
  },
  clientCardOn: {
    borderColor: Theme.darkBackground,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  clientName: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  clientNameOn: { color: Theme.iconPrimary },
  clientMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  clientSub: {
    fontSize: 11,
    color: Theme.textMuted,
    flex: 1,
  },
  radioOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterOn: {
    borderColor: Theme.darkBackground,
    backgroundColor: Theme.screenBackground,
  },
  priceWrap: {
    position: "relative",
    marginBottom: 12,
  },
  rupeeIcon: {
    position: "absolute",
    left: 14,
    top: 18,
    zIndex: 1,
  },
  priceInput: {
    borderRadius: 16,
    paddingLeft: 44,
    paddingRight: 16,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: "800",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: Theme.surfaceForm,
    color: Theme.textPrimaryDark,
    ...Platform.select<ViewStyle>({
      web: { outlineStyle: "none" },
    }),
  },
  supplierPriceInput: {
    color: Theme.primary,
    fontWeight: "800",
  },
  infoCallout: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  infoCalloutText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  supplierSection: {
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  supplierLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
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
  previewCard: {
    position: "absolute",
    width: 300,
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    zIndex: 50,
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: "0 12px 40px rgba(15,23,42,0.15)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 10,
      },
    }),
  },
  previewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.darkSurface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewHeadTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Theme.textOnDark,
  },
  livePill: {
    backgroundColor: Theme.darkBackground,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  livePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  previewBody: { padding: 12, gap: 8 },
  previewLine: { gap: 4 },
  previewLab: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  previewVal: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  previewDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 4,
  },
  previewRow2: { flexDirection: "row", gap: 12 },
  previewFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    marginTop: 4,
  },
  previewFootLeft: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  previewFootRight: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    maxWidth: 140,
    textAlign: "right",
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
