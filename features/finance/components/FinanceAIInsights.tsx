/**
 * Lazy AI insights strip for the Cash tab.
 */
import { lazy, Suspense } from "react";
import { View } from "react-native";
import { styles } from "./FinanceScreen.styles";

const AIInsightsPanel = lazy(() =>
  import("@/features/ai/components/AIInsightsPanel").then((m) => ({
    default: m.AIInsightsPanel,
  })),
);

export function FinanceAIInsights({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <View style={styles.aiInsightsWrap}>
      <Suspense fallback={null}>
        <AIInsightsPanel organizationId={organizationId} />
      </Suspense>
    </View>
  );
}
