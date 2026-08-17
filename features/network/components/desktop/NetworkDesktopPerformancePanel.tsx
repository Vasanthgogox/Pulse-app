/**
 * Hub Performance tab — the future unified Target vs Actual / cross-filtered
 * analytics page (Goals + Sales + Asset merge).
 *
 * Phase 1, Commit 1 (route proof only): this spinner is NOT the intended
 * Performance UX. It exists solely to prove Network -> Performance -> this
 * panel resolves correctly. Real content lands over Phase 1's remaining
 * commits. See docs/PERFORMANCE_PHASE1_IMPLEMENTATION_MAP.md.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { StyleSheet, View } from "react-native";

type Props = {
  orgId: string;
};

export function NetworkDesktopPerformancePanel({ orgId: _orgId }: Props) {
  return (
    <View style={styles.root}>
      <LoadingIndicator color={Theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
});
