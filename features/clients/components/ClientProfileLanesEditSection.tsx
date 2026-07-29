import Theme from "@/constants/Theme";
import type {
  ClientLaneRate,
  ClientWarehouseExtended,
  LaneRateType,
} from "@/features/clients/types/clientManagement.types";
import {
  createClientLaneRate,
  deleteClientLaneRate,
  updateClientLaneRate,
} from "@/features/clients/services/clientLaneRates.service";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { formatWarehouseLaneLabel } from "@/features/clients/utils/clientManagement.util";
import { formatINRChip } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const RATE_TYPES: Array<{ value: LaneRateType; label: string }> = [
  { value: "per_trip", label: "Per Trip" },
  { value: "per_ton", label: "Per Ton" },
  { value: "per_kg", label: "Per Kg" },
  { value: "per_km", label: "Per Km" },
  { value: "fixed", label: "Fixed" },
];

type LaneDraft = {
  origin_warehouse_id: string | null;
  origin_label: string;
  destination_label: string;
  vehicle_type: string;
  /** Prefills Commodity step "Product type" on the trip wizard. */
  default_load_type: string;
  /** Prefills Commodity step "Tons" on the trip wizard. */
  default_load_tons: string;
  distance_km: string;
  valid_from: string;
  valid_to: string;
  rate: string;
  rate_type: LaneRateType;
  notes: string;
};

const emptyDraft = (warehouses: ClientWarehouseExtended[]): LaneDraft => ({
  origin_warehouse_id: warehouses.length === 1 ? warehouses[0]!.id : null,
  /** "Name · City, State" — the origin is a place, not just the hub's name. */
  origin_label:
    warehouses.length === 1 ? formatWarehouseLaneLabel(warehouses[0]!) : "",
  destination_label: "",
  vehicle_type: "",
  default_load_type: "",
  default_load_tons: "",
  distance_km: "",
  valid_from: "",
  valid_to: "",
  rate: "",
  rate_type: "per_trip",
  notes: "",
});

function lanePrice(lane: ClientLaneRate): number {
  return Number(lane.rate ?? lane.base_rate ?? lane.per_mt_rate ?? 0) || 0;
}

function lanePricingType(lane: ClientLaneRate): "per_trip" | "per_ton" {
  if (lane.rate_type === "per_ton" || lane.rate_type === "per_kg" || lane.pricing_model === "per_ton") {
    return "per_ton";
  }
  return "per_trip";
}

function laneToDraft(lane: ClientLaneRate): LaneDraft {
  const price = lanePrice(lane);
  return {
    origin_warehouse_id: lane.origin_warehouse_id,
    origin_label: lane.origin_label,
    destination_label: lane.destination_label,
    vehicle_type: lane.vehicle_type ?? "",
    default_load_type: lane.default_load_type ?? "",
    default_load_tons:
      lane.default_load_tons != null ? String(lane.default_load_tons) : "",
    distance_km: lane.distance_km != null ? String(lane.distance_km) : "",
    valid_from: lane.valid_from ?? "",
    valid_to: lane.valid_to ?? "",
    rate: price > 0 ? String(price) : "",
    rate_type: lane.rate_type,
    notes: lane.notes ?? "",
  };
}

/** Lanes tied to the selected pickup hub (or custom / no-hub lanes). */
function lanesForHub(
  all: ClientLaneRate[],
  warehouseId: string | null,
  customSelected: boolean,
): ClientLaneRate[] {
  if (warehouseId) {
    return all.filter((l) => l.origin_warehouse_id === warehouseId);
  }
  if (customSelected) {
    return all.filter((l) => !l.origin_warehouse_id);
  }
  return [];
}

type Props = {
  laneRates: ClientLaneRate[];
  warehouses: ClientWarehouseExtended[];
  organizationId: string;
  clientId: string;
  onChanged: () => void;
};

