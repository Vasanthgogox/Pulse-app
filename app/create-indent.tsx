/**
 * Create Indent — Deploy New Load.
 * Full-screen form: origin, destination, client, budget, supplier target, vehicle, load type, weight, pickup date.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { TeslaHeader } from '@/components/TeslaHeader';
import { useSafeBack } from '@/lib/useSafeBack';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { LocationSearchField } from '@/features/trips/components/add-trip/LocationSearchField';
import { getCapabilitiesFromProfile, getEffectivePermissions } from '@/lib/capabilities';
import { createIndent, type CreateIndentInput } from '@/features/indents';
import { getOptimalRoute } from '@/services/routingService';
import {
  AddClientModal,
  createClient,
  getClientsByOrganization,
  type ClientRow,
} from '@/features/clients';
import { VEHICLE_CATEGORY_LABELS, BODY_LENGTH_SELECT_OPTIONS, normalizeBodyLengthKey, OTHER_LABEL } from '@/features/vehicles/utils/vehicleFormOptions.util';
import {
  VALIDATION,
  dateISO,
  maxLength,
  nonNegativeAmount,
  positiveAmount,
  required,
  runValidators,
} from '@/lib/validation';
import { useInvalidateIndents } from '@/lib/queries';

function validateForm(state: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  // Client must be selected from list or added via Add Client (no free-text name).
  if (!state.client_id?.trim()) {
    errors.client_name = 'Select a client from the list or add a new one.';
  }
  const r = (key: keyof FormState, ...fns: ReturnType<typeof required>[]) => {
    const v = state[key];
    const val = typeof v === 'string' ? v : String(v ?? '');
    const err = runValidators(val, fns);
    if (err) errors[key as string] = err;
  };
  // client_name is set from selected client; still validate length when present
  if ((state.client_name ?? '').trim()) {
    const err = runValidators((state.client_name ?? '').trim(), [maxLength(VALIDATION.CLIENT_SUPPLIER_NAME_MAX_LENGTH)]);
    if (err) errors.client_name = err;
  }
  r('pickup_area', required(), maxLength(255));
  r('drop_location', required(), maxLength(255));
  const clientPriceErr = positiveAmount()(state.client_price);
  if (clientPriceErr) errors.client_price = clientPriceErr;
  const supplierTargetErr = nonNegativeAmount()(state.supplier_target);
  if (supplierTargetErr) errors.supplier_target = supplierTargetErr;
  r('vehicle_type', required('Vehicle is required'), maxLength(100));
  r('load_type', required('Load type is required'), maxLength(100));
  const weightStr = (state.weight ?? '').trim();
  if (!weightStr) {
    errors.weight = 'Weight is required.';
  } else {
    const w = parseFloat(weightStr.replace(/,/g, ''));
    if (Number.isNaN(w) || w <= 0) errors.weight = 'Enter a valid weight (tons).';
    else if (w > 999999) errors.weight = 'Weight must be at most 999,999 tons.';
  }
  if ((state.pickup_date ?? '').trim()) {
    const pickupDateErr = dateISO()(state.pickup_date ?? '');
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
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const parts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const compact = parts.slice(0, 3).join(', ');
  const MAX_LEN = 72;
  if (compact.length <= MAX_LEN) return compact;
  return `${compact.slice(0, MAX_LEN - 1).trimEnd()}…`;
}

const initialFormState: FormState = {
  client_name: '',
  client_id: null,
  pickup_area: '',
  drop_location: '',
  vehicle_type: '',
  load_type: '',
  weight: '',
  client_price: '',
  supplier_target: '',
  pickup_date: getToday(),
};

export default function CreateIndentScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
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
    profile ? { role: profile.role, aggregated: profile.aggregated, asset: profile.asset } : null
  );
  const permissions = getEffectivePermissions(capabilities);
  const canCreate = permissions.indents.create;

  const orgId = currentOrganization?.id ?? null;
  const invalidateIndents = useInvalidateIndents();

  useEffect(() => {
    if (!orgId) return;
    setClientsLoading(true);
    getClientsByOrganization(orgId).then(({ clients: list }) => {
      setClients(list ?? []);
      setClientsLoading(false);
    });
  }, [orgId]);

  // Draft persistence: load existing draft for this org when opening the screen.
  // Merge with initialFormState so new fields (e.g. weight) get defaults when loading old drafts.
  useEffect(() => {
    const loadDraft = async () => {
      if (!orgId) return;
      try {
        const key = `indent_draft_${orgId}`;
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<FormState>;
          setForm({
            client_name: parsed.client_name ?? '',
            client_id: parsed.client_id ?? null,
            pickup_area: parsed.pickup_area ?? '',
            drop_location: parsed.drop_location ?? '',
            vehicle_type: parsed.vehicle_type ?? '',
            load_type: parsed.load_type ?? '',
            weight: parsed.weight ?? '',
            client_price: parsed.client_price ?? '',
            supplier_target: parsed.supplier_target ?? '',
            pickup_date: parsed.pickup_date ?? getToday(),
          });
        }
      } catch {
        // Ignore draft load errors.
      }
    };
    loadDraft();
  }, [orgId]);

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
        const from = { latitude: pickupLat as number, longitude: pickupLon as number };
        const to = { latitude: dropLat as number, longitude: dropLon as number };
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

  const handleSelectClient = useCallback((client: ClientRow) => {
    update({ client_id: client.id, client_name: client.name ?? client.contact_person ?? '' });
  }, [update]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    const matches = clients.filter((c) => {
      const name = (c.name ?? '').toLowerCase();
      const person = (c.contact_person ?? '').toLowerCase();
      const phone = String((c as { phone?: string | null }).phone ?? '').toLowerCase();
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

  const handleSubmit = useCallback(async () => {
    if (!orgId) {
      Alert.alert('Organization required', 'Please select an organization before creating an indent.');
      return;
    }
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const clientPrice = parseFloat(String(form.client_price).replace(/,/g, ''));
    const supplierTarget = parseFloat(String(form.supplier_target).replace(/,/g, ''));
    const weightValInTons = parseFloat(form.weight.replace(/,/g, ''));
    const weightValInKg = weightValInTons * 1000;
    const payload: CreateIndentInput = {
      pickup_area: form.pickup_area.trim(),
      drop_location: form.drop_location.trim(),
      client_name: form.client_name.trim(),
      client_price: clientPrice,
      supplier_target: supplierTarget,
      vehicle_type: form.vehicle_type.trim(),
      load_type: form.load_type.trim(),
      weight: weightValInKg,
      pickup_date: form.pickup_date.trim() || null,
      circulation_target: 'integrated_supplier',
    };
    if (form.client_id) payload.client_id = form.client_id;

    setSubmitting(true);
    const { error, indent } = await createIndent(orgId, payload);
    setSubmitting(false);
    if (error) {
      Alert.alert('Could not create indent', error.message);
      return;
    }
    if (indent) {
      // Clear draft on successful create so next visit starts fresh.
      try {
        const key = `indent_draft_${orgId}`;
        await AsyncStorage.removeItem(key);
      } catch {
        // Ignore draft clear errors.
      }
      // Refresh indents lists (Indents tab, Load Hub) and open detail so user can preview.
      invalidateIndents(orgId);
      router.replace(`/indent/${indent.id}` as import('expo-router').Href);
    }
  }, [orgId, form, invalidateIndents, router]);

  if (!canCreate) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top}
      >
        <View style={[styles.container, { paddingBottom: insets.bottom }]}>
          <TeslaHeader
            title="Create Indent"
            subtitle="Deploy New Load"
            variant="dark"
            showBack
            onBack={safeBack}
            hideRightIcons
          />
          <View style={styles.noAccessWrap}>
            <Text style={styles.noAccessText}>You don't have permission to create indents.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const canSubmit =
    !submitting &&
    Boolean(form.client_id?.trim()) &&
    (form.client_name ?? '').trim().length > 0 &&
    (form.pickup_area ?? '').trim().length > 0 &&
    (form.drop_location ?? '').trim().length > 0 &&
    (form.vehicle_type ?? '').trim().length > 0 &&
    (form.load_type ?? '').trim().length > 0 &&
    (form.weight ?? '').trim().length > 0 &&
    parseFloat((form.weight ?? '').replace(/,/g, '')) > 0 &&
    (form.client_price ?? '').trim().length > 0 &&
    (form.supplier_target ?? '').trim().length > 0 &&
    parseFloat(String(form.client_price ?? '').replace(/,/g, '')) > 0 &&
    parseFloat(String(form.supplier_target ?? '').replace(/,/g, '')) >= 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.container}>
        <TeslaHeader
          title="Create Indent"
          subtitle="Deploy New Load"
          variant="dark"
          showBack
          onBack={safeBack}
          hideRightIcons
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 32 + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!pickupDropdownOpen && !dropDropdownOpen}
        >
          {/* Sheet-style form — reference: handle + grid + target partners + budget */}
          <View style={styles.sheet}>
          <View style={styles.sheetGrid}>
            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Origin Node</Text>
              <LocationSearchField
                label=""
                placeholder="Source"
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
                inputStyle={[styles.sheetInput, errors.pickup_area && styles.inputError]}
                labelStyle={styles.hiddenLabel}
                onDropdownOpenChange={setPickupDropdownOpen}
              />
              {errors.pickup_area ? <Text style={styles.errorText}>{errors.pickup_area}</Text> : null}
            </View>
            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Destination Node</Text>
              <LocationSearchField
                label=""
                placeholder="Target"
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
                inputStyle={[styles.sheetInput, errors.drop_location && styles.inputError]}
                labelStyle={styles.hiddenLabel}
                onDropdownOpenChange={setDropDropdownOpen}
              />
              {errors.drop_location ? <Text style={styles.errorText}>{errors.drop_location}</Text> : null}
            </View>
          </View>
          {(routeLoading || routeDistanceKm != null || routeEtaLabel != null) ? (
            <View style={styles.routeStatsRow}>
              <View style={styles.routeStat}>
                <Text style={styles.routeStatLabel}>Distance</Text>
                <Text style={styles.routeStatValue}>
                  {routeLoading ? '…' : routeDistanceKm != null ? `${routeDistanceKm} km` : '—'}
                </Text>
              </View>
              <View style={styles.routeStat}>
                <Text style={styles.routeStatLabel}>ETA</Text>
                <Text style={styles.routeStatValue}>
                  {routeLoading ? '…' : routeEtaLabel ?? '—'}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.sheetSection}>
            <Text style={styles.sheetLabel}>Client</Text>
            <View style={styles.clientSearchRow}>
              <FontAwesome name="search" size={14} color={Theme.textMuted} style={styles.clientSearchIcon} />
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
                  onPress={() => setClientSearch('')}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear client search"
                >
                  <FontAwesome name="times-circle" size={16} color={Theme.textMuted} />
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
                  {clients.length === 0 ? 'No clients. Add one below.' : 'No matching clients.'}
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
                      style={[styles.partnerChip, isSelected && styles.partnerChipSelected]}
                      onPress={() => handleSelectClient(client)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.partnerChipText, isSelected && styles.partnerChipTextSelected]} numberOfLines={1}>
                        {client.name || client.contact_person || '—'}
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
            {errors.client_name ? <Text style={styles.errorText}>{errors.client_name}</Text> : null}
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
                    Alert.alert('Could not add client', error.message);
                    throw error;
                  }
                  if (client) {
                    update({
                      client_id: client.id,
                      client_name: client.name ?? client.contact_person ?? '',
                    });
                    setClients((prev) => [...prev, client]);
                  }
                }}
                organizationId={orgId}
                noOrganizationMessage={null}
              />
            </Modal>
          ) : null}

          <View style={styles.sheetSection}>
            <Text style={styles.sheetLabel}>Budget Specification (₹)</Text>
            <TextInput
              style={[styles.sheetInput, errors.client_price && styles.inputError]}
              value={form.client_price}
              onChangeText={(t) => update({ client_price: t })}
              placeholder="Enter Amount"
              placeholderTextColor={Theme.textMuted}
              keyboardType="decimal-pad"
            />
            {errors.client_price ? <Text style={styles.errorText}>{errors.client_price}</Text> : null}
          </View>

          <View style={styles.sheetSection}>
            <Text style={styles.sheetLabel}>Supplier Target (₹)</Text>
            <TextInput
              style={[styles.sheetInput, errors.supplier_target && styles.inputError]}
              value={form.supplier_target}
              onChangeText={(t) => update({ supplier_target: t })}
              placeholder="0"
              placeholderTextColor={Theme.textMuted}
              keyboardType="decimal-pad"
            />
            {errors.supplier_target ? <Text style={styles.errorText}>{errors.supplier_target}</Text> : null}
          </View>

          <View style={styles.sheetGrid}>
            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Vehicle</Text>
              {vehicleTypeIsOther ? (
                <TextInput
                  style={[styles.sheetInput, errors.vehicle_type && styles.inputError]}
                  value={form.vehicle_type}
                  onChangeText={(t) => update({ vehicle_type: t })}
                  placeholder="Type vehicle"
                  placeholderTextColor={Theme.textMuted}
                />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.sheetInput,
                    { justifyContent: 'center' },
                    errors.vehicle_type && styles.inputError,
                  ]}
                  onPress={() => setVehicleTypePickerOpen(true)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={form.vehicle_type ? styles.dropdownTouchableText : styles.dropdownTouchablePlaceholder}
                    numberOfLines={1}
                  >
                    {form.vehicle_type || 'Select Vehicle'}
                  </Text>
                </TouchableOpacity>
              )}
              {vehicleTypeIsOther ? (
                <TouchableOpacity
                  onPress={() => setVehicleTypePickerOpen(true)}
                  style={styles.switchToPresetLink}
                >
                  <Text style={styles.switchToPresetLinkText}>Choose from list instead</Text>
                </TouchableOpacity>
              ) : null}
              {errors.vehicle_type ? <Text style={styles.errorText}>{errors.vehicle_type}</Text> : null}
            </View>
            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Load type</Text>
              <TextInput
                style={[styles.sheetInput, errors.load_type && styles.inputError]}
                value={form.load_type}
                onChangeText={(t) => update({ load_type: t })}
                placeholder="e.g. FMCG"
                placeholderTextColor={Theme.textMuted}
              />
              {errors.load_type ? <Text style={styles.errorText}>{errors.load_type}</Text> : null}
            </View>
          </View>

          <View style={styles.sheetSection}>
            <Text style={styles.sheetLabel}>Weight (Tons)</Text>
            <TextInput
              style={[styles.sheetInput, errors.weight && styles.inputError]}
              value={form.weight}
              onChangeText={(t) => update({ weight: t.replace(/[^\d.]/g, '').slice(0, 12) })}
              placeholder="e.g. 10 (tons)"
              placeholderTextColor={Theme.textMuted}
              keyboardType="decimal-pad"
            />
            {errors.weight ? <Text style={styles.errorText}>{errors.weight}</Text> : null}
          </View>

          <View style={styles.sheetSection}>
            <Text style={styles.sheetLabel}>Pickup date</Text>
            <View style={styles.quickDateRow}>
              {[
                { label: 'Today', get: getToday },
                { label: 'Tomorrow', get: getTomorrow },
                { label: 'Day after', get: getDayAfter },
              ].map(({ label, get }) => {
                const iso = get();
                const isActive = form.pickup_date === iso;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.quickDateChip, isActive && styles.quickDateChipActive]}
                    onPress={() => update({ pickup_date: iso })}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.quickDateChipText, isActive && styles.quickDateChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.sheetInput, styles.dateTouchable, errors.pickup_date && styles.inputError]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Text style={form.pickup_date ? styles.dateTouchableText : styles.dateTouchablePlaceholder}>
                {form.pickup_date
                  ? new Date(form.pickup_date + 'T12:00:00').toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Tap to pick date'}
              </Text>
            </TouchableOpacity>
            {errors.pickup_date ? <Text style={styles.errorText}>{errors.pickup_date}</Text> : null}

            {showDatePicker && (
              Platform.OS === 'android' ? (
                <DateTimePicker
                  value={form.pickup_date ? new Date(form.pickup_date + 'T12:00:00') : new Date()}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(e, date) => {
                    setShowDatePicker(false);
                    if (e.type === 'set' && date) update({ pickup_date: toISODate(date) });
                  }}
                />
              ) : (
                <Modal visible transparent animationType="slide">
                  <TouchableOpacity
                    style={styles.datePickerBackdrop}
                    activeOpacity={1}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <View style={styles.datePickerSheet} onStartShouldSetResponder={() => true}>
                      <View style={styles.datePickerHeader}>
                        <Text style={styles.datePickerTitle}>Pick date</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)} hitSlop={12}>
                          <Text style={styles.datePickerDone}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={form.pickup_date ? new Date(form.pickup_date + 'T12:00:00') : new Date()}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={(_, date) => date && update({ pickup_date: toISODate(date) })}
                      />
                    </View>
                  </TouchableOpacity>
                </Modal>
              )
            )}
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
                      { paddingBottom: insets.bottom + 16, maxHeight: Dimensions.get("window").height * 0.8 },
                    ]}
                  >
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>Select Vehicle</Text>
                    <TouchableOpacity onPress={() => setVehicleTypePickerOpen(false)} hitSlop={12}>
                      <Text style={styles.datePickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    style={{ maxHeight: Dimensions.get("window").height * 0.7 }}
                  >
                    <View style={styles.vehicleOptionSection}>
                      <Text style={styles.vehicleOptionSectionTitle}>Categories</Text>
                    </View>
                    {VEHICLE_CATEGORY_LABELS.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.vehicleOptionRow,
                          form.vehicle_type === opt && !vehicleTypeIsOther && styles.vehicleOptionRowActive,
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
                            form.vehicle_type === opt && !vehicleTypeIsOther && styles.vehicleOptionTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    
                    <View style={styles.vehicleOptionSection}>
                      <Text style={styles.vehicleOptionSectionTitle}>Presets & Lengths</Text>
                    </View>
                    {BODY_LENGTH_SELECT_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={normalizeBodyLengthKey(opt)}
                        style={[
                          styles.vehicleOptionRow,
                          form.vehicle_type === opt && !vehicleTypeIsOther && styles.vehicleOptionRowActive,
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
                            form.vehicle_type === opt && !vehicleTypeIsOther && styles.vehicleOptionTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}

                    <View style={styles.vehicleOptionSection}>
                      <Text style={styles.vehicleOptionSectionTitle}>Custom</Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.vehicleOptionRow,
                        vehicleTypeIsOther && styles.vehicleOptionRowActive,
                        { borderBottomWidth: 0 }
                      ]}
                      onPress={() => {
                        setVehicleTypeIsOther(true);
                        update({ vehicle_type: '' });
                        setVehicleTypePickerOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.vehicleOptionText,
                          vehicleTypeIsOther && styles.vehicleOptionTextActive,
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

            <TouchableOpacity
              style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
              ) : (
                <Text style={styles.submitBtnText}>Share with Network</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
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
    paddingTop: 14,
    flexGrow: 1,
  },
  sheet: {
    gap: 10,
  },
  sheetGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  sheetField: { flex: 1, minWidth: 0 },
  hiddenLabel: { height: 0, margin: 0, padding: 0, opacity: 0 },
  sheetSection: { marginBottom: 8 },
  sheetLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sheetInput: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    minHeight: 46,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  addClientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  partnersWrap: {
    minHeight: 42,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 8,
  },
  clientSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  clientSearchClear: {
    padding: 4,
  },
  partnersPlaceholder: {
    fontSize: 12,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  partnersScrollContent: {
    flexDirection: 'row',
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
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  partnerChipTextSelected: {
    color: Theme.textPrimaryDark,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quickDateChip: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDateChipActive: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.surface,
  },
  quickDateChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  quickDateChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  dateTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateTouchableText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  dateTouchablePlaceholder: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  dropdownTouchableText: {
    fontSize: 14,
    fontWeight: '600',
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
    justifyContent: 'flex-end',
  },
  datePickerSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  datePickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  datePickerDone: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.primary,
  },
  inputError: { borderColor: Theme.negative },
  errorText: { fontSize: 12, color: Theme.negative, marginTop: 4 },
  routeStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  routeStat: {
    flex: 1,
    minWidth: 0,
  },
  routeStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Theme.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  routeStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textOnDark,
  },
  submitBtn: {
    marginTop: 12,
    minHeight: Layout.minTouchTargetSize + 12,
    paddingVertical: 12,
    backgroundColor: Theme.buttonMatteBlack,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.buttonMatteBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.buttonMatteBlackText,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  noAccessWrap: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: 'center',
  },
  noAccessText: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
});
