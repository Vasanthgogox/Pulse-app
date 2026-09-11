import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { StyleSheet, Text, View } from "react-native";

export function FinanceProSection({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.2,
  },
  note: {
    marginTop: 4,
    fontSize: 12,
    color: METRONIC.subtle,
  },
});
