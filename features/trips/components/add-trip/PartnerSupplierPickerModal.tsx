/**
 * Transport partner (supplier) picker — same sheet pattern as FleetEntityPickerModal +
 * shared CreateTripSheetSearchInput.
 */
import { CreateTripSheetSearchInput } from "@/components/CreateTripSheetSearchInput";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { Building2, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

function supplierPrimary(s: SupplierRow): string {
  return (
    (s.company_name && s.company_name.trim()) ||
    (s.name && s.name.trim()) ||
    (s.contact_person && s.contact_person.trim()) ||
    "—"
  );
}

function supplierTypeLabel(t?: string | null): string {
  if (!t) return "";
  const map: Record<string, string> = {
    integrated: "Integrated",
    offline: "Offline",
    marketplace: "Marketplace",
  };
  return map[t] ?? t;
}

function supplierSecondary(s: SupplierRow): string {
  const bits = [supplierTypeLabel(s.supplier_type), s.phone, s.email].filter(
    Boolean,
  ) as string[];
  return bits.join(" · ");
}

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase();
}

export interface PartnerSupplierPickerModalProps {
  visible: boolean;
  suppliers: SupplierRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

export function PartnerSupplierPickerModal({
  visible,
  suppliers,
  loading,
  selectedId,
  onSelect,
  onClose,
}: PartnerSupplierPickerModalProps) {
  const { width: winW } = useWindowDimensions();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const blob = [
        s.company_name,
        s.name,
        s.contact_person,
        s.phone,
        s.email,
        s.address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        blob.includes(q) ||
        supplierPrimary(s).toLowerCase().includes(q)
      );
    });
  }, [suppliers, query]);

  const cardMaxW = Math.min(winW - 48, 520);
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  const emptyMessage = (() => {
    if (loading && suppliers.length === 0) return "";
    if (suppliers.length === 0) {
      return "No partners yet. Add suppliers from your network first.";
    }
    if (filtered.length === 0) {
      return "No partners match your search.";
    }
    return "";
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={styles.backdropPress} onPress={onClose}>
          <View style={styles.backdropDim} />
        </Pressable>

        <View style={styles.centerWrap} pointerEvents="box-none">
          <View style={[styles.sheet, { maxWidth: cardMaxW }]}>
            <View style={styles.sheetHead}>
              <View style={styles.sheetTitles}>
                <Text style={styles.sheetTitle}>Select partner</Text>
                <Text style={styles.sheetSubtitle}>
                  Choose a transport partner for this trip
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeBtn, webCursor]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={18} color={Theme.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <CreateTripSheetSearchInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search partner by name, phone, or email…"
              shellStyle={styles.searchShell}
              accessibilityLabel="Search partners"
            />

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                loading && suppliers.length === 0 ? (
                  <View style={styles.loadingState}>
                    <ActivityIndicator size="small" color={Theme.primary} />
                    <Text style={[styles.loadingHint, { marginTop: 12 }]}>
                      Loading partners…
                    </Text>
                  </View>
                ) : emptyMessage ? (
                  <Text style={styles.emptyText}>{emptyMessage}</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <SupplierPickerRow
                  supplier={item}
                  selected={selectedId === item.id}
                  onSelect={() => {
                    onSelect(selectedId === item.id ? null : item.id);
                    onClose();
                  }}
                />
              )}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SupplierPickerRow({
  supplier,
  selected,
  onSelect,
}: {
  supplier: SupplierRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const primary = supplierPrimary(supplier);
  const secondary = supplierSecondary(supplier);
  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <View style={styles.rowIconCircle}>
        <Building2 size={18} color={Theme.iconPrimary} />
      </View>
      <View style={styles.rowTextBlock}>
        <Text style={styles.rowPrimary} numberOfLines={2}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={styles.rowSecondary} numberOfLines={2}>
            {secondary.toUpperCase()}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[styles.selectPill, selected && styles.selectPillSelected, webCursor]}
        onPress={onSelect}
        activeOpacity={0.8}
      >
        <Text
          style={[styles.selectPillText, selected && styles.selectPillTextSelected]}
        >
          {selected ? "Selected" : "Select"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  sheet: {
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
  sheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetTitles: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  searchShell: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  list: {
    maxHeight: 340,
    minHeight: 120,
  },
  listContent: {
    paddingBottom: 16,
  },
  loadingState: {
    alignItems: "center",
    paddingVertical: 36,
  },
  loadingHint: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 12,
  },
  rowSelected: {
    backgroundColor: Theme.surfaceLight,
  },
  rowIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  rowPrimary: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  rowSecondary: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
  },
  selectPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  selectPillSelected: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.positiveMuted,
  },
  selectPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.textPrimaryDark,
  },
  selectPillTextSelected: {
    color: Theme.darkGreen,
  },
});
