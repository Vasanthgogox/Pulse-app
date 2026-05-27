/**
 * Finance sub-tab bodies — eager imports so party lists bundle with FinanceScreen.
 */
import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import type { ComponentType } from 'react';
import type { FinanceSubTab } from '../types';
import { FinanceCashTab } from './finance-tabs/FinanceCashTab';
import { FinanceCustomersTab } from './finance-tabs/FinanceCustomersTab';
import { FinanceDriversTab } from './finance-tabs/FinanceDriversTab';
import { FinanceGarageTab } from './finance-tabs/FinanceGarageTab';
import { FinanceSuppliersTab } from './finance-tabs/FinanceSuppliersTab';
import type { FinanceTabBodyProps } from './FinanceTabBody.types';

export type { FinanceTabBodyProps } from './FinanceTabBody.types';

const TAB_COMPONENTS: Partial<
  Record<FinanceSubTab, ComponentType<FinanceTabBodyProps>>
> = {
  cash: FinanceCashTab,
  customers: FinanceCustomersTab,
  suppliers: FinanceSuppliersTab,
  garage: FinanceGarageTab,
  drivers: FinanceDriversTab,
};

export function FinanceTabBody(props: FinanceTabBodyProps) {
  const TabPanel = TAB_COMPONENTS[props.financeSubTab];
  if (!TabPanel) return null;

  if (props.entitiesLoading && props.financeSubTab !== 'cash') {
    return <LazySuspenseInlineFallback message="Loading parties…" />;
  }

  return <TabPanel {...props} />;
}
