import React, { useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Theme from "@/constants/Theme";
import { LeafletMap, type LeafletLatLng } from "@/components/driver/LeafletMap";
import type { DriverGuidanceConfig } from "@/types/driver";
import type { RouteResult } from "@/services/routingService";

export type TripStopCoord = { latitude: number; longitude: number };

interface DriverMapViewProps {
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  pickupCoord: TripStopCoord | null;
  dropCoord: TripStopCoord | null;
  /** Driver's latest GPS point to render "you are here" marker */
  currentLocation: TripStopCoord | null;
  /** Highlight pickup or drop pin to match guidance target */
  highlightTarget: "pickup" | "drop" | null;
  route: RouteResult | null;
  guidance: DriverGuidanceConfig | null;
  /** Map tiles + userInterfaceStyle: use DriverTheme map setting (auto/light/dark), not only app theme. */
  mapStyleDark: boolean;
  mapRef: React.RefObject<any>;
  onToggleFullMap: () => void;
  onFocusLocation: () => void;
  isFullMap?: boolean;
  /** Bottom padding so route stays above sheet (px) */
  mapPadding?: number;
  colors: {
    surface: string;
    border: string;
    text: string;
    textMuted: string;
    emerald: string;
    emeraldMuted: string;
  };
}

export const DriverMapView: React.FC<DriverMapViewProps> = ({
  region,
  pickupCoord,
  dropCoord,
  currentLocation,
  highlightTarget,
  route,
  guidance,
  mapRef,
  onToggleFullMap,
  onFocusLocation,
  isFullMap = false,
  mapPadding = 0,
  colors,
}) => {
  const insets = useSafeAreaInsets();
  const controlsTop = isFullMap ? insets.top + 12 : 12;

  const markers = useMemo(() => {
    const out: Array<{ id: string; coordinate: LeafletLatLng; label?: string; color?: string }> =
      [];
    if (pickupCoord) {
      out.push({
        id: "pickup",
        coordinate: pickupCoord,
        label: "Pickup",
        color: highlightTarget === "pickup" ? Theme.positive : `${Theme.positive}cc`,
      });
    }
    if (dropCoord) {
      out.push({
        id: "drop",
        coordinate: dropCoord,
        label: "Drop",
        color: highlightTarget === "drop" ? Theme.negative : `${Theme.negative}cc`,
      });
    }
    if (currentLocation) {
      out.push({ id: "me", coordinate: currentLocation, label: "You", color: "#3b82f6" });
    }
    return out;
  }, [pickupCoord, dropCoord, currentLocation, highlightTarget]);

  const polyline = useMemo(() => route?.coordinates ?? [], [route?.coordinates]);

  const fitTrip = useCallback(() => {
    // LeafletMap auto-fits when polyline exists; for pickup/drop only we rely on center/zoom.
    void mapRef;
  }, [mapRef]);

  const center = useMemo(
    () => ({ latitude: region.latitude, longitude: region.longitude }),
    [region.latitude, region.longitude],
  );

  return (
    <View style={styles.container}>
      <LeafletMap
        style={StyleSheet.absoluteFill}
        center={center}
        zoom={14}
        markers={markers}
        polyline={polyline}
        lowPower={false}
      />

      {guidance ? (
        <View
          style={[
            styles.guidanceChip,
            isFullMap ? { top: insets.top + 12, left: 12, right: 72 } : { top: 12, left: 12, right: 72 },
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.guidanceHeader}>
            <View style={[styles.iconWrap, { backgroundColor: colors.emeraldMuted }]}>
              <FontAwesome name={guidance.icon} size={14} color={colors.emerald} />
            </View>
            <Text style={[styles.guidanceTitle, { color: colors.text }]} numberOfLines={1}>
              {guidance.title}
            </Text>
          </View>
          <Text style={[styles.guidanceSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
            {guidance.subtitle}
          </Text>
        </View>
      ) : null}

      <View style={[styles.controls, { top: controlsTop }]}>
        <TouchableOpacity
          onPress={() => {
            fitTrip();
            onToggleFullMap();
          }}
          style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <FontAwesome name={isFullMap ? "compress" : "expand"} size={16} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onFocusLocation}
          style={[
            styles.controlBtn,
            styles.locationControlBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Current location"
          accessibilityHint="Centers map on your live location"
        >
          <View style={[styles.locationIconHalo, { backgroundColor: colors.emeraldMuted }]}>
            <FontAwesome name="location-arrow" size={15} color={colors.emerald} />
          </View>
          <View style={[styles.locationLiveDot, { backgroundColor: colors.emerald }]} />
        </TouchableOpacity>
      </View>

      {/* keep route above any bottom sheet by padding map container */}
      {mapPadding > 0 ? <View pointerEvents="none" style={{ height: mapPadding }} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  guidanceChip: {
    position: "absolute",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  guidanceHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  guidanceTitle: { fontSize: 14, fontWeight: "bold", flex: 1 },
  guidanceSubtitle: { fontSize: 12 },
  controls: { position: "absolute", right: 16 },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    elevation: 4,
  },
  locationControlBtn: {
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 6,
  },
  locationIconHalo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  locationLiveDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
});

