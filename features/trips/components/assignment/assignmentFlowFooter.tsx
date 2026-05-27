import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Theme from "@/constants/Theme";
import { PULSE_TRIP, PULSE_TRIP_RADIUS } from "@/features/trips/components/add-trip/addTripPulseTheme";

export interface AssignmentFlowFooterProps {
  summary?: string;
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  loading?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}

export function AssignmentFlowFooter({
  summary,
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  loading = false,
  secondaryLabel,
  onSecondaryPress,
}: AssignmentFlowFooterProps) {
  return (
    <View style={styles.wrap}>
      {summary ? (
        <Text style={styles.summary} numberOfLines={2}>
          {summary}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.primary, (primaryDisabled || loading) && styles.primaryDisabled]}
        onPress={onPrimaryPress}
        disabled={primaryDisabled || loading}
        activeOpacity={0.9}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        )}
      </TouchableOpacity>
      {secondaryLabel && onSecondaryPress ? (
        <TouchableOpacity
          style={styles.secondary}
          onPress={onSecondaryPress}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  summary: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 15,
  },
  primary: {
    minHeight: 46,
    borderRadius: PULSE_TRIP_RADIUS.btn,
    backgroundColor: PULSE_TRIP.indigo,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  secondary: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
  },
});
