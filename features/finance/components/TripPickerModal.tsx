/**
 * Shared modal to link a ledger transaction to a trip. Used by FinancialRow (Ledger tab).
 * Layout: "Link mission" / Mission Registry style — compact header, rounded trip cards.
 * Selecting a card shows a confirmation bar; Confirm links the trip and closes.
 */
import Theme from "@/constants/Theme";
import { formatIndianVehicleNumber } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export interface TripPickerOption {
  id: string;
  trip_number: string;
  route?: string | null;
  trip_date?: string | null;
  vehicle_number?: string | null;
  vehicle_type?: string | null;
}

export interface TripPickerModalProps {
  visible: boolean;
  onClose: () => void;
  tripOptions: TripPickerOption[];
  recommendedTripIds?: string[];
  selectedTripId?: string | null;
  onSelect: (tripId: string) => void;
  /** Optional override for vehicle formatting (default: formatIndianVehicleNumber) */
  formatVehicle?: (v: string | null | undefined) => string;
}

export function TripPickerModal({
  visible,
  onClose,
  tripOptions,
  recommendedTripIds = [],
  selectedTripId,
  onSelect,
  formatVehicle = formatIndianVehicleNumber,
}: TripPickerModalProps) {
  const [pendingTripId, setPendingTripId] = useState<string | null>(null);
  const pendingTrip = pendingTripId != null ? tripOptions.find((t) => t.id === pendingTripId) : null;
  const hasChange = pendingTripId != null && pendingTripId !== selectedTripId;

  useEffect(() => {
    if (!visible) setPendingTripId(null);
  }, [visible]);

  const handleConfirm = () => {
    if (pendingTripId != null) {
      onSelect(pendingTripId);
      setPendingTripId(null);
      onClose();
    }
  };

  const handleCancelConfirm = () => {
    setPendingTripId(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.title}>Link mission</Text>
                <Text style={styles.subtitle}>Registry Handshake</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={12}
              >
                <FontAwesome name="times" size={14} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {tripOptions.length === 0 ? (
              <Text style={styles.empty}>No trips to link</Text>
            ) : (
              tripOptions.map((t) => {
                const routeStr = (t as { route?: string | null; route_label?: string | null }).route ?? (t as { route_label?: string | null }).route_label ?? "";
                const routeParts = routeStr.split(/\s*→\s*/);
                const origin = routeParts[0]?.trim() ?? "—";
                const dest = routeParts[1]?.trim() ?? "—";
                return (
                  <Pressable
                    key={t.id}
                    style={({ pressed }) => [
                      styles.item,
                      recommendedTripIds.includes(t.id) && styles.itemRecommended,
                      (selectedTripId === t.id || pendingTripId === t.id) && styles.itemSelected,
                      pressed && styles.itemPressed,
                    ]}
                    onPress={() => setPendingTripId(t.id)}
                  >
                    <View style={styles.itemContent}>
                      <View style={styles.itemRow1}>
                        <Text style={styles.itemTripId} numberOfLines={1}>
                          {t.trip_number}
                        </Text>
                        <Text style={styles.itemDate} numberOfLines={1}>
                          {t.trip_date ?? "—"}
                        </Text>
                      </View>
                      <View style={styles.itemRouteRow}>
                        <Text style={styles.itemRoutePart} numberOfLines={1}>
                          {origin}
                        </Text>
                        <FontAwesome
                          name="arrow-right"
                          size={10}
                          color={Theme.primary}
                          style={styles.itemRouteArrow}
                        />
                        <Text style={styles.itemRoutePart} numberOfLines={1}>
                          {dest}
                        </Text>
                      </View>
                      <View style={styles.itemMetaRow}>
                        {t.vehicle_number ? (
                          <Text style={styles.itemVehicle} numberOfLines={1}>
                            {formatVehicle(t.vehicle_number)}
                          </Text>
                        ) : null}
                        {t.vehicle_type ? (
                          <>
                            {t.vehicle_number ? (
                              <Text style={styles.itemMetaDot}> · </Text>
                            ) : null}
                            <Text style={styles.itemVehicleType} numberOfLines={1}>
                              {t.vehicle_type}
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    {(selectedTripId === t.id || pendingTripId === t.id) ? (
                      <FontAwesome name="check-circle" size={12} color={Theme.primary} />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          {pendingTrip != null && (
            <View style={styles.confirmBar}>
              <Text style={styles.confirmLabel} numberOfLines={2}>
                {hasChange
                  ? `Change to ${pendingTrip.trip_number}?`
                  : `Link this entry to ${pendingTrip.trip_number}?`}
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnSecondary, pressed && styles.confirmBtnPressed]}
                  onPress={handleCancelConfirm}
                >
                  <Text style={styles.confirmBtnSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnPrimary, pressed && styles.confirmBtnPressed]}
                  onPress={handleConfirm}
                >
                  <Text style={styles.confirmBtnPrimaryText}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const CARD_BG = "#FAFBFF";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.3)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "75%",
    backgroundColor: Theme.screenBackground,
    borderRadius: 48,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  subtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginTop: 6,
  },
  list: {
    maxHeight: 340,
  },
  listContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  itemPressed: {
    opacity: 0.95,
  },
  itemSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  itemRecommended: {
    borderLeftWidth: 3,
    borderLeftColor: Theme.primary,
    paddingLeft: 17,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  itemRow1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  itemTripId: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  itemDate: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },
  itemMetaDot: {
    fontSize: 9,
    color: Theme.textMuted,
  },
  itemVehicleType: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  itemRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemRoutePart: {
    fontSize: 11,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    flex: 1,
    minWidth: 0,
  },
  itemRouteArrow: {
    marginHorizontal: 2,
  },
  itemVehicle: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  empty: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: "center",
    paddingVertical: 24,
  },
  confirmBar: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  confirmLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 10,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  confirmBtnPrimary: {
    backgroundColor: Theme.primary,
  },
  confirmBtnSecondary: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  confirmBtnPressed: { opacity: 0.9 },
  confirmBtnPrimaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnPrimary,
  },
  confirmBtnSecondaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  cancel: {
    marginTop: 4,
    marginBottom: 12,
    marginHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  cancelPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
});
