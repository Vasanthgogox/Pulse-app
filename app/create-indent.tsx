/**
 * Create Indent — Deploy New Load.
 * Full-screen form: origin, destination, client, budget, supplier target, vehicle, load type, weight, pickup date.
 */
import { TeslaHeader } from "@/components/TeslaHeader";
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
import {
    getIndentById,
    shareDraftIndent,
    updateIndentDraft,
} from "@/features/indents/services/indents.service";
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
import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View
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
  const [clientSearch, setClientSearch] = useState("");
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
    },
    [update],
  );

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    const matches = clients.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const person = (c.contact_person ?? "").toLowerCase();
      const phone = String(
        (c as { phone?: string | null }).phone ?? "",
      ).toLowerCase();
      return name.includes(q) || person.includes(q) || phone.includes(q);
    });
    // Keep selected client visible even if it doesn't match current query.
    if (form.client_id) {
      const selected = clients.find((c) => c.id === form.client_id);
      if (selected && !matches.some((c) => c.id === selected.id)) {
        return [selected, ...matches];
      }
    }
    return matches;
  }, [clientSearch, clients, form.client_id]);

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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top}
      >
        <View style={[styles.container, { paddingBottom: insets.bottom }]}>
          <TeslaHeader
            title="Create Indent"
            subtitle="Deploy New Load"
            variant="dark"
            showBack
            onBack={handleBackPress}
            hideRightIcons
          />
          <View style={styles.noAccessWrap}>
            <Text style={styles.noAccessText}>
              You don't have permission to create indents.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

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
  const stackActionButtons = windowWidth < 760;
  const stackFieldGrid = windowWidth < 920;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.container}>
        <TeslaHeader
          title="Create Indent"
          subtitle="Deploy New Load"
          variant="dark"
          showBack
          onBack={handleBackPress}
          hideRightIcons
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal:
                windowWidth >= 1024 ? 0 : Layout.screenPaddingHorizontal,
            },
            { paddingBottom: insets.bottom + 120 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
          scrollEnabled={!pickupDropdownOpen && !dropDropdownOpen}
        >
          <View style={styles.sheet}>
            <View style={styles.stepCard}>
              <View style={styles.stepCardHead}>
                <View style={styles.stepChip}>
                  <Text style={styles.stepChipText}>01</Text>
                </View>
                <Text style={styles.stepCardTitle}>Route & Vehicle</Text>
              </View>
              <View style={styles.routeCard}>
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, styles.routeDotFirst]}>
                    <Text style={styles.routeDotLabel}>Origin</Text>
                    <Text
                      style={
                        form.pickup_area.trim()
                          ? styles.routeDotValue
                          : styles.routeDotPlaceholder
                      }
                      numberOfLines={1}
                    >
                      {form.pickup_area.trim() || "Origin node"}
                    </Text>
                  </View>
                  <View style={styles.routeArrow}>
                    <FontAwesome
                      name="long-arrow-right"
                      size={14}
                      color={Theme.textMuted}
                    />
                  </View>
                  <View style={[styles.routeDot, styles.routeDotLast]}>
                    <Text style={styles.routeDotLabel}>Destination</Text>
                    <Text
                      style={
                        form.drop_location.trim()
                          ? styles.routeDotValue
                          : styles.routeDotPlaceholder
                      }
                      numberOfLines={1}
                    >
                      {form.drop_location.trim() || "Destination node"}
                    </Text>
                  </View>
                </View>
              </View>
              <View
                style={[
                  styles.sheetGrid,
                  stackFieldGrid && styles.sheetGridStacked,
                ]}
              >
                <View style={styles.sheetField}>
                  <Text style={styles.sheetLabel}>Origin Node</Text>
                  <LocationSearchField
                    label=""
                    placeholder="Enter origin node"
                    value={form.pickup_area}
                    onChangeText={(t) => {
                      update({ pickup_area: t });
                      setPickupLat(null);
                      setPickupLon(null);
                    }}
                    onSelectPlace={(_name, coords) => {
                      update({ pickup_area: compactLocationLabel(_name) });
                      setPickupLat(coords.lat);
                      setPickupLon(coords.lon);
                    }}
                    inputStyle={[
                      styles.sheetInput,
                      errors.pickup_area && styles.inputError,
                    ]}
                    labelStyle={styles.hiddenLabel}
                    onDropdownOpenChange={setPickupDropdownOpen}
                  />
                  {errors.pickup_area ? (
                    <Text style={styles.errorText}>{errors.pickup_area}</Text>
                  ) : null}
                </View>
                <View style={styles.sheetField}>
                  <Text style={styles.sheetLabel}>Destination Node</Text>
                  <LocationSearchField
                    label=""
                    placeholder="Enter destination node"
                    value={form.drop_location}
                    onChangeText={(t) => {
                      update({ drop_location: t });
                      setDropLat(null);
                      setDropLon(null);
                    }}
                    onSelectPlace={(_name, coords) => {
                      update({ drop_location: compactLocationLabel(_name) });
                      setDropLat(coords.lat);
                      setDropLon(coords.lon);
                    }}
                    inputStyle={[
                      styles.sheetInput,
                      errors.drop_location && styles.inputError,
                    ]}
                    labelStyle={styles.hiddenLabel}
                    onDropdownOpenChange={setDropDropdownOpen}
                  />
                  {errors.drop_location ? (
                    <Text style={styles.errorText}>{errors.drop_location}</Text>
                  ) : null}
                </View>
              </View>
              {routeLoading ||
              routeDistanceKm != null ||
              routeEtaLabel != null ? (
                <View style={styles.routeStatsRow}>
                  <View style={styles.routeStat}>
                    <Text style={styles.routeStatLabel}>Distance</Text>
                    <Text style={styles.routeStatValue}>
                      {routeLoading
                        ? "…"
                        : routeDistanceKm != null
                          ? `${routeDistanceKm} km`
                          : "—"}
                    </Text>
                  </View>
                  <View style={styles.routeStat}>
                    <Text style={styles.routeStatLabel}>ETA</Text>
                    <Text style={styles.routeStatValue}>
                      {routeLoading ? "…" : (routeEtaLabel ?? "—")}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.stepCard}>
              <View style={styles.stepCardHead}>
                <View style={styles.stepChip}>
                  <Text style={styles.stepChipText}>02</Text>
                </View>
                <Text style={styles.stepCardTitle}>Commercial Details</Text>
              </View>
              <View style={styles.sheetSection}>
                <Text style={styles.sheetLabel}>Client</Text>
                <View style={styles.clientSearchRow}>
                  <FontAwesome
                    name="search"
                    size={14}
                    color={Theme.textMuted}
                    style={styles.clientSearchIcon}
                  />
                  <TextInput
                    style={styles.clientSearchInput}
                    placeholder="Search client…"
                    placeholderTextColor={Theme.textMuted}
                    value={clientSearch}
                    onChangeText={setClientSearch}
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    returnKeyType="search"
                  />
                  {clientSearch.trim() ? (
                    <TouchableOpacity
                      style={styles.clientSearchClear}
                      onPress={() => setClientSearch("")}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Clear client search"
                    >
                      <FontAwesome
                        name="times-circle"
                        size={16}
                        color={Theme.textMuted}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {clientsLoading ? (
                  <View style={styles.partnersWrap}>
                    <Text style={styles.partnersPlaceholder}>Loading…</Text>
                  </View>
                ) : filteredClients.length === 0 ? (
                  <View style={styles.partnersWrap}>
                    <Text style={styles.partnersPlaceholder}>
                      {clients.length === 0
                        ? "No clients. Add one below."
                        : "No matching clients."}
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.partnersScrollContent}
                  >
                    {filteredClients.map((client) => {
                      const isSelected = form.client_id === client.id;
                      return (
                        <TouchableOpacity
                          key={client.id}
                          style={[
                            styles.partnerChip,
                            isSelected && styles.partnerChipSelected,
                          ]}
                          onPress={() => handleSelectClient(client)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.partnerChipText,
                              isSelected && styles.partnerChipTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {client.name || client.contact_person || "—"}
                          </Text>
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
                  <Text style={styles.addClientBtnText}>Add new client</Text>
                </TouchableOpacity>
                {errors.client_name ? (
                  <Text style={styles.errorText}>{errors.client_name}</Text>
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
                      }
                    }}
                    organizationId={orgId}
                    noOrganizationMessage={null}
                  />
                </Modal>
              ) : null}

              <View style={[styles.sheetSection, styles.commercialHighlight]}>
                <Text style={styles.sheetLabel}>Client Rate (₹)</Text>
                <TextInput
                  style={[
                    styles.sheetInput,
                    errors.client_price && styles.inputError,
                  ]}
                  value={form.client_price}
                  onChangeText={(t) => update({ client_price: t })}
                  placeholder="Enter Amount"
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="decimal-pad"
                />
                {errors.client_price ? (
                  <Text style={styles.errorText}>{errors.client_price}</Text>
                ) : null}
              </View>

              <View style={[styles.sheetSection, styles.commercialHighlight]}>
                <Text style={styles.sheetLabel}>Supplier Target (₹)</Text>
                <TextInput
                  style={[
                    styles.sheetInput,
                    errors.supplier_target && styles.inputError,
                  ]}
                  value={form.supplier_target}
                  onChangeText={(t) => update({ supplier_target: t })}
                  placeholder="0"
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="decimal-pad"
                />
                {errors.supplier_target ? (
                  <Text style={styles.errorText}>{errors.supplier_target}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.stepCard}>
              <View style={styles.stepCardHead}>
                <View style={styles.stepChip}>
                  <Text style={styles.stepChipText}>03</Text>
                </View>
                <Text style={styles.stepCardTitle}>Load Specifics</Text>
              </View>
              <View
                style={[
                  styles.sheetGrid,
                  stackFieldGrid && styles.sheetGridStacked,
                ]}
              >
                <View style={styles.sheetField}>
                  <Text style={styles.sheetLabel}>Vehicle</Text>
                  {vehicleTypeIsOther ? (
                    <TextInput
                      style={[
                        styles.sheetInput,
                        errors.vehicle_type && styles.inputError,
                      ]}
                      value={form.vehicle_type}
                      onChangeText={(t) => update({ vehicle_type: t })}
                      placeholder="Type vehicle"
                      placeholderTextColor={Theme.textMuted}
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
                    <Text style={styles.errorText}>{errors.vehicle_type}</Text>
                  ) : null}
                </View>
                <View style={styles.sheetField}>
                  <Text style={styles.sheetLabel}>Load Type</Text>
                  <TextInput
                    style={[
                      styles.sheetInput,
                      errors.load_type && styles.inputError,
                    ]}
                    value={form.load_type}
                    onChangeText={(t) => update({ load_type: t })}
                    placeholder="e.g. FMCG"
                    placeholderTextColor={Theme.textMuted}
                  />
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
                  placeholder="e.g. 10 (tons)"
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="decimal-pad"
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
                animationType="slide"
                onRequestClose={() => setVehicleTypePickerOpen(false)}
              >
                <KeyboardAvoidingView
                  style={styles.datePickerBackdrop}
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                  <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={() => setVehicleTypePickerOpen(false)}
                  />
                  <View
                    style={[
                      styles.datePickerSheet,
                      {
                        paddingBottom: insets.bottom + 16,
                        maxHeight: Dimensions.get("window").height * 0.8,
                      },
                    ]}
                  >
                    <View style={styles.datePickerHeader}>
                      <Text style={styles.datePickerTitle}>Select Vehicle</Text>
                      <TouchableOpacity
                        onPress={() => setVehicleTypePickerOpen(false)}
                        hitSlop={12}
                      >
                        <Text style={styles.datePickerDone}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                      style={{
                        maxHeight: Dimensions.get("window").height * 0.7,
                      }}
                    >
                      <View style={styles.vehicleOptionSection}>
                        <Text style={styles.vehicleOptionSectionTitle}>
                          Categories
                        </Text>
                      </View>
                      {VEHICLE_CATEGORY_LABELS.map((opt) => (
                        <TouchableOpacity
                          key={opt}
                          style={[
                            styles.vehicleOptionRow,
                            form.vehicle_type === opt &&
                              !vehicleTypeIsOther &&
                              styles.vehicleOptionRowActive,
                          ]}
                          onPress={() => {
                            setVehicleTypeIsOther(false);
                            update({ vehicle_type: opt });
                            setVehicleTypePickerOpen(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.vehicleOptionText,
                              form.vehicle_type === opt &&
                                !vehicleTypeIsOther &&
                                styles.vehicleOptionTextActive,
                            ]}
                          >
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      <View style={styles.vehicleOptionSection}>
                        <Text style={styles.vehicleOptionSectionTitle}>
                          Presets & Lengths
                        </Text>
                      </View>
                      {BODY_LENGTH_SELECT_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={normalizeBodyLengthKey(opt)}
                          style={[
                            styles.vehicleOptionRow,
                            form.vehicle_type === opt &&
                              !vehicleTypeIsOther &&
                              styles.vehicleOptionRowActive,
                          ]}
                          onPress={() => {
                            setVehicleTypeIsOther(false);
                            update({ vehicle_type: opt });
                            setVehicleTypePickerOpen(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.vehicleOptionText,
                              form.vehicle_type === opt &&
                                !vehicleTypeIsOther &&
                                styles.vehicleOptionTextActive,
                            ]}
                          >
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      <View style={styles.vehicleOptionSection}>
                        <Text style={styles.vehicleOptionSectionTitle}>
                          Custom
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.vehicleOptionRow,
                          vehicleTypeIsOther && styles.vehicleOptionRowActive,
                          { borderBottomWidth: 0 },
                        ]}
                        onPress={() => {
                          setVehicleTypeIsOther(true);
                          update({ vehicle_type: "" });
                          setVehicleTypePickerOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.vehicleOptionText,
                            vehicleTypeIsOther &&
                              styles.vehicleOptionTextActive,
                          ]}
                        >
                          {OTHER_LABEL} — type manually
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                </KeyboardAvoidingView>
              </Modal>
            ) : null}

            <View style={styles.actionHelpBox}>
              <Text style={styles.actionHelpTitle}>Save Draft</Text>
              <Text style={styles.actionHelpText}>
                Indent stays editable. You can save updates again and share
                later.
              </Text>
              <Text style={styles.actionHelpTitle}>Share to Network</Text>
              <Text style={styles.actionHelpText}>
                Shared indents are broadcast and become read-only.
              </Text>
            </View>

            <View style={styles.actionFooterBar}>
              <View
                style={[
                  styles.actionButtonsRow,
                  stackActionButtons && styles.actionButtonsRowStacked,
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.draftBtn,
                    stackActionButtons && styles.actionBtnStacked,
                    submitting && styles.submitBtnDisabled,
                  ]}
                  onPress={persistDraft}
                  disabled={submitting}
                  activeOpacity={0.8}
                >
                  {submitting ? (
                    <ActivityIndicator
                      size="small"
                      color={Theme.textPrimaryDark}
                    />
                  ) : (
                    <Text style={styles.draftBtnText}>Save Draft</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    stackActionButtons && styles.actionBtnStacked,
                    (!canSubmit || submitting) && styles.submitBtnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!canSubmit || submitting}
                  activeOpacity={0.8}
                >
                  {submitting ? (
                    <ActivityIndicator
                      size="small"
                      color={Theme.buttonPrimaryText}
                    />
                  ) : (
                    <Text style={styles.submitBtnText}>Share to Network</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
        {/* Modals */}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    flexGrow: 1,
    width: "100%",
    minWidth: "100%",
    alignSelf: "stretch",
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
  vehicleOptionSection: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  vehicleOptionSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  vehicleOptionRow: {
    paddingVertical: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  vehicleOptionRowActive: {
    backgroundColor: Theme.surface,
  },
  vehicleOptionText: {
    fontSize: 15,
    color: Theme.textPrimaryDark,
  },
  vehicleOptionTextActive: {
    fontWeight: "700",
    color: Theme.primary,
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
  routeStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -2,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.darkSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    gap: 10,
  },
  routeCard: {
    backgroundColor: Theme.darkSurface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeDot: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.darkInputBg,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  routeDotFirst: { marginLeft: 0 },
  routeDotLast: { marginRight: 0 },
  routeDotLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  routeDotValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  routeDotPlaceholder: {
    fontSize: 13,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  routeArrow: {
    paddingHorizontal: 4,
  },
  routeStat: {
    flex: 1,
    minWidth: 0,
  },
  routeStatLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  routeStatValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  actionHelpBox: {
    marginTop: 8,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 4,
  },
  actionHelpTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  actionHelpText: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginBottom: 4,
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
