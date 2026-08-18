/**
 * Single source of truth for Finance table column flex and fixed widths.
 * Used by FinanceTableHeader (FinanceScreen.styles) and FinancialRow
 * so headers and rows stay aligned. Edit here only when changing column layout.
 * (Garage tab uses its own list layout in GarrageTab.)
 *
 * Golden rule: Name/Entity column 30–35%, metadata 10–20%, amount columns even split.
 *
 * Column breakdown per tab (UX-optimized for finance/ledger scanning):
 *
 * Ledger:     PARTY/ITEM 35% | TRIP/ROUTE 20% | RECEIVED 22.5% | PAID 22.5% | chevron 22px
 * Customers:  ENTITY 34% | TRIPS 12% | BILLED 18% | COLLECTED 18% | TO COLLECT 18%
 * Suppliers:  ENTITY 34% | TRIPS 12% | SOURCED 18% | PAID 18% | DUE 18%
 * Drivers:    DRIVER 34% | TRIPS 12% | EARNINGS 18% | PAID 18% | DUE 18% (aligned with Customers/Suppliers)
 * Garage:     VEHICLE 34% | TRIPS 12% | SALES 18% | EXPENSE 18% | P&L 18%
 *
 * --- UX recommendations (top-tier table UX) ---
 * • Keep header and row flex in sync via this file only.
 * • Use minWidth: 0 on flex children so text truncates instead of overflowing.
 * • Entity/name cells: numberOfLines={1} ellipsizeMode="tail"; show full name on tap/tooltip.
 * • Preserve ≥44pt touch targets (row tap, SOURCE dropdown, entity tap).
 * • Right-align numeric columns (amounts); keep entity/source left or center.
 * • Use Theme colors (e.g. darkGreen/teslaRed for credit/debit).
 */

/** Ledger: entity-largest, then trip/route, then equal amount columns + fixed chevron */
export const LEDGER = {
  node: 0.35,
  mission: 0.2,
  credit: 0.225,
  debit: 0.225,
  /** Fixed width for expand/collapse chevron; must match header spacer */
  chevronWidth: 22,
} as const;

/** Customers / Suppliers: identical layout for UI consistency; entity largest, amounts equal */
export const CUSTOMERS_SUPPLIERS = {
  node: 0.34,
  trips: 0.12,
  mission: 0.18,
  credit: 0.18,
  debit: 0.18,
} as const;

/** Drivers: same flex as Customers/Suppliers for consistent alignment across entity tabs */
export const DRIVERS = {
  node: CUSTOMERS_SUPPLIERS.node,
  trips: CUSTOMERS_SUPPLIERS.trips,
  earnings: CUSTOMERS_SUPPLIERS.mission,
  paid: CUSTOMERS_SUPPLIERS.credit,
  due: CUSTOMERS_SUPPLIERS.debit,
} as const;

/** Garage: same 5-column flex — vehicle | trips | sales | expense | P&L */
export const GARAGE = {
  node: CUSTOMERS_SUPPLIERS.node,
  trips: CUSTOMERS_SUPPLIERS.trips,
  sales: CUSTOMERS_SUPPLIERS.mission,
  expense: CUSTOMERS_SUPPLIERS.credit,
  pnl: CUSTOMERS_SUPPLIERS.debit,
} as const;
