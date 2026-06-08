import type { DirectQuoteRow, IndentRow } from "@/features/indents/services/indents.service";

export type IndentDeployQuoteResolution =
  | { mode: "direct_quote"; quote: DirectQuoteRow }
  | { mode: "assigned_indent"; indent: IndentRow };

/**
 * Resolve how a supplier deploys an awarded indent:
 * 1. Accepted direct quote from this org, or
 * 2. Shipper assigned this org on the indent (Give Load / assign without quote row).
 */
export function resolveIndentDeployQuote(
  load: Pick<
    IndentRow,
    "id" | "assigned_supplier_id" | "status" | "assigned_supplier_rate"
  >,
  orgId: string | null,
  myQuotes: readonly DirectQuoteRow[],
): IndentDeployQuoteResolution | null {
  if (!orgId) return null;

  const acceptedQuote = myQuotes.find(
    (q) =>
      (q.status || "").toLowerCase() === "accepted" && q.indent_id === load.id,
  );
  if (acceptedQuote) {
    return { mode: "direct_quote", quote: acceptedQuote };
  }

  if (String(load.assigned_supplier_id ?? "") === orgId) {
    return { mode: "assigned_indent", indent: load as IndentRow };
  }

  return null;
}

/**
 * Pick deploy resolution using cache first, then optional fresh accepted quote from DB.
 */
export function resolveIndentDeployQuoteWithFreshQuote(
  load: Pick<
    IndentRow,
    "id" | "assigned_supplier_id" | "status" | "assigned_supplier_rate"
  >,
  orgId: string | null,
  myQuotes: readonly DirectQuoteRow[],
  freshQuote: DirectQuoteRow | null,
): IndentDeployQuoteResolution | null {
  if (!orgId) return null;

  const cached = resolveIndentDeployQuote(load, orgId, myQuotes);
  if (cached?.mode === "direct_quote") return cached;
  if (freshQuote && freshQuote.indent_id === load.id) {
    return { mode: "direct_quote", quote: freshQuote };
  }
  if (cached?.mode === "assigned_indent") return cached;
  return null;
}
