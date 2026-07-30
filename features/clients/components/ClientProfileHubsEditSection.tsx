import Theme from "@/constants/Theme";
import type { ClientWarehouseExtended } from "@/features/clients/types/clientManagement.types";
import {
  createWarehouse,
  deleteWarehouse,
  updateWarehouse,
} from "@/features/clients/services/clientWarehouses.service";
import { LocationSearchField } from "@/features/trips/components/add-trip/LocationSearchField";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { formatCityStateLabel } from "@/lib/placeCityState.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MapPin } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type HubDraft = {
  name: string;
  mapPlaceLabel: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  local_gstin: string;
  contact_name: string;
  contact_phone: string;
};

const emptyDraft = (): HubDraft => ({
  name: "",
  mapPlaceLabel: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  latitude: null,
  longitude: null,
  local_gstin: "",
  contact_name: "",
  contact_phone: "",
});

function formatHubAddress(wh: ClientWarehouseExtended): string {
  return [wh.address, wh.city, wh.state, wh.pincode].filter(Boolean).join(", ") || "—";
}

type Props = {
  warehouses: ClientWarehouseExtended[];
  organizationId: string;
  clientId: string;
  onChanged: () => void;
};

export function ClientProfileHubsEditSection({
  warehouses: initialWarehouses,
  organizationId,
  clientId,
  onChanged,
}: Props) {
  const [warehouses, setWarehouses] = useState(initialWarehouses);
  const [addingHub, setAddingHub] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HubDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setWarehouses(initialWarehouses);
  }, [initialWarehouses]);

  const resetDraft = () => {
    setDraft(emptyDraft());
    setAddingHub(false);
    setEditingId(null);
  };

  const startAdd = () => {
    setDraft(emptyDraft());
    setAddingHub(true);
    setEditingId(null);
  };

  const startEdit = (wh: ClientWarehouseExtended) => {
    setEditingId(wh.id);
    const addressLine = wh.address ?? "";
    setDraft({
      name: wh.name,
      mapPlaceLabel: addressLine || [wh.city, wh.state].filter(Boolean).join(", "),
      address: addressLine,
      city: wh.city ?? "",
      state: wh.state ?? "",
      pincode: wh.pincode ?? "",
      latitude: wh.latitude ?? null,
      longitude: wh.longitude ?? null,
      local_gstin: wh.local_gstin ?? "",
      contact_name: wh.contact_name ?? "",
      contact_phone: wh.contact_phone ?? "",
    });
    setAddingHub(false);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      Alert.alert("Validation", "Hub name is required.");
      return;
    }
    if (draft.latitude == null || draft.longitude == null) {
      Alert.alert(
        "Validation",
        "Pick a place from map search so the hub gets map coordinates.",
      );
      return;
    }
    // City / state / pincode are editable, so name the field that's actually
    // blank instead of sending the user back to the map for all three.
    const missing = [
      !draft.city.trim() ? "city" : null,
      !draft.state.trim() ? "state" : null,
      !draft.pincode.trim() ? "pincode" : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      Alert.alert("Validation", `Please fill ${missing.join(", ")}.`);
      return;
    }
    if (!/^\d{6}$/.test(draft.pincode.trim())) {
      Alert.alert("Validation", "Pincode must be 6 digits.");
      return;
    }
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      address: draft.address.trim() || draft.mapPlaceLabel.trim() || null,
      city: draft.city.trim() || null,
      state: draft.state.trim() || null,
      pincode: draft.pincode.trim() || null,
      latitude: draft.latitude,
      longitude: draft.longitude,
      local_gstin: draft.local_gstin.trim() || null,
      contact_name: draft.contact_name.trim() || null,
      contact_phone: draft.contact_phone.trim() || null,
    };

    if (editingId) {
      const { error } = await updateWarehouse(editingId, payload);
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        resetDraft();
        onChanged();
      }
    } else {
      const { error } = await createWarehouse(organizationId, clientId, payload);
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        resetDraft();
        onChanged();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    Alert.alert("Delete hub", `Remove "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeletingId(id);
          const { error } = await deleteWarehouse(id);
          if (error) Alert.alert("Error", error.message);
          else onChanged();
          setDeletingId(null);
        },
      },
    ]);
  };

  const showForm = addingHub || editingId != null;

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.editSectionBarAmber} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle}>Operations Hubs</Text>
          <Text style={styles.sectionHint}>Register pickup and distribution nodes</Text>
        </View>
        {showForm ? (
          <TouchableOpacity
            style={styles.backCta}
            onPress={resetDraft}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Back to hubs list"
          >
            <FontAwesome name="chevron-left" size={12} color={Theme.textPrimaryDark} />
            <Text style={styles.backCtaText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.smallCtaAmber} onPress={startAdd} activeOpacity={0.85}>
            <FontAwesome name="plus" size={11} color={Theme.warning} />
            <Text style={styles.smallCtaAmberText}>Register Hub</Text>
          </TouchableOpacity>
        )}
      </View>

      {warehouses.length === 0 && !showForm ? (
        <Text style={styles.emptyMuted}>No hubs yet. Tap Register Hub to add one.</Text>
      ) : null}

      {!showForm
        ? warehouses.map((wh) => (
          <View key={wh.id} style={styles.hubCard}>
            <View style={styles.hubTop}>
              <View style={styles.hubIcon}>
                <FontAwesome name="archive" size={13} color={Theme.textRouteCard} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.hubName}>{wh.name}</Text>
                <View style={styles.gstPill}>
                  <Text style={styles.gstPillText}>
                    Local GST: {(wh.local_gstin ?? "").trim() || "—"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => startEdit(wh)} style={styles.iconBtn}>
                <FontAwesome name="pencil" size={16} color={Theme.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleDelete(wh.id, wh.name)}
                style={styles.iconBtn}
                disabled={deletingId === wh.id}
              >
                {deletingId === wh.id ? (
                  <LoadingIndicator size="small" color={Theme.negative} />
                ) : (
                  <FontAwesome name="trash-o" size={16} color={Theme.negative} />
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.hubGrid}>
              <View style={styles.hubCol}>
                <FontAwesome name="map-marker" size={16} color={Theme.aggregatePillText} />
                <Text style={styles.hubAddr}>{formatHubAddress(wh)}</Text>
              </View>
              <View style={[styles.hubCol, styles.hubColRight]}>
                <FontAwesome name="user" size={16} color={Theme.positive} />
                <Text style={styles.hubContact}>{(wh.contact_name ?? "").trim() || "—"}</Text>
                <Text style={styles.hubPhone}>{(wh.contact_phone ?? "").trim() || "—"}</Text>
              </View>
            </View>
          </View>
        ))
        : null}

      {showForm ? (
        <View style={styles.formCard}>
          <View style={styles.formTitleRow}>
            <TouchableOpacity
              style={styles.formBackBtn}
              onPress={resetDraft}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <FontAwesome name="chevron-left" size={14} color={Theme.textPrimaryDark} />
            </TouchableOpacity>
            <Text style={styles.formTitle}>{editingId ? "Edit Hub" : "New Hub"}</Text>
          </View>
          <Field
            label="Hub Name *"
            value={draft.name}
            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="e.g. Chennai Warehouse"
          />
          <View style={styles.mapFieldWrap}>
            <LocationSearchField
              label="Pick from map *"
              placeholder="Search area, landmark, or address"
              value={draft.mapPlaceLabel}
              onChangeText={(text) =>
                setDraft((d) => ({
                  ...d,
                  mapPlaceLabel: text,
                  ...(text.trim()
                    ? {}
                    : { latitude: null, longitude: null }),
                }))
              }
              onSelectPlace={(displayName, coords) => {
                const label = formatCityStateLabel({
                  city: coords.city,
                  state: coords.state,
                  displayName,
                });
                setDraft((d) => ({
                  ...d,
                  mapPlaceLabel: label,
                  address: d.address.trim() || label,
                  // Always take city / state / pincode from the place API (overwrite stale draft).
                  city: coords.city?.trim() || "",
                  state: coords.state?.trim() || "",
                  pincode: coords.pincode?.trim() || "",
                  latitude: coords.lat,
                  longitude: coords.lon,
                }));
              }}
              leadingIcon={<MapPin size={14} color={Theme.aggregatePillText} strokeWidth={2} />}
              compact
              labelStyle={styles.mapFieldLabel}
              inputStyle={styles.mapFieldInput}
            />
            {draft.latitude != null && draft.longitude != null ? (
              <Text style={styles.mapCoordsHint}>
                Location pinned · {draft.latitude.toFixed(4)}, {draft.longitude.toFixed(4)}
              </Text>
            ) : (
              <Text style={styles.mapCoordsHint}>
                Same place search used on trip route pickup / drop
              </Text>
            )}
          </View>
          <Field
            label="Address"
            value={draft.address}
            onChangeText={(v) => setDraft((d) => ({ ...d, address: v }))}
            placeholder="Street address"
          />
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Field
                label="City"
                value={draft.city}
                onChangeText={(v) => setDraft((d) => ({ ...d, city: v }))}
                placeholder="From map"
              />
            </View>
            <View style={styles.fieldHalf}>
              <Field
                label="State"
                value={draft.state}
                onChangeText={(v) => setDraft((d) => ({ ...d, state: v }))}
                placeholder="From map"
              />
            </View>
          </View>
          <Field
            label="Pincode"
            value={draft.pincode}
            onChangeText={(v) =>
              setDraft((d) => ({ ...d, pincode: v.replace(/\D/g, "").slice(0, 6) }))
            }
            placeholder="From map"
            keyboardType="number-pad"
          />
          <Text style={styles.mapCoordsHint}>
            City, state, and pincode fill automatically from the place you pick
          </Text>
          <Field
            label="Local GSTIN"
            value={draft.local_gstin}
            onChangeText={(v) => setDraft((d) => ({ ...d, local_gstin: v }))}
            placeholder="GST number for this hub"
            autoCapitalize="characters"
          />
          <Field
            label="Contact Person"
            value={draft.contact_name}
            onChangeText={(v) => setDraft((d) => ({ ...d, contact_name: v }))}
            placeholder="Name"
          />
          <Field
            label="Contact Phone"
            value={draft.contact_phone}
            onChangeText={(v) => setDraft((d) => ({ ...d, contact_phone: v }))}
            placeholder="+91 XXXXX XXXXX"
            keyboardType="phone-pad"
          />
          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetDraft} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={() => void handleSave()}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <LoadingIndicator color={Theme.textOnPrimary} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{editingId ? "Update Hub" : "Save Hub"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Theme.textSection}
        style={styles.fieldInput}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", alignSelf: "stretch" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  editSectionBarAmber: { width: 2, height: 12, borderRadius: 1, backgroundColor: Theme.textPrimaryDark },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionHint: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  smallCtaAmber: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: Theme.warningMuted,
  },
  smallCtaAmberText: { fontSize: 9, fontWeight: "700", color: Theme.warning, textTransform: "uppercase", letterSpacing: 0.3 },
  backCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  backCtaText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  emptyMuted: { fontSize: 11, fontWeight: "500", color: Theme.textMuted, marginBottom: 8 },
  hubCard: {
    padding: 10,
    backgroundColor: Theme.cardWhite,
    marginBottom: 8,
    width: "100%",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  hubTop: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  hubIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  hubName: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  gstPill: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: Theme.surfaceGray,
  },
  gstPillText: { fontSize: 9, fontWeight: "700", color: Theme.textRouteCard, textTransform: "uppercase" },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  hubGrid: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderInput,
    paddingTop: 8,
    gap: 8,
  },
  hubCol: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 6, minWidth: 0 },
  hubColRight: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Theme.borderInput, paddingLeft: 10 },
  hubAddr: { flex: 1, fontSize: 12, fontWeight: "700", color: Theme.textPrimary },
  hubContact: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary },
  hubPhone: { marginTop: 3, fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  formCard: {
    marginTop: 4,
    padding: 14,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    width: "100%",
  },
  formTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  formBackBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  formTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
  },
  mapFieldWrap: {
    marginBottom: 12,
    width: "100%",
  },
  mapFieldLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginLeft: 4,
    marginBottom: 6,
  },
  mapFieldInput: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  mapCoordsHint: {
    marginTop: 6,
    marginLeft: 4,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  fieldGroup: { marginBottom: 10, width: "100%" },
  fieldLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 6,
    width: "100%",
  },
  fieldRow: { flexDirection: "row", gap: 10 },
  fieldHalf: { flex: 1, minWidth: 0 },
  formActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  cancelBtnText: { fontSize: 11, fontWeight: "800", color: Theme.textMuted, textTransform: "uppercase" },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 11, fontWeight: "900", color: Theme.textOnPrimary, textTransform: "uppercase" },
});
