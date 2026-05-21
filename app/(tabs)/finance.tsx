import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { lazy, Suspense } from "react";

const FinanceScreen = lazy(() =>
  import("@/features/finance/components/FinanceScreen").then((m) => ({
    default: m.FinanceScreen,
  })),
);

/** Tab chrome is already visible — avoid a second full-screen splash. */
export default function FinanceTab() {
  return (
    <Suspense fallback={<LazySuspenseNullFallback />}>
      <FinanceScreen />
    </Suspense>
  );
}
