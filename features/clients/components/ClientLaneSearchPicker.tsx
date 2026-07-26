/**
 * Search + select a client contract lane after billing client is chosen.
 * Used by Create Trip and Create Indent to auto-fill route / rate / vehicle.
 */
import Theme from "@/constants/Theme";
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";
import {
  filterClientLanes,
  isLaneCurrentlyValid,
  lanePrimaryRateLabel,
  laneValidityLabel,
} from "@/features/clients/utils/clientLanePrefill.util";
import { METRONIC } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { CheckCircle2, MapPinned, Search, X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  lanes: readonly ClientLaneRate[];
  loading?: boolean;
  selectedLaneId: string | null;
  onSelect: (lane: ClientLaneRate) => void;
  onClear?: () => void;
  compact?: boolean;
  /**
   * Controlled search. When provided, filtering is delegated to the parent
   * (server-side, debounced). When omitted, the picker filters `lanes`
   * locally — the original small-list behavior.
   */
  search?: string;
  onSearchChange?: (value: string) => void;
};

export function ClientLaneSearchPicker({
  lanes,
  loading = false,
  selectedLaneId,
  onSelect,
  onClear,
  compact = false,
  search,
  onSearchChange,
}: Props) {
  const serverControlled = onSearchChange != null;
  const [localQuery, setLocalQuery] = useState("");
  const query = serverControlled ? (search ?? "") : localQuery;
  const setQuery = useCallback(
    (value: string) => {
      if (serverControlled) onSearchChange!(value);
      else setLocalQuery(value);
    },
    [serverControlled, onSearchChange],
  );
  // Server already filtered when controlled; only sort. Otherwise filter locally.
  const filtered = useMemo(
    () =>
      serverControlled
        ? filterClientLanes(lanes, "")
        : filterClientLanes(lanes, query),
    [lanes, query, serverControlled],
  );
  const selected = useMemo(
    () => lanes.find((l) => l.id === selectedLaneId) ?? null,
    [lanes, selectedLaneId],
  );

  if (!loading && lanes.length === 0) {
    return (
      <View style={[s.root, compact && s.rootCompact]}>
        <Text style={[s.kicker, compact && s.kickerCompact]}>Contract lane</Text>
        <Text style={[s.emptyHint, compact && s.emptyHintCompact]} numberOfLines={compact ? 2 : undefined}>
          {compact
            ? "No contract lanes yet — enter route and sale manually, or add lanes on the customer profile."
            : "No warehouse contract lanes for this client yet. Add them on the customer profile (Warehouses → Contract → Lanes), or enter route and sale manually."}
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.root, compact && s.rootCompact]}>
      <View style={s.headerRow}>
        <Text style={s.kicker}>Contract lane</Text>
        {selected && onClear ? (
          <Pressable onPress={onClear} hitSlop={8} style={s.clearBtn}>
            <Text style={s.clearText}>Clear lane</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={s.sub}>
        Search and select to auto-fill pickup, drop, vehicle, and sale rate.
      </Text>

      {selected ? (
        <View style={s.selectedCard}>
          <MapPinned size={16} color={METRONIC.link} strokeWidth={2.2} />
          <View style={s.selectedCopy}>
            <Text style={s.selectedRoute} numberOfLines={2}>
              {selected.origin_label} → {selected.destination_label}
            </Text>
            <Text style={s.selectedMeta} numberOfLines={1}>
              {[
                selected.vehicle_type,
                lanePrimaryRateLabel(selected),
                laneValidityLabel(selected),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <CheckCircle2 size={16} color={Theme.success} strokeWidth={2.4} />
        </View>
      ) : null}

      <View style={s.searchShell}>
        <Search size={14} color={METRONIC.muted} strokeWidth={2.2} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search origin, destination, vehicle…"
          placeholderTextColor={METRONIC.muted}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <X size={14} color={METRONIC.subtle} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={METRONIC.link} style={{ marginVertical: 12 }} />
      ) : filtered.length === 0 ? (
        <Text style={s.noMatch}>
          {query.trim()
            ? `No lanes match “${query.trim()}”.`
            : "No contract lanes yet."}
        </Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(lane) => lane.id}
          style={[s.list, compact && s.listCompact]}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item: lane }) => {
            const active = lane.id === selectedLaneId;
            const valid = isLaneCurrentlyValid(lane);
            return (
              <Pressable
                onPress={() => onSelect(lane)}
                style={({ pressed }) => [
                  s.row,
                  active && s.rowActive,
                  pressed && { opacity: 0.92 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={s.rowCopy}>
                  <Text
                    style={[s.rowTitle, active && s.rowTitleActive]}
                    numberOfLines={2}
                  >
                    {lane.origin_label} → {lane.destination_label}
                  </Text>
                  <Text style={s.rowMeta} numberOfLines={2}>
                    {[
                      lane.vehicle_type ?? "Any vehicle",
                      lanePrimaryRateLabel(lane),
                      laneValidityLabel(lane),
                      !valid ? "Outside validity" : null,
                      lane.is_spot_rate ? "SPOT" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                {active ? (
                  <CheckCircle2 size={15} color={METRONIC.link} strokeWidth={2.4} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    marginTop: 12,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#F8FAFC",
    padding: 12,
  },
  rootCompact: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    color: METRONIC.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  kickerCompact: {
    fontSize: 10,
    letterSpacing: 0.45,
  },
  sub: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 16,
  },
  emptyHint: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 17,
  },
  emptyHintCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  clearBtn: { paddingVertical: 2, paddingHorizontal: 4 },
  clearText: { fontSize: 12, fontWeight: "700", color: METRONIC.link },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#B5D4F4",
    backgroundColor: "#EEF6FF",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  selectedCopy: { flex: 1, minWidth: 0, gap: 2 },
  selectedRoute: { fontSize: 13, fontWeight: "800", color: METRONIC.text },
  selectedMeta: { fontSize: 11, fontWeight: "600", color: METRONIC.subtle },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: METRONIC.text,
    padding: 0,
    margin: 0,
  },
  list: {
    maxHeight: 220,
  },
  listCompact: {
    maxHeight: 180,
  },
  noMatch: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.muted,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
  },
  rowActive: {
    backgroundColor: "#EEF6FF",
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: "700", color: METRONIC.text },
  rowTitleActive: { color: METRONIC.link },
  rowMeta: { fontSize: 11, fontWeight: "500", color: METRONIC.subtle, lineHeight: 15 },
});
