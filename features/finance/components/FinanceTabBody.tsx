/**
 * Sub-tab bodies: cash is eager (default path); other tabs lazy-load on first visit.
 */
import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { FinanceCashTab } from "./finance-tabs/FinanceCashTab";
import { lazy, Suspense, type ComponentType } from "react";
import type { FinanceTabBodyProps } from "./FinanceTabBody.types";
import type { FinanceSubTab } from "../types";

export type { FinanceTabBodyProps } from "./FinanceTabBody.types";

const FinanceCustomersTab = lazy(() =>
  import("./finance-tabs/FinanceCustomersTab").then((m) => ({
    default: m.FinanceCustomersTab,
  })),
);
const FinanceSuppliersTab = lazy(() =>
  import("./finance-tabs/FinanceSuppliersTab").then((m) => ({
    default: m.FinanceSuppliersTab,
  })),
);
const FinanceGarageTab = lazy(() =>
  import("./finance-tabs/FinanceGarageTab").then((m) => ({
    default: m.FinanceGarageTab,
  })),
);
const FinanceDriversTab = lazy(() =>
  import("./finance-tabs/FinanceDriversTab").then((m) => ({
    default: m.FinanceDriversTab,
  })),
);

const LAZY_TAB_COMPONENTS: Partial<
  Record<FinanceSubTab, ComponentType<FinanceTabBodyProps>>
> = {
  customers: FinanceCustomersTab,
  suppliers: FinanceSuppliersTab,
  garage: FinanceGarageTab,
  drivers: FinanceDriversTab,
};

export function FinanceTabBody(props: FinanceTabBodyProps) {
  if (props.financeSubTab === "cash") {
    return <FinanceCashTab {...props} />;
  }

  const TabPanel = LAZY_TAB_COMPONENTS[props.financeSubTab];
  if (!TabPanel) return null;

  return (
    <Suspense fallback={<LazySuspenseNullFallback />}>
      <TabPanel {...props} />
    </Suspense>
  );
}
