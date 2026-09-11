import type { TripHubInTransitPingMeta } from "@/features/trips/hooks/useTripHubInTransitPings";
import { TripHubDriverPresenceBadge } from "@/features/trips/components/TripHubDriverPresenceBadge";
import { StyleSheet, View } from "react-native";

type Props = {
  ping: TripHubInTransitPingMeta | null | undefined;
};

/** Offline/online chip — used under the driver name on trip cards. */
export function TripHubInTransitPingLines({ ping }: Props) {
  if (!ping?.offlineLabel?.trim()) return null;

  return (
    <View style={styles.wrap}>
      <TripHubDriverPresenceBadge ping={ping} variant="belowName" alignEnd />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "flex-end",
    marginTop: 2,
    maxWidth: "100%",
  },
});
