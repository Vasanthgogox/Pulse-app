import React, { useMemo } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { MapPin } from "lucide-react-native";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import { CHAT_MOBILE } from "@/features/chat/chatMobileLayout";
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
  isMobile?: boolean;
  /** When > 1, shows a consolidated "N location updates" header instead of individual ping. */
  consolidatedCount?: number;
}

/**
 * Static map thumbnail for location-bearing trip messages; tap opens maps app.
 */
export function LocationEventCard({
  message,
  location,
  isMobile = false,
  consolidatedCount,
}: LocationEventCardProps) {
  const isConsolidated = typeof consolidatedCount === 'number' && consolidatedCount > 1;
  const mapPixelW = isMobile ? 340 : MAP_W;
  const mapPixelH = isMobile ? 132 : MAP_H;
  const mapUrl = useMemo(
    () => buildStaticMapImageUrl(location.lat, location.lng, mapPixelW, mapPixelH),
    [location.lat, location.lng, mapPixelW, mapPixelH],
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

  const mapW = isMobile ? "100%" : MAP_W;

  return (
    <View
      style={[s.card, isMobile && s.cardMobile]}
      accessibilityRole="text"
      accessibilityLabel={label || "Driver location update"}
    >
      <View style={s.headerRow}>
        <View style={[s.iconWrap, isMobile && s.iconWrapMobile]}>
          <MapPin size={isMobile ? 16 : 14} color={CHAT_ACCENT} />
        </View>
        <View style={s.headerText}>
          <Text style={[s.title, isMobile && s.titleMobile]} numberOfLines={3}>
            {isConsolidated
              ? `${consolidatedCount} location updates`
              : (message.content?.trim() ? message.content : "Location ping")}
          </Text>
          <Text style={[s.metaLine, isMobile && s.metaLineMobile]} numberOfLines={2}>
            {isConsolidated ? "Driver location trail · tap to open map" : "Live location · GPS"}
          </Text>
          <Text style={[s.time, isMobile && s.timeMobile]}>{displayTime}</Text>
        </View>
      </View>

      <Pressable
        onPress={openMaps}
        accessibilityRole="button"
        accessibilityLabel={label ? `Open map for ${label}` : "Open map for this location"}
        style={({ pressed }) => [s.mapPressable, pressed && s.mapPressablePressed]}
      >
        {mapUrl ? (
          <View
            style={[s.mapFrame, isMobile && s.mapFrameMobile, { width: mapW }]}
            importantForAccessibility="no-hide-descendants"
          >
            <Image
              source={{ uri: mapUrl }}
              style={s.mapImage}
              contentFit="cover"
              recyclingKey={mapUrl}
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : (
          <View
            style={[s.mapFrame, s.mapPlaceholder, isMobile && s.mapFrameMobile, { width: mapW }]}
            importantForAccessibility="no-hide-descendants"
          >
            <MapPin size={24} color={Theme.textSecondary} />
            <Text style={s.placeholderHint}>Tap to open in Maps</Text>
          </View>
        )}
        <Text style={s.mapTapHint}>View on map</Text>
      </Pressable>

      {label ? (
        <Text style={[s.address, isMobile && s.addressMobile]} numberOfLines={3}>
          {label}
        </Text>
      ) : !isConsolidated ? (
        <Text style={[s.coords, isMobile && s.coordsMobile]} numberOfLines={1}>
          {coordsLabel}
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
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E9EDEF",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardMobile: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    marginVertical: CHAT_MOBILE.eventCardGap / 2,
    paddingHorizontal: CHAT_MOBILE.eventCardPadH,
    paddingVertical: CHAT_MOBILE.eventCardPadV,
    borderRadius: CHAT_MOBILE.eventCardRadius,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CHAT_ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconWrapMobile: {
    width: CHAT_MOBILE.eventAvatar,
    height: CHAT_MOBILE.eventAvatar,
    borderRadius: CHAT_MOBILE.eventAvatar / 2,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 12, color: Theme.textPrimary, fontWeight: "600", lineHeight: 16 },
  titleMobile: {
    fontSize: CHAT_MOBILE.eventTitleSize,
    lineHeight: CHAT_MOBILE.eventTitleLine,
    color: "#111B21",
    fontWeight: "600",
  },
  metaLine: {
    fontSize: 10,
    color: Theme.textSecondary,
    marginTop: 2,
    lineHeight: 14,
  },
  metaLineMobile: {
    fontSize: CHAT_MOBILE.eventMetaSize,
    lineHeight: CHAT_MOBILE.eventMetaLine,
    color: "#667781",
    marginTop: 3,
  },
  time: { fontSize: 10, color: Theme.textSecondary, marginTop: 2 },
  timeMobile: {
    fontSize: CHAT_MOBILE.eventTimeSize,
    color: "#8696A0",
    marginTop: 4,
    fontWeight: "600",
  },
  mapPressable: { borderRadius: 8, overflow: "hidden" },
  mapPressablePressed: { opacity: 0.88 },
  mapFrame: {
    width: "100%",
    height: MAP_H,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: CHAT_ACCENT_SOFT,
  },
  mapFrameMobile: {
    height: 132,
    borderRadius: 10,
    alignSelf: "stretch",
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
  coordsMobile: {
    fontSize: CHAT_MOBILE.eventSubSize,
    color: "#8696A0",
    marginTop: 8,
  },
  address: {
    marginTop: 4,
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  addressMobile: {
    fontSize: CHAT_MOBILE.eventMetaSize,
    lineHeight: CHAT_MOBILE.eventMetaLine,
    color: "#667781",
    marginTop: 4,
  },
});
