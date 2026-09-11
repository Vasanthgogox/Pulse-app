import { ROUTES } from "@/lib/routes";
import {
  FinanceProDataTable,
  FinanceProKpiCard,
  FinanceProKpiRow,
  FinanceProQuietAction,
  FinanceProStack,
  type FinanceProTableColumn,
} from "./FinanceProCanvas";
import { FinanceProWorkspaceFrame } from "./FinanceProWorkspaceFrame";
import { FINANCE_PRO_LAUNCH } from "./financeProLaunch";
import { formatFinanceInr } from "./financeProFormat";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useTransactionsInfiniteQuery } from "@/lib/queries";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import type { LedgerRow } from "@/features/finance/services/finance.service";

export function FinanceProCashActivityScreen() {
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const txQ = useTransactionsInfiniteQuery(orgId);
  const page = useMemo(
    () => txQ.data?.pages[0]?.transactions ?? [],
    [txQ.data],
  );

  const sums = useMemo(() => {
    let received = 0;
    let paid = 0;
    let customer = 0;
    let other = 0;
    for (const row of page) {
      received += Number(row.amount_in ?? 0);
      paid += Number(row.amount_out ?? 0);
      if (row.contact_type === "client") customer += Number(row.amount_in ?? 0);
      else other += Number(row.amount_in ?? 0) + Number(row.amount_out ?? 0);
    }
    return { received, paid, customer, other };
  }, [page]);

  const columns: FinanceProTableColumn<LedgerRow>[] = [
    { key: "d", label: "Date", flex: 0.9, minWidth: 100, render: (r) => r.transaction_date },
    { key: "p", label: "Party", flex: 1.4, minWidth: 140, render: (r) => r.party_name },
    {
      key: "dir",
      label: "Direction",
      flex: 0.7,
      minWidth: 80,
      render: (r) =>
        Number(r.amount_in) > 0 && Number(r.amount_out) <= 0
          ? "In"
          : Number(r.amount_out) > 0 && Number(r.amount_in) <= 0
            ? "Out"
            : "Both",
    },
    {
      key: "a",
      label: "Amount",
      flex: 1,
      minWidth: 110,
      align: "right",
      render: (r) =>
        formatFinanceInr(Math.max(Number(r.amount_in ?? 0), Number(r.amount_out ?? 0))),
    },
    {
      key: "k",
      label: "Kind",
      flex: 1,
      minWidth: 110,
      render: (r) =>
        r.contact_type === "client" ? "Attributed client" : r.contact_type || "Other ledger",
    },
    {
      key: "t",
      label: "Trip",
      flex: 0.9,
      minWidth: 96,
      render: (r) => r.trip_number || r.trip_id?.slice(0, 8) || "—",
    },
    {
      key: "r",
      label: "Reference",
      flex: 1,
      minWidth: 110,
      render: (r) => r.payment_reference || "—",
    },
  ];

  return (
    <FinanceProWorkspaceFrame title="Cash" hideTitle>
      {(model) => (
        <FinanceProStack>
          <FinanceProKpiRow>
            <FinanceProKpiCard
              label="Attributed client cash"
              value={formatFinanceInr(model.attributedReceipts)}
              sub="From customer ledger inputs, not this page"
            />
            <FinanceProKpiCard
              label="Received"
              value={formatFinanceInr(sums.received)}
              sub={`${page.length} rows on this page`}
            />
            <FinanceProKpiCard
              label="Paid"
              value={formatFinanceInr(sums.paid)}
              sub="This page only"
            />
            <FinanceProKpiCard
              label="Customer receipts"
              value={formatFinanceInr(sums.customer)}
              sub={`Other ledger ${formatFinanceInr(sums.other)}`}
            />
          </FinanceProKpiRow>

          <FinanceProDataTable
            title="Recent activity"
            kicker="Latest ledger page · not a full attributed-cash scan"
            searchPlaceholder="Search parties, trips, references…"
            action={
              <FinanceProQuietAction
                label="Open Core Finance ledger"
                onPress={() => router.push(FINANCE_PRO_LAUNCH.coreLedger)}
              />
            }
            columns={columns}
              rows={page}
              keyExtractor={(r) => r.id}
              onRowPress={(row) => router.push(ROUTES.financeProCash(row.id))}
            empty="No rows on the current cash page."
          />
        </FinanceProStack>
      )}
    </FinanceProWorkspaceFrame>
  );
}
