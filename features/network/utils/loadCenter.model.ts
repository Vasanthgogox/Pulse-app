/**
 * Load Center — pure domain model.
 * No React, no hooks. Safe to import from any context.
 */

import Theme from "@/constants/Theme";

export type LoadSubTab = "GIVE_LOAD" | "GET_LOAD" | "AWARDED";

/** Status filter tabs: Open | Quoted | Awarded | Done. Maps to indent status values. */
export type StatusFilterTab = "OPEN" | "QUOTED" | "AWARDED" | "DONE";

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
  if (s === "quoted") {
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
