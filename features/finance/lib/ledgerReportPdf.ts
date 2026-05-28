import type { LedgerRow } from "../services/finance.service";
import { getTripOperationalDisplay } from "@/features/operations/display";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAmountINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
}

function isoDateOnly(s?: string | null): string | null {
  if (!s) return null;
  const d = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${d} ${months[Math.max(0, Number(m) - 1)]} ${y}`;
}

function pickLedgerDate(row: LedgerRow): string | null {
  return isoDateOnly(row.transaction_date) ?? isoDateOnly(row.created_at);
}

export function deriveLedgerDateRangeLabel(rows: LedgerRow[]): string {
  const dates = rows.map(pickLedgerDate).filter(Boolean) as string[];
  if (dates.length === 0) return "All dates";
  const min = dates.reduce((a, b) => (a < b ? a : b));
  const max = dates.reduce((a, b) => (a > b ? a : b));
  if (min === max) return formatDateLabel(min);
  return `${formatDateLabel(min)} – ${formatDateLabel(max)}`;
}

export interface LedgerReportPdfOptions {
  companyName?: string;
  reportTitle: string;
  dateRangeLabel?: string;
  logoUri?: string; // https://... or data:image/...;base64,...
  generatedAtLabel?: string;
  /**
   * Controls how the "Ref / Description" column is rendered.
   * - tripOrDescription (default): trip_number OR description OR —
   * - tripOnly: trip_number only (fallback to —)
   */
  refDisplayMode?: "tripOrDescription" | "tripOnly";
  /**
   * When true, the PDF table will NOT show the party/name column.
   * Useful for entity reports where the party is already in the title.
   */
  hidePartyColumn?: boolean;
  tableAmountColumnLabels?: { inLabel: string; outLabel: string };
}

export function buildLedgerReportHtml(
  rows: LedgerRow[],
  totals: { totalIn: number; totalOut: number; balance: number },
  options: LedgerReportPdfOptions,
): string {
  const {
    companyName = "Q",
    reportTitle,
    dateRangeLabel,
    logoUri,
    generatedAtLabel,
    refDisplayMode = "tripOrDescription",
    hidePartyColumn = false,
    tableAmountColumnLabels,
  } = options;

  const safeCompany = escapeHtml(companyName);
  const safeTitle = escapeHtml(reportTitle);
  const safeRange = escapeHtml(dateRangeLabel ?? deriveLedgerDateRangeLabel(rows));
  const safeGeneratedAt = escapeHtml(generatedAtLabel ?? new Date().toLocaleString());

  const amtInLabel = escapeHtml(tableAmountColumnLabels?.inLabel ?? "In");
  const amtOutLabel = escapeHtml(tableAmountColumnLabels?.outLabel ?? "Out");

  const bodyRows = rows
    .map((r) => {
      const tripDisplay = getTripOperationalDisplay({ trip_number: r.trip_number ?? null });
      const ref =
        refDisplayMode === "tripOnly"
          ? escapeHtml(tripDisplay)
          : escapeHtml(tripDisplay !== "—" ? tripDisplay : r.description || "—");
      const party = escapeHtml(r.party_name ?? "—");
      const dateIso = pickLedgerDate(r);
      const date = dateIso ? escapeHtml(formatDateLabel(dateIso)) : "—";
      const inAmt = (r.amount_in ?? 0) > 0 ? formatAmountINR(r.amount_in!) : "—";
      const outAmt =
        (r.amount_out ?? 0) > 0 ? formatAmountINR(r.amount_out!) : "—";
      return hidePartyColumn
        ? `<tr>
        <td class="col-ref">${ref}</td>
        <td class="col-date">${date}</td>
        <td class="col-amt col-in">${inAmt}</td>
        <td class="col-amt col-out">${outAmt}</td>
      </tr>`
        : `<tr>
        <td class="col-party">${party}</td>
        <td class="col-ref">${ref}</td>
        <td class="col-date">${date}</td>
        <td class="col-amt col-in">${inAmt}</td>
        <td class="col-amt col-out">${outAmt}</td>
      </tr>`;
    })
    .join("");

  const totalIn = formatAmountINR(totals.totalIn);
  const totalOut = formatAmountINR(totals.totalOut);
  const balanceLabel = formatAmountINR(Math.abs(totals.balance));
  const balanceKind = totals.balance >= 0 ? "Net In" : "Net Out";

  const logoHtml = logoUri
    ? `<div class="logoWrap"><img class="logo" src="${escapeHtml(logoUri)}" alt="Logo" /></div>`
    : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root {
        --ink: #0f172a;
        --muted: #475569;
        --line: #e2e8f0;
        --soft: #f8fafc;
        --header: #0b1220;
        --in: #166534;
        --out: #b91c1c;
      }

      @page {
        size: A4;
        margin: 14mm 12mm 16mm 12mm;
      }

      * { box-sizing: border-box; }
      html, body { padding: 0; margin: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        color: var(--ink);
        font-size: 11px;
        line-height: 1.35;
      }

      .page {
        padding-bottom: 18mm; /* footer space */
      }

      .topHeader {
        display: flex;
        gap: 12px;
        align-items: center;
        border-bottom: 2px solid var(--header);
        padding-bottom: 10px;
        margin-bottom: 10px;
      }

      .logoWrap { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; }
      .logo { max-width: 42px; max-height: 42px; object-fit: contain; }

      .headMeta { flex: 1; min-width: 0; }
      .company { font-weight: 800; font-size: 12px; letter-spacing: 0.2px; }
      .title { font-weight: 800; font-size: 14px; margin-top: 2px; }
      .sub { margin-top: 3px; color: var(--muted); font-size: 10px; }

      .summary {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        margin: 10px 0 12px;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px;
        background: var(--soft);
      }
      .cardLabel {
        color: var(--muted);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
      .cardValue {
        margin-top: 6px;
        font-size: 13px;
        font-weight: 800;
      }
      .in { color: var(--in); }
      .out { color: var(--out); }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      thead { display: table-header-group; }
      tfoot { display: table-row-group; }

      th, td {
        border: 1px solid var(--line);
        padding: 7px 8px;
        vertical-align: top;
      }

      th {
        background: var(--header);
        color: white;
        font-size: 9px;
        letter-spacing: 0.7px;
        text-transform: uppercase;
        text-align: left;
      }

      tr { break-inside: avoid; page-break-inside: avoid; }

      .col-party { width: 28%; word-wrap: break-word; }
      .col-ref { width: ${hidePartyColumn ? "44%" : "36%"}; word-wrap: break-word; }
      .col-date { width: ${hidePartyColumn ? "18%" : "14%"}; color: var(--muted); }
      .col-amt { width: ${hidePartyColumn ? "19%" : "11%"}; text-align: right; white-space: nowrap; }
      .col-in { color: var(--in); font-weight: 700; }
      .col-out { color: var(--out); font-weight: 700; }

      .totalsRow td {
        background: #eef2ff;
        font-weight: 800;
      }
      .totalsRow .label { text-align: right; }

      .footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        border-top: 1px solid var(--line);
        padding: 6mm 12mm 6mm;
        font-size: 9px;
        color: var(--muted);
        background: white;
      }
      .footerInner {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }
      .pageNo:after { content: counter(page); }

      @media print {
        .footer { position: fixed; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="topHeader">
        ${logoHtml}
        <div class="headMeta">
          <div class="company">${safeCompany}</div>
          <div class="title">${safeTitle}</div>
          <div class="sub">Period: <b>${safeRange}</b> · Generated: ${safeGeneratedAt}</div>
        </div>
      </div>

      <div class="summary">
        <div class="card">
          <div class="cardLabel">Total received</div>
          <div class="cardValue in">${totalIn}</div>
        </div>
        <div class="card">
          <div class="cardLabel">Total paid</div>
          <div class="cardValue out">${totalOut}</div>
        </div>
        <div class="card">
          <div class="cardLabel">${escapeHtml(balanceKind)}</div>
          <div class="cardValue">${balanceLabel}</div>
        </div>
      </div>

      <table aria-label="Ledger report table">
        <thead>
          <tr>
            ${hidePartyColumn ? "" : "<th>Party</th>"}
            <th>${hidePartyColumn ? "Trip" : "Ref / Description"}</th>
            <th>Date</th>
            <th style="text-align:right;">${amtInLabel}</th>
            <th style="text-align:right;">${amtOutLabel}</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
        <tfoot>
          <tr class="totalsRow">
            <td colspan="${hidePartyColumn ? "2" : "3"}" class="label">Totals</td>
            <td class="col-amt in">${totalIn}</td>
            <td class="col-amt out">${totalOut}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="footer">
      <div class="footerInner">
        <div>${safeCompany} · ${safeTitle}</div>
        <div>Page <span class="pageNo"></span></div>
      </div>
    </div>
  </body>
</html>`;
}

