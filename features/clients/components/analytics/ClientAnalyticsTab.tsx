/**
 * Client finance analytics — Metronic BI layout (Connection sales style).
 */
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";
import { ClientFinanceAnalyticsDashboard } from "./ClientFinanceAnalyticsDashboard";

interface Props {
  client: ClientRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
  embedded?: boolean;
}

export default function ClientAnalyticsTab({ embedded = true, ...props }: Props) {
  return <ClientFinanceAnalyticsDashboard {...props} embedded={embedded} />;
}
