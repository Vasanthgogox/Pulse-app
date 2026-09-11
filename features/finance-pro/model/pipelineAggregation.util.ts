import type { ClientCollectionRow, PipelineStage, TripFinancialFact } from "./financeProTypes";

export function aggregatePipelineFromFacts(
  facts: readonly TripFinancialFact[],
  attributedReceipts: number,
  clientRows: readonly ClientCollectionRow[],
): PipelineStage[] {
  let completedCount = 0;
  let completedValue = 0;
  let podPendingCount = 0;
  let podPendingValue = 0;
  let podReceivedCount = 0;
  let podReceivedValue = 0;
  let invoicedCount = 0;
  let invoicedValue = 0;

  const seen = new Set<string>();
  const completedClients = new Set<string>();
  const podPendingClients = new Set<string>();
  const podReceivedClients = new Set<string>();
  const invoicedClients = new Set<string>();
  const cashClients = new Set<string>();
  for (const fact of facts) {
    if (seen.has(fact.tripId)) continue;
    seen.add(fact.tripId);
    if (fact.sales > fact.remainingDue) cashClients.add(fact.clientId);
    if (fact.completed) {
      completedCount += 1;
      completedValue += fact.sales;
      completedClients.add(fact.clientId);
    }
    if (fact.invoiced) {
      invoicedCount += 1;
      invoicedValue += fact.sales;
      invoicedClients.add(fact.clientId);
      continue;
    }
    if (!fact.completed) continue;
    if (!fact.podReceived) {
      podPendingCount += 1;
      podPendingValue += fact.sales;
      podPendingClients.add(fact.clientId);
    } else {
      podReceivedCount += 1;
      podReceivedValue += fact.sales;
      podReceivedClients.add(fact.clientId);
    }
  }

  return [
    {
      id: "completed",
      count: completedCount,
      value: completedValue,
      customerCount: completedClients.size,
    },
    {
      id: "pod_pending",
      count: podPendingCount,
      value: podPendingValue,
      customerCount: podPendingClients.size,
    },
    {
      id: "pod_received_not_invoiced",
      count: podReceivedCount,
      value: podReceivedValue,
      customerCount: podReceivedClients.size,
    },
    {
      id: "ready_to_invoice",
      count: podReceivedCount,
      value: podReceivedValue,
      customerCount: podReceivedClients.size,
    },
    {
      id: "invoiced",
      count: invoicedCount,
      value: invoicedValue,
      customerCount: invoicedClients.size,
    },
    {
      id: "cash_attributed",
      count: clientRows.filter((r) => r.attributedReceipts > 0).length,
      value: attributedReceipts,
      customerCount: cashClients.size || clientRows.filter((r) => r.attributedReceipts > 0).length,
    },
  ];
}
