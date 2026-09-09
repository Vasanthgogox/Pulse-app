/**
 * Central O(n) finance aggregation. Single source of truth: ledger = cash; trips = contractual.
 */
export type {
  LedgerTx,
  TripForCustomer,
  TripForSupplier,
  TripForDriver,
  DriverOfferForAggregation,
  ClientLike,
  SupplierLike,
  DriverLike,
  FinancialRowData,
  AggregationTotals,
  ContactType,
} from './types';
export type { TripPartyMap } from './types';
export { aggregateCustomers } from './aggregateCustomers';
export { aggregateSuppliers } from './aggregateSuppliers';
export { aggregateDrivers, computeDriverCommissionForTrip } from './aggregateDrivers';
export { aggregateDriversFromRpc } from './aggregateDriversFromRpc';
export { aggregateSuppliersFromRpc } from './aggregateSuppliersFromRpc';
export { aggregateCustomersFromRpc } from './aggregateCustomersFromRpc';
export {
  buildMonthlyDriverStatement,
  type MonthlyStatementRow,
  type MonthlyStatementDetail,
  type DriverLedgerEntryForStatement,
  type TripForStatement,
} from './driverMonthlyStatement';
