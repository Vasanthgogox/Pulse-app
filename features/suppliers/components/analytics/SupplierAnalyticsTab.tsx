/**
 * Supplier finance analytics — Metronic BI layout (matches client dashboard).
 */
import type { LedgerRow } from "@/features/finance";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { SupplierFinanceAnalyticsDashboard } from "./SupplierFinanceAnalyticsDashboard";

interface Props {
  supplier: SupplierRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
  embedded?: boolean;
}

export default function SupplierAnalyticsTab({ embedded = true, ...props }: Props) {
  return <SupplierFinanceAnalyticsDashboard {...props} embedded={embedded} />;
}
