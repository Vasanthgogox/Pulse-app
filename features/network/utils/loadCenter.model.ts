/**
 * Load Center — pure domain model.
 * No React, no hooks. Safe to import from any context.
 */

import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";

export type LoadSubTab = "GIVE_LOAD" | "GET_LOAD" | "AWARDED";

/** Give Load: card pill when at least one supplier bid exists. */
export const GIVE_LOAD_QUOTE_RECEIVED_STATUS = "quote received";

export function getLoadCenterStatusTabLabel(
  loadSubTab: LoadSubTab,
  tabId: StatusFilterTab,
  defaultLabel: string,
): string {
  if (loadSubTab === "GIVE_LOAD" && tabId === "OPEN") return "Created";
  if (loadSubTab === "GIVE_LOAD" && tabId === "QUOTED") return "Quote received";
  return defaultLabel;
}

export function giveLoadBidReceivedDisplayStatus(
  indentStatus: string,
  bidCount: number,
): string {
  const status = indentStatus.toLowerCase();
  const terminalForQuotePill =
    status === "awarded" || statusMatchesFilter(status, "DONE");
  if (!terminalForQuotePill && bidCount > 0) {
    return GIVE_LOAD_QUOTE_RECEIVED_STATUS;
  }
  return status;
}

/** Status filter tabs: Open | Quoted | Awarded | Done. Maps to indent status values. */
export type StatusFilterTab = "OPEN" | "QUOTED" | "AWARDED" | "DONE";

/** Done tab sub-filters (Find Work / Claimed / Give Load). */
export type DoneSubTab = "REJECTED" | "CONVERTED";

export const DONE_SUB_TABS: { id: DoneSubTab; label: string }[] = [
  { id: "REJECTED", label: "Rejected" },
  { id: "CONVERTED", label: "Converted to trips" },
];

export const STATUS_TABS: {
  id: StatusFilterTab;
  label: string;
  statuses: string[];
}[] = [
  {
    id: "OPEN",
    label: "Open",
    statuses: ["open", "pending", "broadcast", "draft"],
  },
  { id: "QUOTED", label: "Quoted", statuses: ["quoted"] },
  { id: "AWARDED", label: "Awarded", statuses: ["awarded"] },
  {
    id: "DONE",
    label: "Done",
    statuses: ["completed", "cancelled", "closed", "expired"],
  },
];

export function statusMatchesFilter(
  status: string,
  filter: StatusFilterTab,
): boolean {
  const s = status.toLowerCase();
  const tab = STATUS_TABS.find((t) => t.id === filter);
  return tab?.statuses.includes(s) ?? false;
}

/** Mobile GET LOAD card labels — Done tab uses outcome status, not live quote state. */
export function resolveGetLoadMobileCardLabels(
  statusFilterTab: StatusFilterTab,
  doneSubTab: DoneSubTab,
  load: { id: string; status?: string | null; load_type?: string | null },
  existingQuote: { status?: string | null; amount?: number | null } | undefined,
  indentIdsWithTrip: ReadonlySet<string>,
): { statusLabel: string; rightFooter: string } {
  const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
  const indentStatus = (load.status || "").toLowerCase();
  const loadTypeDetail = (load.load_type || "—").toUpperCase();
  const hasTrip = indentIdsWithTrip.has(load.id);

  if (statusFilterTab === "DONE") {
    if (doneSubTab === "REJECTED" || quoteStatus === "rejected") {
      return {
        statusLabel: "declined",
        rightFooter: "Quote not selected",
      };
    }
    return {
      statusLabel: "completed",
      rightFooter: hasTrip ? "On books" : "Closed",
    };
  }

  const isPending = quoteStatus === "pending";
  const isRejected = quoteStatus === "rejected";
  const isAccepted = quoteStatus === "accepted";
  const statusLabel = isAccepted
    ? "awarded"
    : isRejected
      ? "declined"
      : isPending
        ? "quoted"
        : "open";
  const rightFooter = isPending
    ? `Quote ${formatINR(Number(existingQuote?.amount ?? 0))}`
    : isAccepted
      ? "Awarded"
      : loadTypeDetail;

  return { statusLabel, rightFooter };
}

/** GET LOAD hub ticket — target rate vs your quote in the card stub. */
export type LoadCenterTicketCommerce = {
  kicker: string;
  amountInr: number | null;
  targetRateInr?: number | null;
  quoteStatus?: string | null;
  /** Shown when there is no numeric hero (bids, load type, done outcome). */
  rightCaption?: string | null;
};

