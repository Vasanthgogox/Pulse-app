import Theme from "@/constants/Theme";
import { LeafletMap } from "@/components/driver/LeafletMap";
import type { LeafletMarker } from "@/components/driver/LeafletMap";
import type { ExecutionPlanRouteSummary } from "@/features/network/utils/executionPlanRouteSummary";
import { X } from "lucide-react-native";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  title?: string;
  plan: ExecutionPlanRouteSummary | null | undefined;
  onClose: () => void;
};

export function LoadIndentTripPlanPreview({ visible, title, plan, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const mapped = useMemo(() => {
    const stops = plan?.stops ?? [];
    const withCoords = stops.filter(
      (s) => s.latitude != null && s.longitude != null,
    );
    const markers: LeafletMarker[] = withCoords.map((stop) => ({
      id: `${stop.kind}-${stop.kindIndex}`,
      coordinate: { latitude: stop.latitude as number, longitude: stop.longitude as number },
      label: stop.caption,
      kindIndex: stop.kindIndex,
      color: stop.kind === "drop" ? Theme.driverGold : Theme.driverEmerald,
    }));
    const polyline = withCoords.map((s) => ({
      latitude: s.latitude as number,
      longitude: s.longitude as number,
    }));
    const center = polyline[0] ?? { latitude: 20.5937, longitude: 78.9629 };
    return { stops, markers, polyline, center };
  }, [plan]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>Trip plan</Text>
            <Text style={styles.title} numberOfLines={1}>
              {title?.trim() || "Route preview"}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close trip plan"
          >
            <X size={18} color={Theme.textPrimary} strokeWidth={2.2} />
          </Pressable>
        </View>

        {mapped.markers.length > 0 ? (
          <LeafletMap
            style={styles.map}
            center={mapped.center}
            zoom={11}
            markers={mapped.markers}
            polyline={mapped.polyline}
            polylineColor={Theme.driverEmerald}
            autoFitBoundsOnRouteChange
          />
        ) : (
          <View style={styles.emptyMap}>
            <Text style={styles.emptyTitle}>Stops on this plan</Text>
            <Text style={styles.emptyHint}>
              Map pins appear when pickup and drop coordinates are saved on the plan.
            </Text>
          </View>
        )}

        <View style={styles.list}>
          {mapped.stops.map((stop) => (
            <View key={`${stop.kind}-${stop.kindIndex}`} style={styles.stopRow}>
              <Text
                style={[
                  styles.stopCaption,
                  stop.kind === "drop" ? styles.stopCaptionDrop : styles.stopCaptionPickup,
                ]}
              >
                {stop.caption}
              </Text>
              <Text style={styles.stopPlace} numberOfLines={2}>
                {stop.place}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.driverEmerald,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceLight,
  },
  map: {
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
  },
  emptyMap: {
    minHeight: 88,
    borderRadius: 16,
    padding: 16,
    backgroundColor: Theme.surfaceLight,
    justifyContent: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  emptyHint: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  list: {
    gap: 8,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stopCaption: {
    width: 72,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  stopCaptionPickup: {
    color: Theme.driverEmerald,
  },
  stopCaptionDrop: {
    color: Theme.driverGold,
  },
  stopPlace: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
});
