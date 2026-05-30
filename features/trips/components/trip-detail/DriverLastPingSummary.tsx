import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View } from "react-native";
import {
  buildDriverLastPingDisplay,
  type DriverLastPingDisplay,
} from "@/features/trips/utils/driverLastPingDisplay.util";

/** Matches manifest ref tab label scale (`refTabBtnText`). */
const TAB_LABEL = {
  fontSize: 8,
  fontWeight: "800" as const,
  letterSpacing: 0.8,
  textTransform: "uppercase" as const,
};

type Props = {
  latitude?: number | null;
  longitude?: number | null;
  locationAddress?: string | null;
  recordedAt?: string | null;
  /** Pre-built display; skips build when provided. */
  display?: DriverLastPingDisplay;
  variant?: "light" | "dark";
};

export function DriverLastPingSummary({
  latitude,
  longitude,
  locationAddress,
  recordedAt,
  display: displayProp,
  variant = "light",
}: Props) {
  const display =
    displayProp ??
    buildDriverLastPingDisplay({
      latitude,
      longitude,
      locationAddress,
      recordedAt,
    });

  if (!display.hasPing) return null;

  const isDark = variant === "dark";
  const locationText =
    display.locationLabel?.trim() || display.cityLabel?.trim() || "—";

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <View style={styles.row}>
        <FontAwesome
          name="map-marker"
          size={11}
          color={isDark ? "#a5b4fc" : Theme.pulseIndigo}
          style={styles.pin}
        />
        <View style={styles.body}>
          <Text style={[styles.label, isDark && styles.labelDark]}>
            Last ping
          </Text>
          <Text
            style={[styles.location, isDark && styles.locationDark]}
            numberOfLines={2}
          >
            {locationText}
          </Text>
          {display.recordedAtLabel ? (
            <Text style={[styles.time, isDark && styles.timeDark]}>
              {display.recordedAtLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 8,
  },
  cardDark: {
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  pin: {
    marginTop: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  label: {
    ...TAB_LABEL,
    color: "#94a3b8",
  },
  labelDark: {
    color: "#64748b",
  },
  location: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1e293b",
    lineHeight: 15,
  },
  locationDark: {
    color: "#e2e8f0",
  },
  time: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748b",
    lineHeight: 13,
  },
  timeDark: {
    color: "#94a3b8",
  },
});
