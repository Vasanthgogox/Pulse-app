import Theme from "@/constants/Theme";
import { Pressable, StyleSheet, Text } from "react-native";

export function FinanceProTextAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.primary,
  },
});
