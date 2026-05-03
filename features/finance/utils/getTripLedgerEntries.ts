import type { LedgerRow } from "../services/finance.service";

const LEDGER_META_PREFIX = "[[QMETA:";
const LEDGER_META_SUFFIX = "]]";

function extractLedgerMetaTripNumber(
  description: string | null | undefined,
): string | null {
  const raw = String(description ?? "");
  const idx = raw.lastIndexOf(LEDGER_META_PREFIX);
  if (idx < 0) return null;
  const start = idx + LEDGER_META_PREFIX.length;
  const end = raw.indexOf(LEDGER_META_SUFFIX, start);
  if (end < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end)) as {
      trip_number?: string | null;
    };
    const n = String(parsed?.trip_number ?? "").trim();
    return n.length > 0 ? n : null;
  } catch {
    return null;
  }
}

function displayKeys(n: string | null | undefined): Set<string> {
  const s = String(n ?? "").trim().toLowerCase();
  if (!s) return new Set();
  const keys = new Set<string>([s]);
  const noSpaces = s.replace(/\s+/g, "");
  if (noSpaces !== s) keys.add(noSpaces);
  return keys;
}

function tripNumberMatches(
  metaNumber: string | null | undefined,
  displayNumber: string | null | undefined,
): boolean {
  const a = displayKeys(displayNumber);
  const b = displayKeys(metaNumber);
  if (!a.size || !b.size) return false;
  for (const x of a) {
    if (b.has(x)) return true;
  }
  return false;
}

/**
 * Rows for a trip: by `trip_id`, plus unanchored rows (`trip_id` null) whose
 * description carries QMETA `trip_number` matching the trip display number.
 */
export function getTripLedgerEntries(
  transactions: LedgerRow[] | null | undefined,
  tripId: string | null | undefined,
  tripDisplayNumber?: string | null,
): LedgerRow[] {
  if (!transactions?.length) return [];
  if (!tripId) return [];

  const entries: LedgerRow[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (tx.trip_id === tripId) {
      entries.push(tx);
      continue;
    }
    const tid = tx.trip_id;
    const unanchored = tid == null || tid === "";
    if (unanchored && tripDisplayNumber) {
      const desc = (tx as { descriptionRaw?: string | null }).descriptionRaw ?? tx.description;
      const metaNum = extractLedgerMetaTripNumber(desc);
      if (tripNumberMatches(tripDisplayNumber, metaNum)) {
        entries.push(tx);
      }
    }
  }
  return entries;
}
