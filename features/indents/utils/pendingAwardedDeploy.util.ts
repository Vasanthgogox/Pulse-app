import type { DirectQuoteRow, IndentRow } from "@/features/indents/services/indents.service";

export type PendingAwardedDeployItem = {
  indent: IndentRow;
  quote: DirectQuoteRow;
  shipperName: string;
  awardAmountInr: number;
};

/** Claimed loads that need roster deploy before a trip exists (supplier GET LOAD). */
export function buildPendingAwardedDeployQueue(
  orgId: string | null,
  myQuotes: DirectQuoteRow[],
  marketIndents: IndentRow[],
  indentIdsWithTrip: ReadonlySet<string>,
): PendingAwardedDeployItem[] {
  if (!orgId) return [];

  const awardedToMeIndentIds = new Set<string>();
  for (const q of myQuotes) {
    if ((q.status || "").toLowerCase() === "accepted") {
      awardedToMeIndentIds.add(q.indent_id);
    }
  }
  const stAwarded = new Set(["awarded", "completed"]);
  for (const i of marketIndents) {
    const aid = i.assigned_supplier_id;
    if (String(aid ?? "") !== orgId) continue;
    const st = (i.status || "").toLowerCase();
    if (stAwarded.has(st)) awardedToMeIndentIds.add(i.id);
  }

  const quoteByIndent = new Map<string, DirectQuoteRow>();
  for (const q of myQuotes) {
    if ((q.status || "").toLowerCase() === "accepted") {
      quoteByIndent.set(q.indent_id, q);
    }
  }

  const items: PendingAwardedDeployItem[] = [];
  const seenIndentIds = new Set<string>();
  for (const indent of marketIndents) {
    if (seenIndentIds.has(indent.id)) continue;
    if (!awardedToMeIndentIds.has(indent.id)) continue;
    if (indentIdsWithTrip.has(indent.id)) continue;
    if ((indent.status || "").toLowerCase() === "completed") continue;
    seenIndentIds.add(indent.id);

    const quote = quoteByIndent.get(indent.id);
    const awardAmountInr =
      quote?.amount != null
        ? Number(quote.amount)
        : Number(indent.client_price ?? 0);
    const shipperName =
      (indent.creator_organization_name ?? "").trim() || "Shipper";

    items.push({
      indent,
      quote:
        quote ??
        ({
          id: `synthetic-${indent.id}`,
          indent_id: indent.id,
          status: "accepted",
          amount: awardAmountInr,
        } as DirectQuoteRow),
      shipperName,
      awardAmountInr,
    });
  }

  items.sort((a, b) => {
    const ta = new Date(a.indent.pickup_date ?? a.indent.created_at).getTime();
    const tb = new Date(b.indent.pickup_date ?? b.indent.created_at).getTime();
    return ta - tb;
  });

  return items;
}
