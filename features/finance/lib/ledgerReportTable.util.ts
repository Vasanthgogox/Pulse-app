export type ReportCell = string | number | null | undefined;
export type ReportRow = Record<string, ReportCell>;

export type LedgerReportViewState = {
  search: string;
  dateFrom: string | null;
  dateTo: string | null;
  typeValues: string[];
  statusValues: string[];
  columnContains: Record<string, string>;
  columnEquals: Record<string, string[]>;
  sortKey: string | null;
  sortDir: "asc" | "desc";
};

export const EMPTY_LEDGER_REPORT_VIEW: LedgerReportViewState = {
  search: "",
  dateFrom: null,
  dateTo: null,
  typeValues: [],
  statusValues: [],
  columnContains: {},
  columnEquals: {},
  sortKey: null,
  sortDir: "asc",
};

export function toReportIsoDate(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function cellDisplay(value: ReportCell): string {
  if (value == null || value === "") return "";
  return String(value);
}

export function parseReportNumber(value: ReportCell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = cellDisplay(value)
    .replace(/₹/g, "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();
  if (!s || s === "—" || s === "-") return null;
  const n = Number(s.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
}

export function uniqueColumnValues(rows: ReportRow[], key: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = cellDisplay(row[key]).trim();
    if (!v) continue;
    seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function rowDateIso(row: ReportRow): string {
  const iso = toReportIsoDate(row.dateIso);
  if (iso) return iso;
  return toReportIsoDate(row.date);
}

function matchesEquals(selected: string[] | undefined, value: string): boolean {
  if (!selected || selected.length === 0) return true;
  return selected.includes(value);
}

function matchesContains(needle: string | undefined, haystack: string): boolean {
  const q = (needle ?? "").trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export function rowMatchesLedgerReportView(
  row: ReportRow,
  state: LedgerReportViewState,
  columnKeys: string[],
): boolean {
  const search = state.search.trim().toLowerCase();
  if (search) {
    const hay = columnKeys.map((key) => cellDisplay(row[key])).join(" ").toLowerCase();
    if (!hay.includes(search)) return false;
  }

  const iso = rowDateIso(row);
  if (state.dateFrom && iso && iso < state.dateFrom) return false;
  if (state.dateTo && iso && iso > state.dateTo) return false;
  if ((state.dateFrom || state.dateTo) && !iso) return false;

  if (!matchesEquals(state.typeValues, cellDisplay(row.rowType).trim())) return false;
  if (!matchesEquals(state.statusValues, cellDisplay(row.status).trim())) return false;

  for (const [key, selected] of Object.entries(state.columnEquals)) {
    if (!matchesEquals(selected, cellDisplay(row[key]).trim())) return false;
  }
  for (const [key, needle] of Object.entries(state.columnContains)) {
    if (!matchesContains(needle, cellDisplay(row[key]))) return false;
  }
  return true;
}

function compareRows(
  a: ReportRow,
  b: ReportRow,
  key: string,
  dir: "asc" | "desc",
): number {
  const av = a[key];
  const bv = b[key];
  const aEmpty = av == null || av === "";
  const bEmpty = bv == null || bv === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (key === "date" || key === "dateIso") {
    const cmp = rowDateIso(a).localeCompare(rowDateIso(b));
    return dir === "asc" ? cmp : -cmp;
  }

  const an = parseReportNumber(av);
  const bn = parseReportNumber(bv);
  if (an != null && bn != null) {
    const cmp = an - bn;
    return dir === "asc" ? cmp : -cmp;
  }

  const cmp = cellDisplay(av).localeCompare(cellDisplay(bv), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return dir === "asc" ? cmp : -cmp;
}

export function applyLedgerReportView(
  rows: ReportRow[],
  state: LedgerReportViewState,
  columnKeys: string[],
): ReportRow[] {
  const filtered = rows.filter((row) =>
    rowMatchesLedgerReportView(row, state, columnKeys),
  );
  if (!state.sortKey) return filtered;
  const key = state.sortKey;
  const dir = state.sortDir;
  return [...filtered].sort((a, b) => compareRows(a, b, key, dir));
}

export function ledgerReportViewIsActive(state: LedgerReportViewState): boolean {
  return Boolean(
    state.search.trim() ||
      state.dateFrom ||
      state.dateTo ||
      state.typeValues.length ||
      state.statusValues.length ||
      state.sortKey ||
      Object.values(state.columnContains).some((v) => v.trim()) ||
      Object.values(state.columnEquals).some((v) => v.length),
  );
}
