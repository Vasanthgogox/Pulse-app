/** Metronic-style relative + absolute labels for activity timeline. */
export function formatTripActivityRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfEvent = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round(
      (startOfToday.getTime() - startOfEvent.getTime()) / (24 * 60 * 60 * 1000),
    );

    const time = d.toLocaleString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (dayDiff === 0) return `Today, ${time}`;
    if (dayDiff === 1) return `Yesterday, ${time}`;
    if (dayDiff > 1 && dayDiff < 7) {
      return `${dayDiff} days ago, ${time}`;
    }

    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    const year = d.getFullYear();
    return `${day} ${month} ${year} · ${time}`;
  } catch {
    return "—";
  }
}

export function tripActivityYearFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.getFullYear();
  } catch {
    return null;
  }
}

export function tripActivityMonthYearLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
  } catch {
    return "";
  }
}
