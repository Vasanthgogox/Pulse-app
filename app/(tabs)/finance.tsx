import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import { lazy, Suspense } from "react";

const FinanceScreen = lazy(() =>
  import("@/features/finance/components/FinanceScreen").then((m) => ({
    default: m.FinanceScreen,
  })),
);

/** Tab chrome is already visible — show inline spinner while Metro loads the fiscal chunk. */
export default function FinanceTab() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback message="Loading finance…" />}>
      <FinanceScreen />
    </Suspense>
  );
}
