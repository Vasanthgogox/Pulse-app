/**
 * Ratings/feedback placeholder shown on trip detail before a trip is completed.
 * Extracted verbatim from TripDetailScreen.tsx (no behavior change).
 */
import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, Text, View } from "react-native";

import { Theme } from "@/constants/Theme";

export function FeedbackPlaceholder() {
  return (
    <View style={fbStyles.card}>
      <View style={fbStyles.headerRow}>
        <View style={fbStyles.titleCluster}>
          <View style={fbStyles.awardCircle}>
            <Feather name="award" size={22} color={Theme.primary} />
          </View>
          <View style={fbStyles.titleTextWrap}>
            <Text style={fbStyles.title}>Ratings</Text>
            <Text style={fbStyles.subtitle}>
              Track service quality across completed trips
            </Text>
          </View>
        </View>
      </View>
      <View style={fbStyles.body}>
        <Feather name="clock" size={32} color={Theme.borderLight} />
        <Text style={fbStyles.message}>
          Feedback available once the trip is completed
        </Text>
        <Text style={fbStyles.sub}>
          Driver, supplier, and client ratings will appear here with audit-style
          entries when this voyage is closed.
        </Text>
      </View>
    </View>
  );
}

const fbStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginBottom: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  titleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  awardCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  titleTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  body: {
    paddingVertical: 28,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 12,
  },
  message: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  sub: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    maxWidth: 440,
    lineHeight: 18,
  },
});
