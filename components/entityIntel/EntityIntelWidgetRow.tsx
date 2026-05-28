import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type EntityIntelWidgetTone = "default" | "good" | "warn" | "bad";

export type EntityIntelWidget = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: EntityIntelWidgetTone;
  onPress?: () => void;
};

function toneColor(tone: EntityIntelWidgetTone): string {
  switch (tone) {
    case "good":
      return Theme.darkGreen;
    case "warn":
      return Theme.warning;
    case "bad":
      return Theme.teslaRed;
    default:
      return Theme.textPrimaryDark;
  }
}

export function EntityIntelWidgetRow({
  widgets,
  style,
}: {
  widgets: EntityIntelWidget[];
  style?: StyleProp<ViewStyle>;
}) {
  if (widgets.length === 0) return null;
  return (
    <View style={[styles.row, style]}>
      {widgets.map((widget) => {
        const tone = widget.tone ?? "default";
        const valueColor = toneColor(tone);
        const inner = (
          <>
            <Text style={styles.label} numberOfLines={1}>
              {widget.label}
            </Text>
            <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
              {widget.value}
            </Text>
            {widget.hint ? (
              <Text style={styles.hint} numberOfLines={1}>
                {widget.hint}
              </Text>
            ) : null}
            {widget.onPress ? (
              <FontAwesome
                name="chevron-right"
                size={8}
                color={Theme.textMuted}
                style={styles.chevron}
              />
            ) : null}
          </>
        );
        if (widget.onPress) {
          return (
            <Pressable
              key={widget.id}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={widget.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${widget.label}: ${widget.value}`}
            >
              {inner}
            </Pressable>
          );
        }
        return (
          <View key={widget.id} style={styles.card}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    minWidth: 96,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 58,
    justifyContent: "center",
  },
  cardPressed: {
    backgroundColor: Theme.whiteMuted,
  },
  label: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginBottom: 3,
  },
  value: {
    fontSize: 12,
    fontWeight: "800",
  },
  hint: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  chevron: {
    position: "absolute",
    right: 8,
    top: 10,
  },
});
