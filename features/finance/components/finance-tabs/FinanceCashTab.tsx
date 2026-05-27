import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { lazy, Suspense } from "react";
import { Platform, useWindowDimensions } from "react-native";
import type { FinanceTabBodyProps } from "../FinanceTabBody.types";
import { FinanceCashLedgerPanel } from "./FinanceCashLedgerPanel";

const FinanceCashKanbanPanel = lazy(() =>
  import("./FinanceCashKanbanPanel").then((m) => ({
    default: m.FinanceCashKanbanPanel,
  })),
);

/** Cash tab: ledger on phone/tablet; kanban lazy on web desktop only. */
export function FinanceCashTab(props: FinanceTabBodyProps) {
  const { width: windowWidth } = useWindowDimensions();
  // Expo web is a SPA — useWindowDimensions is synchronous in the browser,
  // so no SSR hydration concern. No mounted-delay needed.
  const isWebLargeScreen = Platform.OS === "web" && windowWidth >= 1024;

  if (!isWebLargeScreen) {
    return <FinanceCashLedgerPanel {...props} />;
  }

  return (
    <Suspense fallback={<LazySuspenseNullFallback />}>
      <FinanceCashKanbanPanel {...props} />
    </Suspense>
  );
}
