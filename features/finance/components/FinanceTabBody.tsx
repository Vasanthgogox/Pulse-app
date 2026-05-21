/**
 * Lazy router for finance sub-tab bodies — only the active tab chunk loads.
 */
import { SceneLoadingSplash } from "@/components/chromeLoadingScreens";
import { lazy, Suspense, type ComponentType } from "react";
import type { FinanceTabBodyProps } from "./FinanceTabBody.types";
import type { FinanceSubTab } from "../types";

export type { FinanceTabBodyProps } from "./FinanceTabBody.types";

const FinanceCashTab = lazy(() =>
  import("./finance-tabs/FinanceCashTab").then((m) => ({
    default: m.FinanceCashTab,
  })),
);
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

const TAB_COMPONENTS: Record<
  FinanceSubTab,
  ComponentType<FinanceTabBodyProps>
> = {
  cash: FinanceCashTab,
  customers: FinanceCustomersTab,
  suppliers: FinanceSuppliersTab,
  garage: FinanceGarageTab,
  drivers: FinanceDriversTab,
};

export function FinanceTabBody(props: FinanceTabBodyProps) {
  const TabPanel = TAB_COMPONENTS[props.financeSubTab];
  return (
    <Suspense
      fallback={
        <SceneLoadingSplash variant="preparing" message="Loading tab…" />
      }
    >
      <TabPanel {...props} />
    </Suspense>
  );
}
