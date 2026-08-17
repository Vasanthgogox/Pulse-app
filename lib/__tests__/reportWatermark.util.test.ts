import {
  PULSE_WATERMARK_PRINT_CSS,
  injectPulseWatermarkIntoHtml,
  pulseWatermarkHtmlFragment,
  wrapPrintableReportHtml,
} from "../reportWatermark.util";

describe("pulse report watermark", () => {
  it("paints the mark above table cells with print-safe rgba (not 7% opacity behind the body)", () => {
    expect(PULSE_WATERMARK_PRINT_CSS).toContain("z-index: 9999");
    expect(PULSE_WATERMARK_PRINT_CSS).toContain("rgba(77, 54, 54, 0.22)");
    expect(PULSE_WATERMARK_PRINT_CSS).not.toContain("opacity: 0.07");
  });

  it("wraps and injects the overlay after report body so print engines keep it on top", () => {
    const fragment = pulseWatermarkHtmlFragment();
    expect(fragment).toContain("pulse-watermark-layer");
    expect(fragment).toContain("pulse<span class=\"pulse-watermark-dot\">.</span>");

    const wrapped = wrapPrintableReportHtml({
      title: "Customers Report",
      bodyHtml: "<p>rows</p>",
    });
    const bodyIndex = wrapped.indexOf("pulse-report-body");
    const markIndex = wrapped.lastIndexOf("pulse-watermark-layer");
    expect(markIndex).toBeGreaterThan(bodyIndex);

    const injected = injectPulseWatermarkIntoHtml(
      "<html><head></head><body><table></table></body></html>",
    );
    expect(injected).toContain('class="pulse-watermark-layer"');
    expect(injected.lastIndexOf('class="pulse-watermark-layer"')).toBeGreaterThan(
      injected.indexOf("<table>"),
    );
  });
});
