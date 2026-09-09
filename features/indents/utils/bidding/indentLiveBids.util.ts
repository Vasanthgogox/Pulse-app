import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import { formatINR } from "@/lib/format";

export type IndentBidBadgeKind =
  | "recommended"
  | "lowest"
  | "at_target"
  | "awarded"
  | "deal_lost";

export type IndentBidBadge = {
  kind: IndentBidBadgeKind;
  label: string;
};

export type IndentLiveBidsViewModel = {
  sortedQuotes: DirectQuoteRow[];
  pendingCount: number;
  pendingQuotes: DirectQuoteRow[];
  recommendedQuoteId: string | null;
  badgesByQuoteId: Map<string, IndentBidBadge[]>;
  showRecommendationStrip: boolean;
  highestPendingAmount: number | null;
  lowestPendingAmount: number | null;
};

function normalizeQuoteStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function sortQuotesForDisplay(quotes: DirectQuoteRow[]): DirectQuoteRow[] {
  return [...quotes].sort((a, b) => {
    const sa = normalizeQuoteStatus(a.status);
    const sb = normalizeQuoteStatus(b.status);
    if (sa === "pending" && sb === "pending") {
      return Number(a.amount ?? 0) - Number(b.amount ?? 0);
    }
    if (sa === "pending") return -1;
    if (sb === "pending") return 1;
    if (sa === "rejected" && sb === "accepted") return -1;
    if (sa === "accepted" && sb === "rejected") return 1;
    return (
      new Date(b.updated_at ?? b.created_at).getTime() -
      new Date(a.updated_at ?? a.created_at).getTime()
    );
  });
}

