import React, { useMemo } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { MapPin } from "lucide-react-native";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import Theme from "@/constants/Theme";
import type { TripMessageRow } from "../types/chat.types";
import type { SystemLogLocationData } from "../utils/locationLogPayload.util";
import { mapsUrlForCoordinates } from "../utils/locationLogPayload.util";
import { buildStaticMapImageUrl } from "../utils/staticMapUrl.util";

const MAP_W = 280;
const MAP_H = 120;

export interface LocationEventCardProps {
  message: TripMessageRow;
  location: SystemLogLocationData;
}

/**
 * Static map thumbnail for location-bearing trip messages; tap opens maps app.
 */
export function LocationEventCard({ message, location }: LocationEventCardProps) {
  const mapUrl = useMemo(
    () => buildStaticMapImageUrl(location.lat, location.lng, MAP_W, MAP_H),
    [location.lat, location.lng],
  );

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const label = (location.address_name ?? "").trim();
  const coordsLabel = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;

  const openMaps = () => {
    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${location.lat},${location.lng}${label ? `(${encodeURIComponent(label)})` : ""}`
        : mapsUrlForCoordinates(location.lat, location.lng, label || null);
    void Linking.openURL(url).catch(() => {
      void Linking.openURL(mapsUrlForCoordinates(location.lat, location.lng, label || null));
    });
  };

  return (
    <View style={s.card} accessibilityRole="text" accessibilityLabel={label || "Driver location update"}>
      <View style={s.headerRow}>
        <View style={s.iconWrap}>
          <MapPin size={14} color={CHAT_ACCENT} />
        </View>
        <View style={s.headerText}>
          <Text style={s.title} numberOfLines={2}>
            {message.content?.trim() ? message.content : "Location update"}
          </Text>
          <Text style={s.time}>{displayTime}</Text>
        </View>
      </View>

      <Pressable
        onPress={openMaps}
        accessibilityRole="button"
        accessibilityLabel={label ? `Open map for ${label}` : "Open map for this location"}
        style={({ pressed }) => [s.mapPressable, pressed && s.mapPressablePressed]}
      >
        {mapUrl ? (
          <View style={s.mapFrame} importantForAccessibility="no-hide-descendants">
            <Image
              source={{ uri: mapUrl }}
              style={s.mapImage}
              contentFit="cover"
              recyclingKey={mapUrl}
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : (
          <View style={[s.mapFrame, s.mapPlaceholder]} importantForAccessibility="no-hide-descendants">
            <MapPin size={24} color={Theme.textSecondary} />
            <Text style={s.placeholderHint}>Tap to open in Maps</Text>
          </View>
        )}
        <Text style={s.mapTapHint}>View on map</Text>
      </Pressable>

      <Text style={s.coords} numberOfLines={1}>
        {coordsLabel}
      </Text>
      {label ? (
        <Text style={s.address} numberOfLines={3}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    alignSelf: "center",
    maxWidth: 300,
    marginVertical: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT_ACCENT_SOFT,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CHAT_ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 12, color: Theme.textPrimary, fontWeight: "600", lineHeight: 16 },
  time: { fontSize: 10, color: Theme.textSecondary, marginTop: 2 },
  mapPressable: { borderRadius: 8, overflow: "hidden" },
  mapPressablePressed: { opacity: 0.88 },
  mapFrame: {
    width: "100%",
    height: MAP_H,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: CHAT_ACCENT_SOFT,
  },
  mapImage: { width: "100%", height: "100%" },
  mapPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  placeholderHint: {
    marginTop: 4,
    fontSize: 10,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  mapTapHint: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    color: CHAT_ACCENT,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  coords: {
    marginTop: 6,
    fontSize: 10,
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  address: {
    marginTop: 4,
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 15,
  },
});
