/**
 * Finance tab and ledger UI types. Used by FinanceScreen and related components.
 */

export type FinancePeriodFilter = "TODAY" | "MONTH" | "RANGE";

export type FinanceSubTab =
  | "cash"
  | "customers"
  | "suppliers"
  | "garage"
  | "drivers";

export const TABS: { id: FinanceSubTab; label: string }[] = [
  { id: "cash", label: "CASH" },
  { id: "customers", label: "CUSTOMERS" },
  { id: "suppliers", label: "SUPPLIERS" },
  { id: "garage", label: "GARAGE" },
  { id: "drivers", label: "DRIVERS" },
];

/** Min width per tab; when 5 * this > screen width, tab row becomes horizontally scrollable. */
export const MIN_FISCAL_TAB_WIDTH = 56;

export const SUMMARY_LABELS: Record<FinanceSubTab, { in: string; out: string }> = {
  cash: { in: "Total Cash In", out: "Total Cash Out" },
  customers: { in: "Total Billing", out: "Total Balance" },
  suppliers: { in: "Total Payables", out: "Unsettled Due" },
  garage: { in: "Vehicle Revenue", out: "Net Profit" },
  drivers: { in: "Total Payroll", out: "Salary Due" },
};

export const ADD_NODE_LABELS: Record<Exclude<FinanceSubTab, "cash">, string> = {
  customers: "Add client",
  suppliers: "Add supplier",
  garage: "Add vehicle",
  drivers: "Add driver",
};

/** Last column header for entity tabs: PENDING | DUE | PROFIT | DUE */
export const LAST_COL_LABEL: Record<FinanceSubTab, string> = {
  customers: "PENDING",
  suppliers: "DUE",
  garage: "PROFIT",
  drivers: "DUE",
  cash: "DUE",
};

export const LEDGER_CATEGORY_STORAGE_KEY = "finance_ledger_entity_category";

export type LedgerCategory = "all" | "customers" | "suppliers" | "vehicle" | "driver";

export const LEDGER_CATEGORIES: LedgerCategory[] = [
  "all",
  "customers",
  "suppliers",
  "vehicle",
  "driver",
];
