import Theme from "@/constants/Theme";
import type { TripHubInTransitPingMeta } from "@/features/trips/hooks/useTripHubInTransitPings";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  ping: TripHubInTransitPingMeta | null | undefined;
  variant?: "belowName" | "inline";
  alignEnd?: boolean;
};

/** Driver online / offline — row under the driver name (or inline). */
export function TripHubDriverPresenceBadge({
  ping,
  variant = "inline",
  alignEnd = false,
}: Props) {
  if (!ping) return null;

  const online = ping.isOnline;
  const statusText = online ? "Online" : ping.offlineLabel ?? "Offline";
  const toneColor = online ? Theme.positive : Theme.destructive;

  const row = (
    <View style={[styles.row, alignEnd && styles.rowEnd]}>
      <Feather name="user" size={8} color={toneColor} />
      <View
        style={[styles.dot, online ? styles.dotOnline : styles.dotOffline]}
      />
      <Text style={[styles.label, { color: toneColor }]} numberOfLines={1}>
        {statusText}
      </Text>
    </View>
  );

  if (variant === "belowName") {
    return <View style={[styles.belowWrap, alignEnd && styles.belowWrapEnd]}>{row}</View>;
  }

  return row;
}

const styles = StyleSheet.create({
  belowWrap: {
    alignSelf: "flex-start",
    marginTop: 2,
  },
  belowWrapEnd: {
    alignSelf: "flex-end",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  rowEnd: {
    justifyContent: "flex-end",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  dotOnline: {
    backgroundColor: Theme.positive,
  },
  dotOffline: {
    backgroundColor: Theme.destructive,
  },
  label: {
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: "600",
    flexShrink: 1,
  },
});
