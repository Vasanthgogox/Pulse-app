/**
 * Ops Agent utils — natural language reply, HTML escape, report to HTML/plain text.
 */
import type { ChatReportData } from "@/features/ops-agent/services/ops-agent.service";

/** Strip code blocks (e.g. ```tool_code ... ```) so we show only natural language to the user. */
export function toNaturalLanguageReply(text: string): string {
  if (!text?.trim()) return "";
  const out = text
    .replace(/\s*```[\w]*\s*[\s\S]*?```\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out || "Done.";
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build HTML for report PDF. */
export function reportToHtml(report: ChatReportData): string {
  const dateStr = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const sectionsHtml = report.sections
    .map((s) => {
      let content: string;
      if (s.table?.headers?.length) {
        const headerRow = s.table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
        const dataRows = (s.table.rows ?? [])
          .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`)
          .join("");
        content = `<table class="report-table"><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table>`;
      } else {
        content = `<div class="body">${escapeHtml(s.body ?? "").replace(/\n/g, "<br/>")}</div>`;
      }
      return `<div class="section"><h3>${escapeHtml(s.title)}</h3>${content}</div>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(report.title)}</title>
<style>body{font-family:system-ui;padding:20px;font-size:12px;color:#111;}
h1{font-size:18px;margin-bottom:4px;} .meta{color:#666;font-size:11px;margin-bottom:20px;}
.section{margin-bottom:16px;page-break-inside:avoid;}
.section h3{font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#333;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;}
.body{white-space:pre-wrap;}
.report-table{width:100%;border-collapse:collapse;font-size:11px;}
.report-table th,.report-table td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
.report-table th{background:#f5f5f5;font-weight:600;}</style></head>
<body><h1>${escapeHtml(report.title)}</h1><p class="meta">Generated: ${escapeHtml(dateStr)}</p>${sectionsHtml}</body></html>`;
}

/** Plain text version of report for fallback when PDF is not available. */
export function reportToPlainText(report: ChatReportData): string {
  const dateStr = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const parts = [report.title, `Generated: ${dateStr}`, ""];
  report.sections.forEach((s) => {
    parts.push(s.title);
    if (s.table?.headers?.length) {
      parts.push(s.table.headers.join("\t"));
      (s.table.rows ?? []).forEach((row) => parts.push(row.join("\t")));
    } else {
      parts.push(s.body ?? "");
    }
    parts.push("");
  });
  return parts.join("\n");
}
