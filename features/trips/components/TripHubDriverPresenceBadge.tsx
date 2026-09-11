import Theme from "@/constants/Theme";
import type { TripHubInTransitPingMeta } from "@/features/trips/hooks/useTripHubInTransitPings";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  ping: TripHubInTransitPingMeta | null | undefined;
  variant?: "belowName" | "inline";
  alignEnd?: boolean;
};

/** Driver online / offline — compact status under the driver name. */
export function TripHubDriverPresenceBadge({
  ping,
  variant = "inline",
  alignEnd = false,
}: Props) {
  if (!ping) return null;

  const online = ping.isOnline;
  const statusText = online ? "Online" : ping.offlineLabel ?? "Offline";

  const row = (
    <View
      style={[
        styles.chip,
        online ? styles.chipOnline : styles.chipOffline,
        alignEnd && styles.chipEnd,
      ]}
    >
      <View
        style={[styles.dot, online ? styles.dotOnline : styles.dotOffline]}
      />
      <Text
        style={[styles.label, online ? styles.labelOnline : styles.labelOffline]}
        numberOfLines={1}
      >
        {statusText}
      </Text>
    </View>
  );

  if (variant === "belowName") {
    return (
      <View style={[styles.belowWrap, alignEnd && styles.belowWrapEnd]}>
        {row}
      </View>
    );
  }

  return row;
}

const styles = StyleSheet.create({
  belowWrap: {
    alignSelf: "flex-start",
    marginTop: 3,
  },
  belowWrapEnd: {
    alignSelf: "flex-end",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    maxWidth: "100%",
  },
  chipEnd: {
    justifyContent: "flex-end",
  },
  chipOnline: {
    backgroundColor: Theme.positive,
  },
  chipOffline: {
    backgroundColor: Theme.destructive,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    flexShrink: 0,
  },
  dotOnline: {
    backgroundColor: "#fff",
  },
  dotOffline: {
    backgroundColor: "#fff",
  },
  label: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    letterSpacing: 0.15,
    flexShrink: 1,
  },
  labelOnline: {
    color: "#fff",
  },
  labelOffline: {
    color: "#fff",
  },
});
