import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import { MetricDisplay, Surface } from "@/components/operational";

export function OperationalAlertsPanel({
  postingFailures,
  retryFailures,
  reimbursementBacklog,
  offlineFailures,
}: {
  postingFailures: number;
  retryFailures: number;
  reimbursementBacklog: number;
  offlineFailures: number;
}) {
  const hasCritical = postingFailures > 0 || offlineFailures > 0;
  return (
    <Surface style={styles.surface} elevation={2}>
      <View style={styles.header}>
        <Text style={styles.title}>Operational alerts</Text>
        <View
          style={[
            styles.dot,
            hasCritical ? styles.dotCritical : styles.dotHealthy,
          ]}
        />
      </View>
      <View style={styles.metrics}>
        <MetricDisplay
          label="Posting failures"
          value={String(postingFailures)}
          tone={postingFailures > 0 ? "cost" : "neutral"}
          size="compact"
        />
        <MetricDisplay
          label="Retry queue"
          value={String(retryFailures)}
          tone={retryFailures > 0 ? "pending" : "neutral"}
          size="compact"
        />
        <MetricDisplay
          label="Reimbursement backlog"
          value={String(reimbursementBacklog)}
          tone={reimbursementBacklog > 0 ? "pending" : "neutral"}
          size="compact"
        />
        <MetricDisplay
          label="Offline failures"
          value={String(offlineFailures)}
          tone={offlineFailures > 0 ? "cost" : "neutral"}
          size="compact"
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textPrimary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotCritical: { backgroundColor: Theme.negative },
  dotHealthy: { backgroundColor: Theme.positive },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
});
