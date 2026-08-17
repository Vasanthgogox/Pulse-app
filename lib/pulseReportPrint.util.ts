import {
  PULSE_WATERMARK_PRINT_CSS,
  pulseWatermarkHtmlFragment,
} from "@/lib/reportWatermark.util";

export type PulseReportColumnAlign = "left" | "right" | "center";

export type PulseReportTableColumn = {
  key: string;
  label: string;
  align?: PulseReportColumnAlign;
  /** CSS width for print layout, e.g. "12%" */
  width?: string;
};

export type PulseReportSummaryCard = {
  label: string;
  value: string;
  tone?: "default" | "in" | "out";
};

export type PulseReportTableSection = {
  sectionTitle?: string;
  columns: PulseReportTableColumn[];
  rows: Array<Record<string, string>>;
};

export type BuildPulseIntelligenceReportHtmlOptions = {
  title: string;
  companyName?: string;
  dateRangeLabel?: string;
  filterCaption?: string;
  generatedAtLabel?: string;
  summaryCards?: PulseReportSummaryCard[];
  /** Single table (use this OR tables) */
  columns?: PulseReportTableColumn[];
  rows?: Array<Record<string, string>>;
  /** Multiple tables (aging, multi-section) */
  tables?: PulseReportTableSection[];
  /** HTML inserted after header / summary and before tables */
  preambleHtml?: string;
  landscape?: boolean;
  extraStyles?: string;
};

export const PULSE_INTELLIGENCE_REPORT_CSS = `
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
    size: A4 portrait;
    margin: 14mm 12mm 16mm 12mm;
  }

  @page landscape {
    size: A4 landscape;
    margin: 10mm 10mm 14mm 10mm;
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
    padding-bottom: 18mm;
  }

  .page.landscape {
    page: landscape;
  }

  .topHeader {
    display: flex;
    gap: 12px;
    align-items: center;
    border-bottom: 2px solid var(--header);
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .headMeta { flex: 1; min-width: 0; }
  .company { font-weight: 800; font-size: 12px; letter-spacing: 0.2px; }
  .title { font-weight: 800; font-size: 14px; margin-top: 2px; }
  .sub { margin-top: 3px; color: var(--muted); font-size: 10px; }
  .filterCaption {
    margin: 0 0 10px;
    padding: 8px 10px;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 8px;
    font-size: 10px;
    color: #312e81;
    font-weight: 600;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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
  .cardValue.in { color: var(--in); }
  .cardValue.out { color: var(--out); }

  .sectionTitle {
    font-size: 11px;
    font-weight: 800;
    margin: 14px 0 8px;
    color: var(--ink);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 12px;
  }

  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }

  th, td {
    border: 1px solid var(--line);
    padding: 7px 8px;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }

  th {
    background: var(--header);
    color: white;
    font-size: 9px;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    text-align: left;
  }

  td.align-right, th.align-right { text-align: right; }
  td.align-center, th.align-center { text-align: center; }

  .cellSub {
    margin-top: 2px;
    font-size: 8px;
    font-weight: 500;
    color: var(--muted);
    letter-spacing: 0.15px;
    line-height: 1.2;
  }

  tr:nth-child(even) td { background: #f8fafc; }

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
    .page.landscape { page: landscape; }
  }

  ${PULSE_WATERMARK_PRINT_CSS}
`;

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnClass(key: string): string {
  return `col-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function renderTable(section: PulseReportTableSection): string {
  const th = section.columns
    .map((col) => {
      const align = col.align ?? "left";
      const alignClass = align === "right" ? "align-right" : align === "center" ? "align-center" : "";
      const width = col.width ? ` style="width:${col.width}"` : "";
      return `<th class="${columnClass(col.key)} ${alignClass}"${width}>${escapeHtml(col.label)}</th>`;
    })
    .join("");

  const body = section.rows
    .map((row) => {
      const tds = section.columns
        .map((col) => {
          const align = col.align ?? "left";
          const alignClass = align === "right" ? "align-right" : align === "center" ? "align-center" : "";
          const raw = row[col.key] ?? "—";
          if (col.key === "trip") {
            const date = String(row.tripDate ?? "").trim();
            const dateHtml =
              date && date !== "—"
                ? `<div class="cellSub">${escapeHtml(date)}</div>`
                : "";
            return `<td class="${columnClass(col.key)} ${alignClass}">${escapeHtml(String(raw))}${dateHtml}</td>`;
          }
          return `<td class="${columnClass(col.key)} ${alignClass}">${escapeHtml(String(raw))}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  const titleHtml = section.sectionTitle
    ? `<h3 class="sectionTitle">${escapeHtml(section.sectionTitle)}</h3>`
    : "";

  return `${titleHtml}
    <table>
      <thead><tr>${th}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** Branded Pulse Intelligence PDF/HTML shell — aligned tables, watermark, header, footer. */
export function buildPulseIntelligenceReportHtml(
  options: BuildPulseIntelligenceReportHtmlOptions,
): string {
  const {
    title,
    companyName = "PULSE",
    dateRangeLabel,
    filterCaption,
    generatedAtLabel = new Date().toLocaleString(),
    summaryCards = [],
    columns = [],
    rows = [],
    tables,
    preambleHtml = "",
    landscape = false,
    extraStyles = "",
  } = options;

  const safeTitle = escapeHtml(title);
  const safeCompany = escapeHtml(companyName);
  const safeGeneratedAt = escapeHtml(generatedAtLabel);
  const safeRange = dateRangeLabel ? escapeHtml(dateRangeLabel) : "";

  const sections: PulseReportTableSection[] =
    tables ??
    (columns.length > 0
      ? [{ columns, rows }]
      : []);

  const summaryHtml =
    summaryCards.length > 0
      ? `<div class="summary">${summaryCards
          .map(
            (card) =>
              `<div class="card">
                <div class="cardLabel">${escapeHtml(card.label)}</div>
                <div class="cardValue${card.tone && card.tone !== "default" ? ` ${card.tone}` : ""}">${escapeHtml(card.value)}</div>
              </div>`,
          )
          .join("")}</div>`
      : "";

  const filterHtml = filterCaption?.trim()
    ? `<p class="filterCaption">${escapeHtml(filterCaption.trim())}</p>`
    : "";

  const tablesHtml = sections.map((section) => renderTable(section)).join("");

  const pageClass = landscape ? "page landscape" : "page";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      ${PULSE_INTELLIGENCE_REPORT_CSS}
      ${landscape ? "@page { size: A4 landscape; margin: 10mm; }" : ""}
      ${extraStyles}
    </style>
  </head>
  <body>
    <div class="pulse-report-body">
      <div class="${pageClass}">
        <div class="topHeader">
          <div class="headMeta">
            <div class="company">${safeCompany}</div>
            <div class="title">${safeTitle}</div>
            ${safeRange ? `<div class="sub">${safeRange}</div>` : ""}
          </div>
        </div>
        ${filterHtml}
        ${summaryHtml}
        ${preambleHtml}
        ${tablesHtml}
      </div>
      <div class="footer">
        <div class="footerInner">
          <span>PULSE Intelligence Report</span>
          <span>Generated ${safeGeneratedAt}</span>
          <span>Page <span class="pageNo"></span></span>
        </div>
      </div>
    </div>
    ${pulseWatermarkHtmlFragment()}
  </body>
</html>`;
}