export function buildIndentLiveBidsViewModel(
  quotes: DirectQuoteRow[],
  options?: { targetRateInr?: number },
): IndentLiveBidsViewModel {
  const sortedQuotes = sortQuotesForDisplay(quotes);
  const pendingQuotes = sortedQuotes.filter(
    (q) => normalizeQuoteStatus(q.status) === "pending",
  );
  const pendingCount = pendingQuotes.length;
  const targetRate = Math.max(0, Number(options?.targetRateInr ?? 0));

  const pendingAmounts = pendingQuotes
    .map((q) => Number(q.amount ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const lowestPendingAmount =
    pendingAmounts.length > 0 ? Math.min(...pendingAmounts) : null;
  const highestPendingAmount =
    pendingAmounts.length > 0 ? Math.max(...pendingAmounts) : null;

  const recommendedQuoteId =
    pendingCount > 0 ? (pendingQuotes[0]?.id ?? null) : null;

  const badgesByQuoteId = new Map<string, IndentBidBadge[]>();

  for (const q of sortedQuotes) {
    const status = normalizeQuoteStatus(q.status);
    const badges: IndentBidBadge[] = [];
    const amount = Number(q.amount ?? 0);

    if (status === "accepted") {
      badges.push({ kind: "awarded", label: "Awarded" });
    }

    if (status === "superseded" || q.bidderUnavailable) {
      badges.push({ kind: "deal_lost", label: "On trip" });
    }

    if (status === "pending") {
      if (q.id === recommendedQuoteId && pendingCount >= 2) {
        badges.push({ kind: "recommended", label: "Recommended" });
      } else if (q.id === recommendedQuoteId && pendingCount === 1) {
        badges.push({ kind: "lowest", label: "Only bid" });
      } else if (
        lowestPendingAmount != null &&
        amount === lowestPendingAmount &&
        pendingCount >= 2 &&
        q.id !== recommendedQuoteId
      ) {
        badges.push({ kind: "lowest", label: "Lowest" });
      }
      if (targetRate > 0 && amount > 0 && amount <= targetRate) {
        badges.push({ kind: "at_target", label: "At/below target" });
      }
    }

    if (badges.length > 0) {
      badgesByQuoteId.set(q.id, badges);
    }
  }

  return {
    sortedQuotes,
    pendingCount,
    pendingQuotes,
    recommendedQuoteId,
    badgesByQuoteId,
    showRecommendationStrip: pendingCount >= 2 && recommendedQuoteId != null,
    highestPendingAmount,
    lowestPendingAmount,
  };
}

export function savingsVsHighestPendingInr(
  amount: number,
  highestPending: number | null,
): number | null {
  if (highestPending == null || highestPending <= 0) return null;
  const diff = highestPending - amount;
  return diff > 0 ? diff : null;
}

export function savingsVsTargetInr(
  amount: number,
  targetRateInr: number,
): number | null {
  if (targetRateInr <= 0 || amount <= 0) return null;
  const diff = targetRateInr - amount;
  return diff > 0 ? diff : null;
}

export type IndentBidMetricTone = "positive" | "negative" | "neutral";

export type IndentBidFooterMetric = {
  label: string;
  value: string;
  tone: IndentBidMetricTone;
};

export type IndentBidFooterInsight = {
  metrics: IndentBidFooterMetric[];
  recommendation: string | null;
};

/** Owner margin: client freight minus supplier bid. */
export function bidMarginFromClient(
  clientPriceInr: number,
  bidAmount: number,
): { marginInr: number; marginPct: number } | null {
  if (clientPriceInr <= 0 || bidAmount <= 0) return null;
  const marginInr = clientPriceInr - bidAmount;
  const marginPct = Math.round((marginInr / clientPriceInr) * 100);
  return { marginInr, marginPct };
}

export function resolveBidRecommendationLine(
  badges: IndentBidBadge[],
  pendingCount: number,
): string | null {
  if (badges.some((b) => b.kind === "recommended")) {
    return "Recommended — lowest live bid";
  }
  if (badges.some((b) => b.kind === "lowest")) {
    return "Lowest among competing bids";
  }
  if (pendingCount === 1 && badges.some((b) => b.kind === "lowest")) {
    return "Only offer — review and award when ready";
  }
  if (badges.some((b) => b.kind === "at_target")) {
    return "At or below your target rate";
  }
  return null;
}

export function buildIndentBidFooterInsight(options: {
  amount: number;
  clientPriceInr?: number;
  targetRateInr?: number;
  highestPendingAmount?: number | null;
  badges?: IndentBidBadge[];
  pendingCount?: number;
  status?: string;
}): IndentBidFooterInsight | null {
  const amount = Math.max(0, Number(options.amount ?? 0));
  const clientPrice = Math.max(0, Number(options.clientPriceInr ?? 0));
  const targetRate = Math.max(0, Number(options.targetRateInr ?? 0));
  const badges = options.badges ?? [];
  const pendingCount = options.pendingCount ?? 0;
  const status = (options.status ?? "").trim().toLowerCase();
  const metrics: IndentBidFooterMetric[] = [];

  if (targetRate > 0) {
    metrics.push({
      label: "TARGET RATE",
      value: formatINR(targetRate),
      tone: "neutral",
    });
  }

  const margin = bidMarginFromClient(clientPrice, amount);
  if (margin) {
    const tone: IndentBidMetricTone =
      margin.marginInr >= 0 ? "positive" : "negative";
    metrics.push({
      label: "MARGIN",
      value: `${formatINR(margin.marginInr)} (${margin.marginPct}%)`,
      tone,
    });
  }

  if (targetRate > 0 && amount > 0) {
    const gap = targetRate - amount;
    if (gap > 0) {
      metrics.push({
        label: "VS TARGET",
        value: `${formatINR(gap)} under`,
        tone: "positive",
      });
    } else if (gap < 0) {
      metrics.push({
        label: "VS TARGET",
        value: `${formatINR(Math.abs(gap))} over`,
        tone: "negative",
      });
    } else {
      metrics.push({
        label: "VS TARGET",
        value: "At target",
        tone: "positive",
      });
    }
  }

  const vsHighest = savingsVsHighestPendingInr(
    amount,
    options.highestPendingAmount ?? null,
  );
  if (
    vsHighest != null &&
    pendingCount >= 2 &&
    status === "pending" &&
    !metrics.some((m) => m.label === "VS HIGHEST")
  ) {
    metrics.push({
      label: "VS HIGHEST",
      value: `${formatINR(vsHighest)} saved`,
      tone: "positive",
    });
  }

  const recommendation =
    status === "pending"
      ? resolveBidRecommendationLine(badges, pendingCount)
      : null;

  if (metrics.length === 0 && !recommendation) return null;
  return { metrics, recommendation };
}

/** Supplier "Your quote" ticket — target comparison + status guidance. */
export function buildSupplierQuoteFooterInsight(options: {
  amount: number;
  targetRateInr?: number;
  status?: string;
  canUpdateBid?: boolean;
  hasQuote: boolean;
}): IndentBidFooterInsight | null {
  const amount = Math.max(0, Number(options.amount ?? 0));
  const targetRate = Math.max(0, Number(options.targetRateInr ?? 0));
  const status = (options.status ?? "").trim().toLowerCase();
  const metrics: IndentBidFooterMetric[] = [];

  if (options.hasQuote && targetRate > 0) {
    metrics.push({
      label: "TARGET RATE",
      value: formatINR(targetRate),
      tone: "neutral",
    });
  }

  if (options.hasQuote && targetRate > 0 && amount > 0) {
    const gap = targetRate - amount;
    if (gap > 0) {
      metrics.push({
        label: "VS TARGET",
        value: `${formatINR(gap)} under`,
        tone: "positive",
      });
    } else if (gap < 0) {
      metrics.push({
        label: "VS TARGET",
        value: `${formatINR(Math.abs(gap))} over`,
        tone: "negative",
      });
    } else {
      metrics.push({
        label: "VS TARGET",
        value: "At target",
        tone: "positive",
      });
    }
  } else if (options.hasQuote && amount > 0 && targetRate <= 0) {
    metrics.push({
      label: "YOUR BID",
      value: formatINR(amount),
      tone: "neutral",
    });
  }

  let recommendation: string | null = null;
  if (!options.hasQuote) {
    recommendation = "Submit a bid to participate in this load";
  } else if (status === "accepted") {
    recommendation = "Quote awarded — assign driver and vehicle to deploy";
  } else if (status === "rejected") {
    recommendation = "Your quote was not selected for this load";
  } else if (options.canUpdateBid) {
    recommendation = "You can update your bid while this load remains open";
  }

  if (metrics.length === 0 && !recommendation) return null;
  return { metrics, recommendation };
}