export function resolveGetLoadTicketCommerce(
  statusFilterTab: StatusFilterTab,
  doneSubTab: DoneSubTab,
  load: { id: string; status?: string | null; supplier_target?: number | null },
  existingQuote: { status?: string | null; amount?: number | null } | undefined,
  indentIdsWithTrip: ReadonlySet<string>,
): LoadCenterTicketCommerce {
  const targetRateInr = Number(load.supplier_target ?? 0);
  const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
  const quoteAmount = Number(existingQuote?.amount ?? 0);
  const hasQuote = quoteAmount > 0;
  const hasTrip = indentIdsWithTrip.has(load.id);

  if (statusFilterTab === "DONE") {
    if (doneSubTab === "REJECTED" || quoteStatus === "rejected") {
      return {
        kicker: "DECLINED",
        amountInr: null,
        rightCaption: "Quote not selected",
      };
    }
    return {
      kicker: "COMPLETED",
      amountInr: null,
      rightCaption: hasTrip ? "On books" : "Closed",
    };
  }

  if (quoteStatus === "pending" && hasQuote) {
    return {
      kicker: "YOUR QUOTE",
      amountInr: quoteAmount,
      targetRateInr: targetRateInr > 0 ? targetRateInr : null,
      quoteStatus,
    };
  }
  if (quoteStatus === "accepted") {
    return {
      kicker: "AWARDED",
      amountInr: hasQuote ? quoteAmount : null,
      rightCaption: "Awarded",
      quoteStatus,
    };
  }
  if (quoteStatus === "rejected") {
    return {
      kicker: "TARGET RATE",
      amountInr: targetRateInr > 0 ? targetRateInr : null,
      rightCaption: "Declined",
      quoteStatus,
    };
  }

  return {
    kicker: "TARGET RATE",
    amountInr: targetRateInr > 0 ? targetRateInr : null,
    rightCaption: targetRateInr > 0 ? null : "Open freight",
  };
}

/** Give Load mobile card status on Done → show completed when a trip exists. */
export function resolveGiveLoadMobileDisplayStatus(
  statusFilterTab: StatusFilterTab,
  indentStatus: string,
  bidCount: number,
  indentIdsWithTrip: ReadonlySet<string>,
  indentId: string,
): string {
  const status = indentStatus.toLowerCase();
  const terminalForQuotePill =
    status === "awarded" || statusMatchesFilter(status, "DONE");
  if (statusFilterTab === "DONE") {
    if (indentIdsWithTrip.has(indentId) || status === "completed") {
      return "completed";
    }
    return status;
  }
  return giveLoadBidReceivedDisplayStatus(status, bidCount);
}

/** Hide GET LOAD row state pill when the active status chip already matches (see GET LOAD cards). */
export function shouldHideGetLoadStatePill(
  filter: StatusFilterTab,
  stateLabel: string,
  quoteAccepted: boolean,
): boolean {
  if (filter === "OPEN" && stateLabel === "OPEN") return true;
  if (filter === "QUOTED" && stateLabel === "QUOTED") return true;
  if (filter === "AWARDED" && quoteAccepted) return true;
  return false;
}

/** Status pill colors for Hire Partner cards (Tesla palette, no indigo). */
export function giveLoadStatusPillStyles(status: string): {
  pill: object;
  text: object;
} {
  const s = (status || "").toLowerCase();
  if (s === "awarded") {
    return {
      pill: {
        backgroundColor: Theme.positive,
        borderWidth: 1,
        borderColor: Theme.darkGreen,
      },
      text: { color: Theme.textOnPrimary },
    };
  }
  if (["completed", "closed", "cancelled", "expired"].includes(s)) {
    return {
      pill: {
        backgroundColor: Theme.surfaceGray,
        borderWidth: 1,
        borderColor: Theme.borderMedium,
      },
      text: { color: Theme.textSecondary },
    };
  }
  if (s === "quoted" || s === GIVE_LOAD_QUOTE_RECEIVED_STATUS) {
    return {
      pill: {
        backgroundColor: Theme.screenBackground,
        borderWidth: 1,
        borderColor: Theme.textPrimaryDark,
      },
      text: { color: Theme.textPrimaryDark },
    };
  }
  return {
    pill: {
      backgroundColor: Theme.tripHubUnassignedPillBg,
      borderWidth: 1,
      borderColor: Theme.textPrimaryDark,
    },
    text: { color: Theme.textPrimaryDark },
  };
}

export function formatIndentCardDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d
      .toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      .toUpperCase();
  } catch {
    return "—";
  }
}
