import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useTransactionsInfiniteQuery } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import { fetchFinanceProLedgerRowById } from "../services/financeProLedgerRow.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";

export function useFinanceProLedgerRow(transactionId: string | null) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const pageQ = useTransactionsInfiniteQuery(orgId);
  const cached = useMemo(() => {
    if (!transactionId) return null;
    const pages = pageQ.data?.pages ?? [];
    for (const page of pages) {
      const hit = page.transactions.find((row) => row.id === transactionId);
      if (hit) return hit;
    }
    return null;
  }, [pageQ.data, transactionId]);

  const fetchQ = useQuery({
    queryKey:
      orgId && transactionId
        ? queryKeys.transactions.byId(orgId, transactionId)
        : ["q", "transactions", "row", "none"],
    queryFn: async () => {
      const { error, row } = await fetchFinanceProLedgerRowById(orgId!, transactionId!);
      if (error) throw error;
      return row;
    },
    enabled: Boolean(orgId && transactionId && !cached && !pageQ.isPending),
    staleTime: 60_000,
  });

  const row: LedgerRow | null = cached ?? fetchQ.data ?? null;
  const loading = Boolean(orgId && transactionId && !row && (pageQ.isPending || fetchQ.isPending));
  const error = pageQ.error ?? fetchQ.error ?? null;
  return { orgId, row, loading, error };
}

export function useFinanceProCashPage() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const txQ = useTransactionsInfiniteQuery(orgId);
  const page = useMemo(
    () => txQ.data?.pages[0]?.transactions ?? [],
    [txQ.data],
  );
  return { orgId, page, loading: Boolean(orgId && txQ.isPending && !txQ.data) };
}
