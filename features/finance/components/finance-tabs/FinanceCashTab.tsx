import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { lazy, Suspense, useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import type { FinanceTabBodyProps } from "../FinanceTabBody.types";
import { FinanceCashLedgerPanel } from "./FinanceCashLedgerPanel";

const FinanceCashKanbanPanel = lazy(() =>
  import("./FinanceCashKanbanPanel").then((m) => ({
    default: m.FinanceCashKanbanPanel,
  })),
);

/** Cash tab: ledger eager on phone/tablet; kanban lazy on web desktop only. */
export function FinanceCashTab(props: FinanceTabBodyProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Defer to after mount to avoid SSR/client hydration mismatch.
  const isWebLargeScreen = mounted && Platform.OS === "web" && windowWidth >= 1024;

  if (!isWebLargeScreen) {
    return <FinanceCashLedgerPanel {...props} />;
  }

  return (
    <Suspense fallback={<LazySuspenseNullFallback />}>
      <FinanceCashKanbanPanel {...props} />
    </Suspense>
  );
}
