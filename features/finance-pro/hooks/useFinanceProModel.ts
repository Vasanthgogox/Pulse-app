import { useMemo } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useClientsQuery, useTripsQuery } from "@/lib/queries";
import { useCustomerLedgerInputsQuery } from "@/lib/queries/useLedgerAggregationQuery";
import { useIssuedInvoicesQuery } from "@/lib/queries/useInvoicingExecuteQueries";
import { buildFinanceProModel } from "../model/buildFinanceProModel";

/**
 * Shared F1 data plane: 4 existing TanStack queries, no extra per-tab fetch.
 * Cross-filter is client-side on the returned model.
 */
export function useFinanceProModel() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const clientsQ = useClientsQuery(orgId);
  const ledgerQ = useCustomerLedgerInputsQuery(orgId, true);
  const tripsQ = useTripsQuery(orgId);
  const invoicesQ = useIssuedInvoicesQuery(orgId);

  const model = useMemo(
    () =>
      buildFinanceProModel({
        clients: clientsQ.data ?? [],
        inputs: ledgerQ.data,
        trips: tripsQ.data ?? [],
        issuedInvoices: invoicesQ.data ?? [],
      }),
    [clientsQ.data, ledgerQ.data, tripsQ.data, invoicesQ.data],
  );

  const hasCachedCore =
    (Array.isArray(clientsQ.data) && clientsQ.data.length > 0) ||
    (Array.isArray(tripsQ.data) && tripsQ.data.length > 0) ||
    Boolean(
      ledgerQ.data &&
        Array.isArray(ledgerQ.data.trip_inputs) &&
        ledgerQ.data.trip_inputs.length > 0,
    );
  const loading =
    !!orgId &&
    !hasCachedCore &&
    (clientsQ.isPending ||
      ledgerQ.isPending ||
      tripsQ.isPending ||
      clientsQ.isFetching ||
      ledgerQ.isFetching ||
      tripsQ.isFetching);
  const documentsLoading =
    !!orgId && invoicesQ.isPending && invoicesQ.data === undefined;

  const error =
    clientsQ.error ?? ledgerQ.error ?? tripsQ.error ?? invoicesQ.error ?? null;

  return { orgId, model, loading, documentsLoading, error };
}
