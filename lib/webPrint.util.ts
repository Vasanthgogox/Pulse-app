/**
 * Web print — expo-print ignores `html` on web and only calls window.print()
 * on the current document. Use a hidden iframe so the report HTML is what prints.
 */

export type PrintHtmlOnWebOptions = {
  title?: string;
};

function isFullHtmlDocument(html: string): boolean {
  const t = html.trim().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
}

/**
 * Opens the system print dialog with the given HTML (Save as PDF on desktop browsers).
 * Returns false when the iframe cannot be created (very rare).
 */
export function printHtmlOnWeb(
  html: string,
  options?: PrintHtmlOnWebOptions,
): Promise<boolean> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return Promise.resolve(false);
  }

  const fullHtml = isFullHtmlDocument(html)
    ? html
    : `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>${(options?.title ?? "Document").replace(/</g, "&lt;")}</title></head><body>${html}</body></html>`;

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", options?.title ?? "Print preview");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";

    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      resolve(ok);
    };

    const cleanup = () => {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1200);
    };

    const runPrint = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        finish(false);
        return;
      }
      try {
        win.focus();
        win.print();
        finish(true);
      } catch {
        finish(false);
      } finally {
        cleanup();
      }
    };

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      cleanup();
      finish(false);
      return;
    }

    doc.open();
    doc.write(fullHtml);
    doc.close();

    window.setTimeout(runPrint, 350);
  });
}

/** Defer an action until after a React Native Web modal has unmounted. */
export function runAfterOverlayCloses(fn: () => void, delayMs = 80): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(fn, delayMs);
      });
    });
    return;
  }
  window.setTimeout(fn, delayMs);
}
