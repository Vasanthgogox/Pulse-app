/**
 * Shared print/PDF watermark for downloadable reports.
 * Uses position:fixed so the mark repeats on every printed page.
 */

export const PULSE_WATERMARK_PRINT_CSS = `
  .pulse-watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-24deg);
    font-size: 68px;
    font-weight: 900;
    font-style: italic;
    letter-spacing: 0.42em;
    color: #4f46e5;
    opacity: 0.07;
    z-index: 0;
    pointer-events: none;
    white-space: nowrap;
    user-select: none;
  }
  .pulse-report-body {
    position: relative;
    z-index: 1;
  }
  @media print {
    .pulse-watermark {
      position: fixed;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
`;

export function pulseWatermarkHtmlFragment(): string {
  return `<div class="pulse-watermark" aria-hidden="true">PULSE</div>`;
}

export type WrapPrintableReportHtmlOptions = {
  title: string;
  extraStyles?: string;
  bodyHtml: string;
  lang?: string;
};

/** Wrap report fragment in a full HTML document with centered PULSE watermark on each page. */
export function wrapPrintableReportHtml(options: WrapPrintableReportHtmlOptions): string {
  const { title, extraStyles = "", bodyHtml, lang = "en" } = options;
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    ${PULSE_WATERMARK_PRINT_CSS}
    ${extraStyles}
  </style>
</head>
<body>
  ${pulseWatermarkHtmlFragment()}
  <div class="pulse-report-body">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

/** Prepends a branded banner row for Excel exports (xlsx has no per-page watermark). */
/** Injects print CSS + fixed center watermark into an existing HTML document string. */
export function injectPulseWatermarkIntoHtml(html: string): string {
  if (html.includes("pulse-watermark")) return html;
  let result = html;
  if (result.includes("</head>")) {
    result = result.replace("</head>", `<style>${PULSE_WATERMARK_PRINT_CSS}</style></head>`);
  }
  result = result.replace(/<body([^>]*)>/i, `<body$1>${pulseWatermarkHtmlFragment()}`);
  return result;
}

export function prependPulseExcelBanner(
  rows: (string | number)[][],
  subtitle?: string,
): (string | number)[][] {
  const banner: (string | number)[][] = [["PULSE — Business Intelligence Report"]];
  if (subtitle?.trim()) banner.push([subtitle.trim()]);
  banner.push([]);
  return [...banner, ...rows];
}
