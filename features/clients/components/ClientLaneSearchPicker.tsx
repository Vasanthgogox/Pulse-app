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
import { formatCityStateLabel, formatLaneRouteLabel } from "@/lib/placeCityState.util";
import { METRONIC } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { CheckCircle2, MapPinned, Search, X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type WarehouseTag = {
  key: string;
  label: string;
  count: number;
};

function warehouseKeyForLane(lane: ClientLaneRate): string | null {
  const label = formatCityStateLabel(lane.origin_label) || lane.origin_label?.trim();
  if (!label && !lane.origin_warehouse_id) return null;
  return lane.origin_warehouse_id?.trim() || label!.toLowerCase();
}

function buildWarehouseTags(lanes: readonly ClientLaneRate[]): WarehouseTag[] {
  const map = new Map<string, WarehouseTag>();
  for (const lane of lanes) {
    const key = warehouseKeyForLane(lane);
    if (!key) continue;
    const label =
      formatCityStateLabel(lane.origin_label) || lane.origin_label?.trim() || "Warehouse";
    const prev = map.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      map.set(key, { key, label, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

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
  const [warehouseFilter, setWarehouseFilter] = useState<string | null>(null);
  const query = serverControlled ? (search ?? "") : localQuery;
  const setQuery = useCallback(
    (value: string) => {
      if (serverControlled) onSearchChange!(value);
      else setLocalQuery(value);
    },
    [serverControlled, onSearchChange],
  );

  const warehouseTags = useMemo(() => buildWarehouseTags(lanes), [lanes]);

  // Server already filtered when controlled; only sort. Otherwise filter locally.
  const filtered = useMemo(() => {
    const base = serverControlled
      ? filterClientLanes(lanes, "")
      : filterClientLanes(lanes, query);
    if (!warehouseFilter) return base;
    return base.filter((lane) => warehouseKeyForLane(lane) === warehouseFilter);
  }, [lanes, query, serverControlled, warehouseFilter]);

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
        <Text style={[s.kicker, compact && s.kickerCompact]}>Contract lane</Text>
        {selected && onClear ? (
          <Pressable onPress={onClear} hitSlop={8} style={s.clearBtn}>
            <Text style={[s.clearText, compact && s.clearTextCompact]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {!selected ? (
        <Text style={[s.sub, compact && s.subCompact]} numberOfLines={1}>
          {compact
            ? "Select a lane to auto-fill pickup, drop & rate."
            : "Select a lane to auto-fill pickup, drop, vehicle & rate."}
        </Text>
      ) : null}

      {warehouseTags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tagRow}
          style={s.tagScroll}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => setWarehouseFilter(null)}
            style={[s.tag, compact && s.tagCompact, warehouseFilter == null && s.tagActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: warehouseFilter == null }}
          >
            <Text style={[s.tagText, warehouseFilter == null && s.tagTextActive]}>
              All · {lanes.length}
            </Text>
          </Pressable>
          {warehouseTags.map((tag) => {
            const active = warehouseFilter === tag.key;
            return (
              <Pressable
                key={tag.key}
                onPress={() => setWarehouseFilter(active ? null : tag.key)}
                style={[s.tag, compact && s.tagCompact, active && s.tagActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter by ${tag.label}`}
              >
                <MapPinned
                  size={9}
                  color={active ? Theme.textOnPrimary : METRONIC.muted}
                  strokeWidth={2.4}
                />
                <Text style={[s.tagText, active && s.tagTextActive]} numberOfLines={1}>
                  {tag.label}
                </Text>
                <Text style={[s.tagCount, active && s.tagCountActive]}>{tag.count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {selected ? (
        <View style={[s.selectedCard, compact && s.selectedCardCompact]}>
          <View style={[s.selectedIcon, compact && s.selectedIconCompact]}>
            <MapPinned size={compact ? 11 : 12} color={METRONIC.link} strokeWidth={2.2} />
          </View>
          <View style={s.selectedCopy}>
            <Text
              style={[s.selectedRoute, compact && s.selectedRouteCompact]}
              numberOfLines={1}
            >
              {formatLaneRouteLabel(selected.origin_label, selected.destination_label) ||
                `${selected.origin_label} → ${selected.destination_label}`}
            </Text>
            <Text
              style={[s.selectedMeta, compact && s.selectedMetaCompact]}
              numberOfLines={1}
            >
              {[
                selected.vehicle_type,
                lanePrimaryRateLabel(selected),
                laneValidityLabel(selected),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <CheckCircle2 size={compact ? 12 : 14} color={Theme.success} strokeWidth={2.4} />
        </View>
      ) : null}

      <View style={[s.searchShell, compact && s.searchShellCompact]}>
        <Search size={compact ? 12 : 13} color={METRONIC.muted} strokeWidth={2.2} />
        <TextInput
          style={[s.searchInput, compact && s.searchInputCompact]}
          value={query}
          onChangeText={setQuery}
          placeholder={compact ? "Search lanes…" : "Search origin, destination, vehicle…"}
          placeholderTextColor={METRONIC.muted}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <X size={13} color={METRONIC.subtle} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={METRONIC.link} style={{ marginVertical: 8 }} />
      ) : filtered.length === 0 ? (
        <Text style={[s.noMatch, compact && s.noMatchCompact]}>
          {query.trim() || warehouseFilter
            ? `No lanes match${query.trim() ? ` “${query.trim()}”` : ""}${warehouseFilter ? " for this warehouse" : ""}.`
            : "No contract lanes yet."}
        </Text>
      ) : (
        /**
         * ScrollView, not FlatList: this picker renders inside the wizard shell's
         * vertical ScrollView, and a nested VirtualizedList breaks windowing (RN
         * warns). The list is height-capped (120–240px) so virtualization gains
         * nothing here anyway.
         */
        <ScrollView
          style={[
            s.list,
            compact && s.listCompact,
            selected ? (compact ? s.listWhenSelectedCompact : s.listWhenSelected) : null,
          ]}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((lane) => {
            const active = lane.id === selectedLaneId;
            const valid = isLaneCurrentlyValid(lane);
            return (
              <Pressable
                key={lane.id}
                onPress={() => onSelect(lane)}
                style={({ pressed }) => [
                  s.row,
                  compact && s.rowCompact,
                  active && s.rowActive,
                  pressed && { opacity: 0.92 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={s.rowCopy}>
                  <Text
                    style={[
                      s.rowTitle,
                      compact && s.rowTitleCompact,
                      active && s.rowTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {formatLaneRouteLabel(lane.origin_label, lane.destination_label) ||
                      `${lane.origin_label} → ${lane.destination_label}`}
                  </Text>
                  <Text style={[s.rowMeta, compact && s.rowMetaCompact]} numberOfLines={1}>
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
                  <CheckCircle2
                    size={compact ? 12 : 13}
                    color={METRONIC.link}
                    strokeWidth={2.4}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    marginTop: 10,
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  rootCompact: {
    marginTop: 0,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 5,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 18,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    color: METRONIC.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  kickerCompact: {
    fontSize: 9,
    letterSpacing: 0.45,
  },
  sub: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 14,
  },
  subCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  tagScroll: {
    flexGrow: 0,
    marginTop: 1,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 1,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: 150,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surfaceGray,
  },
  tagCompact: {
    maxWidth: 128,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.text,
    flexShrink: 1,
  },
  tagTextActive: {
    color: Theme.textOnPrimary,
  },
  tagCount: {
    fontSize: 8,
    fontWeight: "800",
    color: METRONIC.muted,
  },
  tagCountActive: {
    color: Theme.textOnPrimary,
    opacity: 0.75,
  },
  emptyHint: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 15,
  },
  emptyHintCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
  clearBtn: { paddingVertical: 1, paddingHorizontal: 2 },
  clearText: { fontSize: 11, fontWeight: "700", color: METRONIC.link },
  clearTextCompact: { fontSize: 10 },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.aggregatePillBorder,
    backgroundColor: Theme.fiscalTabActiveBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 40,
  },
  selectedCardCompact: {
    gap: 6,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minHeight: 34,
  },
  selectedIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  selectedIconCompact: {
    width: 22,
    height: 22,
    borderRadius: 5,
  },
  selectedCopy: { flex: 1, minWidth: 0, gap: 1 },
  selectedRoute: { fontSize: 12, fontWeight: "700", color: METRONIC.text },
  selectedRouteCompact: { fontSize: 11 },
  selectedMeta: { fontSize: 10, fontWeight: "500", color: METRONIC.subtle },
  selectedMetaCompact: { fontSize: 9, lineHeight: 12 },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 34,
  },
  searchShellCompact: {
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minHeight: 32,
    gap: 5,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.text,
    padding: 0,
    margin: 0,
    ...(Platform.select({ web: { outlineStyle: "none" } as object }) ?? {}),
  },
  searchInputCompact: {
    fontSize: 11,
  },
  list: {
    maxHeight: 240,
    marginTop: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surfaceGray,
    overflow: "hidden",
  },
  listCompact: {
    maxHeight: 220,
    marginTop: 0,
    borderRadius: 7,
  },
  listWhenSelected: {
    maxHeight: 140,
  },
  listWhenSelectedCompact: {
    maxHeight: 120,
  },
  noMatch: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
    paddingVertical: 6,
  },
  noMatchCompact: {
    fontSize: 10,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  rowCompact: {
    paddingVertical: 6,
    paddingHorizontal: 7,
    gap: 5,
    minHeight: 40,
  },
  rowActive: {
    backgroundColor: Theme.fiscalTabActiveBg,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 12, fontWeight: "700", color: METRONIC.text },
  rowTitleCompact: { fontSize: 11 },
  rowTitleActive: { color: METRONIC.link },
  rowMeta: { fontSize: 10, fontWeight: "500", color: METRONIC.subtle, lineHeight: 13 },
  rowMetaCompact: { fontSize: 9, lineHeight: 12 },
});