export function ClientProfileLanesEditSection({
  laneRates: initialLanes,
  warehouses,
  organizationId,
  clientId,
  onChanged,
}: Props) {
  const [lanes, setLanes] = useState(initialLanes);
  const [addingLane, setAddingLane] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LaneDraft>(emptyDraft(warehouses));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLanes(initialLanes);
  }, [initialLanes]);

  const resetDraft = () => {
    setDraft(emptyDraft(warehouses));
    setAddingLane(false);
    setEditingId(null);
  };

  const startAdd = () => {
    setDraft(emptyDraft(warehouses));
    setAddingLane(true);
    setEditingId(null);
  };

  const startEdit = (lane: ClientLaneRate) => {
    setEditingId(lane.id);
    setDraft(laneToDraft(lane));
    setAddingLane(false);
  };

  /** Origin label for a hub — "Name · City, State", matching the desktop form. */
  const hubOriginLabel = (warehouseId: string | null): string => {
    if (!warehouseId) return "";
    const wh = warehouses.find((w) => w.id === warehouseId);
    return wh ? formatWarehouseLaneLabel(wh) : "";
  };

  const selectHub = (warehouseId: string | null) => {
    setDraft({
      ...emptyDraft(warehouses),
      origin_warehouse_id: warehouseId,
      origin_label: hubOriginLabel(warehouseId),
    });
    setEditingId(null);
    setAddingLane(true);
  };

  /** Apply an existing hub lane into the form for update (management) or duplicate-as-new. */
  const applyLaneTag = (lane: ClientLaneRate) => {
    setEditingId(lane.id);
    setAddingLane(false);
    setDraft(laneToDraft(lane));
  };

  const startBlankLaneForHub = () => {
    const hubId = draft.origin_warehouse_id;
    setEditingId(null);
    setAddingLane(true);
    setDraft({
      ...emptyDraft(warehouses),
      origin_warehouse_id: hubId,
      origin_label: hubOriginLabel(hubId) || draft.origin_label,
    });
  };

  const hubLanes = useMemo(
    () =>
      lanesForHub(
        lanes,
        draft.origin_warehouse_id,
        warehouses.length > 0 && draft.origin_warehouse_id == null,
      ),
    [lanes, draft.origin_warehouse_id, warehouses.length],
  );

  const handleSave = async () => {
    const originLabel = draft.origin_label.trim();
    const destination = draft.destination_label.trim();
    if (!originLabel || !destination) {
      Alert.alert("Validation", "Pickup area and destination are required.");
      return;
    }
    const rateNum = draft.rate.trim() ? Number(draft.rate) : null;
    if (draft.rate.trim() && !Number.isFinite(rateNum)) {
      Alert.alert("Validation", "Rate must be a valid number.");
      return;
    }
    const tonsNum = draft.default_load_tons.trim()
      ? Number(draft.default_load_tons)
      : null;
    if (draft.default_load_tons.trim() && !Number.isFinite(tonsNum)) {
      Alert.alert("Validation", "Default tons must be a valid number.");
      return;
    }
    const distanceNum = draft.distance_km.trim()
      ? Number(draft.distance_km)
      : null;
    if (draft.distance_km.trim() && !Number.isFinite(distanceNum)) {
      Alert.alert("Validation", "Distance must be a valid number.");
      return;
    }

    setSaving(true);
    const payload = {
      origin_warehouse_id: draft.origin_warehouse_id,
      origin_label: originLabel,
      destination_label: destination,
      vehicle_type: draft.vehicle_type.trim() || null,
      /** Both feed the trip wizard's Commodity step via buildClientLanePrefill. */
      default_load_type: draft.default_load_type.trim() || null,
      default_load_tons: tonsNum,
      distance_km: distanceNum,
      valid_from: draft.valid_from.trim() || null,
      valid_to: draft.valid_to.trim() || null,
      rate: rateNum,
      rate_type: draft.rate_type,
      notes: draft.notes.trim() || null,
    };

    if (editingId) {
      const { error } = await updateClientLaneRate(editingId, payload);
      if (error) Alert.alert("Error", error.message);
      else {
        resetDraft();
        onChanged();
      }
    } else {
      const { error } = await createClientLaneRate(organizationId, clientId, payload);
      if (error) Alert.alert("Error", error.message);
      else {
        resetDraft();
        onChanged();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    Alert.alert("Delete lane", "Remove this lane contract?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeletingId(id);
          const { error } = await deleteClientLaneRate(id);
          if (error) Alert.alert("Error", error.message);
          else onChanged();
          setDeletingId(null);
        },
      },
    ]);
  };

  const showForm = addingLane || editingId != null;

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.editSectionBarNavy} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle}>Route Contracts</Text>
          <Text style={styles.sectionHint}>Defined lane protocols and rate cards</Text>
        </View>
        {showForm ? (
          <TouchableOpacity
            style={styles.backCta}
            onPress={resetDraft}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Back to lanes list"
          >
            <FontAwesome name="chevron-left" size={12} color={Theme.textPrimaryDark} />
            <Text style={styles.backCtaText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.smallCtaNavy} onPress={startAdd} activeOpacity={0.85}>
            <FontAwesome name="plus" size={11} color={Theme.textOnPrimary} />
            <Text style={styles.smallCtaNavyText}>Define Lane</Text>
          </TouchableOpacity>
        )}
      </View>

      {!showForm ? (
        <View style={styles.tableWrap}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colPickup]}>Hub (Pickup)</Text>
            <Text style={[styles.th, styles.colDest]}>Destination</Text>
            <Text style={[styles.th, styles.colVehicle]}>Vehicle</Text>
            <Text style={[styles.th, styles.colPricing]}>Pricing</Text>
            <Text style={[styles.th, styles.colRate]}>Lane Rate</Text>
            <Text style={[styles.th, styles.colActions]} />
          </View>
          {lanes.length === 0 ? (
            <Text style={styles.emptyMuted}>No contracts yet. Tap Define Lane to add one.</Text>
          ) : (
            lanes.map((lane) => {
              const vehicleLabel = (lane.vehicle_type ?? "").trim();
              return (
                <View key={lane.id} style={styles.tr}>
                  <Text style={[styles.td, styles.tdPickup, styles.colPickup]} numberOfLines={2}>
                    {lane.origin_label}
                  </Text>
                  <Text style={[styles.td, styles.tdDest, styles.colDest]} numberOfLines={2}>
                    {lane.destination_label}
                  </Text>
                  <Text style={[styles.td, styles.tdVehicle, styles.colVehicle]} numberOfLines={1}>
                    {vehicleLabel || "—"}
                  </Text>
                  <View style={[styles.colPricing, styles.pricingCol]}>
                    <View
                      style={[
                        styles.perPill,
                        lanePricingType(lane) === "per_trip" ? styles.perPillTrip : styles.perPillTon,
                      ]}
                    >
                      <Text
                        style={[
                          styles.perPillText,
                          lanePricingType(lane) === "per_trip"
                            ? styles.perPillTextTrip
                            : styles.perPillTextTon,
                        ]}
                      >
                        {lanePricingType(lane) === "per_trip" ? "Per trip" : "Per ton"}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.td, styles.laneRate, styles.colRate]} numberOfLines={1}>
                    ₹{Math.round(lanePrice(lane)).toLocaleString("en-IN")}
                  </Text>
                  <View style={[styles.colActions, styles.rowActions]}>
                    <TouchableOpacity
                      onPress={() => startEdit(lane)}
                      style={styles.rowIconBtn}
                      accessibilityLabel="Edit lane"
                    >
                      <FontAwesome name="pencil" size={12} color={Theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void handleDelete(lane.id)}
                      style={styles.rowIconBtn}
                      disabled={deletingId === lane.id}
                      accessibilityLabel="Delete lane"
                    >
                      {deletingId === lane.id ? (
                        <LoadingIndicator size="small" color={Theme.negative} />
                      ) : (
                        <FontAwesome name="trash-o" size={12} color={Theme.negative} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}

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
            <Text style={styles.formTitle}>{editingId ? "Edit Lane" : "New Lane Contract"}</Text>
          </View>

          {warehouses.length > 0 ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Pickup Hub (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                <TouchableOpacity
                  style={[styles.chip, !draft.origin_warehouse_id && styles.chipSelected]}
                  onPress={() => selectHub(null)}
                >
                  <Text style={[styles.chipText, !draft.origin_warehouse_id && styles.chipTextSelected]}>
                    Custom
                  </Text>
                </TouchableOpacity>
                {warehouses.map((wh) => (
                  <TouchableOpacity
                    key={wh.id}
                    style={[styles.chip, draft.origin_warehouse_id === wh.id && styles.chipSelected]}
                    onPress={() => selectHub(wh.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        draft.origin_warehouse_id === wh.id && styles.chipTextSelected,
                      ]}
                    >
                      {wh.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.laneTagBlock}>
                  <Text style={styles.laneTagLabel}>
                    {hubLanes.length > 0
                      ? `Existing lanes · ${hubLanes.length}`
                      : "No lanes on this hub yet"}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.laneTagScroll}
                    contentContainerStyle={styles.laneTagRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    <TouchableOpacity
                      style={[
                        styles.laneTag,
                        styles.laneTagNew,
                        editingId == null && styles.laneTagSelected,
                      ]}
                      onPress={startBlankLaneForHub}
                      accessibilityRole="button"
                      accessibilityLabel="New blank lane"
                    >
                      <FontAwesome
                        name="plus"
                        size={9}
                        color={editingId == null ? Theme.textOnPrimary : Theme.textMuted}
                      />
                      <Text
                        style={[
                          styles.laneTagText,
                          editingId == null && styles.laneTagTextSelected,
                        ]}
                      >
                        New
                      </Text>
                    </TouchableOpacity>
                    {hubLanes.map((lane) => {
                      const active = editingId === lane.id;
                      const price = lanePrice(lane);
                      return (
                        <TouchableOpacity
                          key={lane.id}
                          style={[styles.laneTag, active && styles.laneTagSelected]}
                          onPress={() => applyLaneTag(lane)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`Lane ${lane.destination_label}`}
                        >
                          <Text
                            style={[styles.laneTagDest, active && styles.laneTagTextSelected]}
                            numberOfLines={1}
                          >
                            {(lane.destination_label ?? "").trim() || "Destination"}
                          </Text>
                          {(lane.vehicle_type ?? "").trim() ? (
                            <Text
                              style={[styles.laneTagMeta, active && styles.laneTagMetaSelected]}
                              numberOfLines={1}
                            >
                              {(lane.vehicle_type ?? "").trim()}
                            </Text>
                          ) : null}
                          <Text
                            style={[styles.laneTagPrice, active && styles.laneTagPriceSelected]}
                            numberOfLines={1}
                          >
                            {price > 0 ? formatINRChip(price) : "TBD"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
            </View>
          ) : null}

          <Field
            label="Pickup Area *"
            value={draft.origin_label}
            onChangeText={(v) => setDraft((d) => ({ ...d, origin_label: v }))}
            placeholder="e.g. Chennai"
          />
          <Field
            label="Destination *"
            value={draft.destination_label}
            onChangeText={(v) => setDraft((d) => ({ ...d, destination_label: v }))}
            placeholder="e.g. Bangalore"
          />
          <Field
            label="Vehicle Type"
            value={draft.vehicle_type}
            onChangeText={(v) => setDraft((d) => ({ ...d, vehicle_type: v }))}
            placeholder="e.g. 32ft, 10T, Open Body"
          />
          <Field
            label="Product Type"
            value={draft.default_load_type}
            onChangeText={(v) => setDraft((d) => ({ ...d, default_load_type: v }))}
            placeholder="e.g. Cement, Steel Coils"
          />
          <Field
            label="Default Tons"
            value={draft.default_load_tons}
            onChangeText={(v) => setDraft((d) => ({ ...d, default_load_tons: v }))}
            placeholder="e.g. 20"
            keyboardType="decimal-pad"
          />
          <Field
            label="Distance (km)"
            value={draft.distance_km}
            onChangeText={(v) => setDraft((d) => ({ ...d, distance_km: v }))}
            placeholder="e.g. 350"
            keyboardType="decimal-pad"
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Rate Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {RATE_TYPES.map((rt) => (
                <TouchableOpacity
                  key={rt.value}
                  style={[styles.chip, draft.rate_type === rt.value && styles.chipSelected]}
                  onPress={() => setDraft((d) => ({ ...d, rate_type: rt.value }))}
                >
                  <Text
                    style={[styles.chipText, draft.rate_type === rt.value && styles.chipTextSelected]}
                  >
                    {rt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Field
            label="Lane Rate (₹)"
            value={draft.rate}
            onChangeText={(v) => setDraft((d) => ({ ...d, rate: v }))}
            placeholder="0"
            keyboardType="decimal-pad"
          />
          {/** Blank = open-ended; isLaneCurrentlyValid() hides expired lanes from pickers. */}
          <Field
            label="Valid From"
            value={draft.valid_from}
            onChangeText={(v) => setDraft((d) => ({ ...d, valid_from: v }))}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Valid To"
            value={draft.valid_to}
            onChangeText={(v) => setDraft((d) => ({ ...d, valid_to: v }))}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Notes"
            value={draft.notes}
            onChangeText={(v) => setDraft((d) => ({ ...d, notes: v }))}
            placeholder="Optional notes"
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
                <Text style={styles.saveBtnText}>{editingId ? "Update Lane" : "Save Lane"}</Text>
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
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad";
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", alignSelf: "stretch" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  editSectionBarNavy: { width: 2, height: 12, borderRadius: 1, backgroundColor: Theme.textPrimaryDark },
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
  smallCtaNavy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: Theme.textPrimaryDark,
  },
  smallCtaNavyText: { fontSize: 9, fontWeight: "700", color: Theme.textOnPrimary, textTransform: "uppercase", letterSpacing: 0.3 },
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
  tableWrap: {
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
    marginBottom: 10,
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  th: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  colPickup: { flex: 1.35, minWidth: 0 },
  colDest: { flex: 1.2, minWidth: 0 },
  colVehicle: { flex: 0.85, minWidth: 0 },
  colPricing: { width: 92, flexGrow: 0, flexShrink: 0 },
  colRate: { width: 104, flexGrow: 0, flexShrink: 0, textAlign: "right" },
  colActions: {
    width: 72,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },
  emptyMuted: { fontSize: 12, fontWeight: "600", color: Theme.textMuted, padding: 16 },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  td: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tdPickup: { fontWeight: "700" },
  tdDest: { fontWeight: "600", color: Theme.textRouteCard },
  tdVehicle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "none",
  },
  pricingCol: { alignItems: "flex-start", justifyContent: "center" },
  perPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  perPillTrip: { backgroundColor: Theme.fiscalTabActiveBg, borderColor: Theme.aggregatePillBorder },
  perPillTon: { backgroundColor: Theme.warningMuted, borderColor: Theme.warning + "44" },
  perPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  perPillTextTrip: { color: Theme.aggregatePillText },
  perPillTextTon: { color: Theme.warning },
  laneRate: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  rowIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
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
  chipScroll: { flexGrow: 0 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  chipSelected: { backgroundColor: Theme.textPrimaryDark, borderColor: Theme.textPrimaryDark },
  chipText: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  chipTextSelected: { color: Theme.textOnPrimary },
  laneTagBlock: {
    marginTop: 8,
    gap: 5,
  },
  laneTagLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginLeft: 4,
  },
  laneTagScroll: { flexGrow: 0 },
  laneTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 8,
  },
  laneTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  laneTagNew: {
    maxWidth: 72,
    gap: 4,
  },
  laneTagSelected: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  laneTagDest: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
    maxWidth: 96,
  },
  laneTagMeta: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    flexShrink: 1,
    maxWidth: 56,
  },
  laneTagMetaSelected: {
    color: "rgba(255,255,255,0.72)",
  },
  laneTagPrice: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  laneTagPriceSelected: {
    color: Theme.textOnPrimary,
  },
  laneTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  laneTagTextSelected: {
    color: Theme.textOnPrimary,
  },
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
