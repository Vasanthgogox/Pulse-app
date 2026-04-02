import { Text, TouchableOpacity, View } from "react-native";
import type { OpsAgentStyles } from "../opsAgentStyles";
import { OpsAgentBotSvg } from "./OpsAgentBotSvg";

const QUICK_PILLS = [
  "Add a client",
  "Create a trip",
  "What's my revenue?",
  "Give me a report",
  "Add a driver",
  "Add a vehicle",
];

interface OpsAgentEmptyStateProps {
  onQuickPillPress: (label: string) => void;
  styles: OpsAgentStyles;
}

export function OpsAgentEmptyState({ onQuickPillPress, styles }: OpsAgentEmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <OpsAgentBotSvg width={120} height={144} />
      </View>
      <Text style={styles.emptyTitle}>Ops Agent Online</Text>
      <Text style={styles.emptySub}>
        Add clients, suppliers, drivers, vehicles or trips by typing naturally. Ask about revenue,
        fleet, or generate a full PDF report.
      </Text>
      <View style={styles.quickPills}>
        {QUICK_PILLS.map((label) => (
          <TouchableOpacity
            key={label}
            style={styles.quickPill}
            onPress={() => onQuickPillPress(label)}
            activeOpacity={0.8}
          >
            <Text style={styles.quickPillText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
