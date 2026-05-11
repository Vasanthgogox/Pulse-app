import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { MapPin } from "lucide-react-native";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import Theme from "@/constants/Theme";
import type { TripMessageRow } from "../types/chat.types";
import type { SystemLogLocationData } from "../utils/locationLogPayload.util";
import { buildStaticMapImageUrl } from "../utils/staticMapUrl.util";

const MAP_W = 280;
const MAP_H = 120;

export interface LocationEventCardProps {
  message: TripMessageRow;
  location: SystemLogLocationData;
}

/**
 * Non-interactive static map thumbnail for `system_log` rows with `event_payload.location_data`.
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

  return (
    <View style={s.card} accessibilityRole="text" accessibilityLabel={label || "Driver location update"}>
      <View style={s.headerRow}>
        <View style={s.iconWrap}>
          <MapPin size={16} color={CHAT_ACCENT} />
        </View>
        <View style={s.headerText}>
          <Text style={s.title} numberOfLines={2}>
            {message.content?.trim() ? message.content : "Location update"}
          </Text>
          <Text style={s.time}>{displayTime}</Text>
        </View>
      </View>

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
          <MapPin size={28} color={Theme.textSecondary} />
          <Text style={s.placeholderHint}>Map preview unavailable</Text>
        </View>
      )}

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
    maxWidth: 320,
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT_ACCENT_SOFT,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CHAT_ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, color: Theme.textPrimary, fontWeight: "600" },
  time: { fontSize: 12, color: Theme.textSecondary, marginTop: 2 },
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
    marginTop: 6,
    fontSize: 11,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  address: {
    marginTop: 8,
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
});
